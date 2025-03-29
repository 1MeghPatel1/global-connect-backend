import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { WsJwtAuthGuard } from '@/auth/guards/ws-jwt-auth.guard';
import { ConfigurationService } from '@/configuration/configuration.service';
import { UsersService } from '@/users/users.service';
import {
  Message,
  MessageContentType,
  MessageStatus,
  Reaction,
  ReactionType,
  User,
} from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

interface SocketWithUser extends Socket {
  data: {
    user: Pick<User, 'id' | 'username' | 'email' | 'isAnonymous'>;
  };
}

type ConversationWithParticipants = {
  id: string;
  participants: {
    id: string;
    username: string;
  }[];
  lastMessage?: {
    id: string;
    content: string;
    createdAt: Date;
  } | null;
};

type MessageWithSender = {
  id: string;
  content: string;
  sender: {
    id: string;
    username: string;
  };
};

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
@UseGuards(WsJwtAuthGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
    private readonly config: ConfigurationService,
  ) {}

  async handleConnection(client: SocketWithUser) {
    const userId = client.data.user.id;
    await this.usersService.updateOnlineStatus(userId, true);

    // Join user's room
    await client.join(`user:${userId}`);

    // Notify others that user is online
    this.server.emit('user:status', {
      userId,
      status: 'online',
      lastSeen: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: SocketWithUser) {
    const userId = client.data.user.id;
    await this.usersService.updateOnlineStatus(userId, false);

    // Leave user's room
    await client.leave(`user:${userId}`);

    // Notify others that user is offline
    this.server.emit('user:status', {
      userId,
      status: 'offline',
      lastSeen: new Date().toISOString(),
    });
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversationRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody('conversationId') conversationId: string,
  ) {
    await client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversationRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody('conversationId') conversationId: string,
  ) {
    await client.leave(`conversation:${conversationId}`);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody()
    payload: {
      conversationId: number;
      content: string;
      contentType?: MessageContentType;
    },
  ) {
    const userId = client.data.user.id;
    const message = await this.chatService.sendMessage(
      payload.conversationId,
      userId,
      payload.content,
      payload.contentType,
    );

    // Emit message to conversation room
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('message:new', {
        ...message,
        conversationId: payload.conversationId,
      });

    // Update conversation for all participants
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('conversation:updated', {
        id: payload.conversationId,
        lastMessage: {
          id: message.id,
          content: message.content,
          senderId: userId,
          createdAt: message.createdAt,
        },
        updatedAt: message.createdAt,
      });
  }

  @SubscribeMessage('user:activity:update')
  handleUserActivity(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody()
    payload: {
      action: 'typing' | 'idle';
      conversationId: string;
    },
  ) {
    const userId = client.data.user.id;
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('user:activity', {
        userId,
        action: payload.action,
        conversationId: payload.conversationId,
      });
  }

  @SubscribeMessage('message:mark-seen')
  async handleMarkSeen(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody('conversationId') conversationId: number,
  ) {
    const userId = client.data.user.id;
    const result = await this.chatService.markMessagesAsSeen(
      conversationId,
      userId,
    );

    if (result.success) {
      this.server.to(`conversation:${conversationId}`).emit('message:seen', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('createConversation')
  async handleCreateConversation(
    @ConnectedSocket() client: Socket & { user: User },
    @MessageBody() data: CreateConversationDto,
  ): Promise<
    { conversation: ConversationWithParticipants } | { error: string }
  > {
    // Check if either user has blocked the other
    const isBlocked = await this.usersService.isUserBlocked(
      client.user.id,
      data.participantId,
    );
    const isBlockedBy = await this.usersService.isUserBlocked(
      data.participantId,
      client.user.id,
    );

    if (isBlocked || isBlockedBy) {
      return { error: 'Cannot create conversation due to blocking' };
    }

    const conversation = (await this.chatService.createConversation([
      client.user.id,
      data.participantId,
    ])) as ConversationWithParticipants;

    // Join the room
    await client.join(conversation.id);
    client.to(data.participantId).emit('conversationCreated', { conversation });

    return { conversation };
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket & { user: User },
    @MessageBody() data: SendMessageDto,
  ): Promise<{ message: MessageWithSender } | { error: string }> {
    const conversation = await this.chatService.getConversation(
      data.conversationId,
    );

    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    const message = await this.chatService.createMessage(
      data.conversationId,
      client.user.id,
      data.content,
    );

    // Emit to all participants
    for (const participant of conversation.participants) {
      if (participant.id !== client.user.id) {
        client.to(participant.id).emit('newMessage', {
          conversationId: data.conversationId,
          message,
        });
      }
    }

    return { message };
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversationParticipant(
    @ConnectedSocket() client: Socket & { user: User },
    @MessageBody() data: { conversationId: string },
  ): Promise<{ success: boolean } | { error: string }> {
    const conversation = await this.chatService.getConversation(
      data.conversationId,
    );
    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.id === client.user.id,
    );
    if (!isParticipant) {
      return { error: 'Not a participant in this conversation' };
    }

    // Check if any participant has blocked the user
    for (const participant of conversation.participants) {
      if (participant.id === client.user.id) continue;

      const isBlocked = await this.usersService.isUserBlocked(
        client.user.id,
        participant.id,
      );
      const isBlockedBy = await this.usersService.isUserBlocked(
        participant.id,
        client.user.id,
      );

      if (isBlocked || isBlockedBy) {
        return { error: 'Cannot join conversation due to blocking' };
      }
    }

    // Join the room
    await client.join(conversation.id);
    return { success: true };
  }

  @SubscribeMessage('leaveConversation')
  async handleLeaveConversationParticipant(
    @ConnectedSocket() client: Socket & { user: User },
    @MessageBody() data: { conversationId: string },
  ): Promise<{ success: boolean }> {
    await client.leave(data.conversationId);
    return { success: true };
  }

  @SubscribeMessage('message.reaction')
  async handleMessageReaction(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: User,
    @MessageBody() data: { messageId: string; type: string; emoji?: string },
  ) {
    try {
      const message = (await this.chatService.addReaction(user.id, {
        messageId: data.messageId,
        type: data.type as ReactionType,
        emoji: data.emoji,
      })) as Message & { reactions: Reaction[] };

      // Emit to all users in the connection
      this.server
        .to(`connection_${message.connectionId}`)
        .emit('message.reaction', {
          messageId: message.id,
          reaction: message.reactions[message.reactions.length - 1],
        });

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @SubscribeMessage('message.reaction.remove')
  async handleMessageReactionRemove(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: User,
    @MessageBody() data: { messageId: string; type: string },
  ) {
    try {
      const message = await this.chatService.removeReaction(
        user.id,
        data.messageId,
        data.type as ReactionType,
      );

      // Emit to all users in the connection
      this.server
        .to(`connection_${message.connectionId}`)
        .emit('message.reaction.remove', {
          messageId: message.id,
          userId: user.id,
          type: data.type,
        });

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @SubscribeMessage('message.status')
  async handleMessageStatus(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: User,
    @MessageBody() data: { messageId: string; status: string },
  ) {
    try {
      const message = await this.chatService.updateMessageStatus(
        data.messageId,
        data.status as MessageStatus,
      );

      // Emit to all users in the connection
      this.server
        .to(`connection_${message.connectionId}`)
        .emit('message.status', {
          messageId: message.id,
          status: message.status,
        });

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @SubscribeMessage('message.read')
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: User,
    @MessageBody() data: { messageId: string },
  ) {
    try {
      const message = await this.chatService.markMessageAsRead(data.messageId);

      // Emit to all users in the connection
      this.server
        .to(`connection_${message.connectionId}`)
        .emit('message.read', {
          messageId: message.id,
          isRead: true,
          status: message.status,
        });

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
