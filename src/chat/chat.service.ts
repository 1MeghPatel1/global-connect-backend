import { PrismaService } from '@/database/prisma/prisma.service';
import {
  ConnectionStatus,
  Message,
  MessageContentType,
  MessageStatus,
  Prisma,
  ReactionType,
} from '@prisma/client';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateReactionDto } from './dto/reaction.dto';

function isReactionType(value: unknown): value is ReactionType {
  return (
    typeof value === 'string' &&
    Object.values(ReactionType).includes(value as ReactionType)
  );
}

type ConnectionWithRelations = Prisma.ConnectionGetPayload<{
  include: {
    requester: true;
    receiver: true;
    messages: true;
    _count: {
      select: {
        messages: true;
      };
    };
  };
}>;

type MessageWithSender = Prisma.MessageGetPayload<{
  include: {
    sender: {
      select: {
        id: true;
        username: true;
        avatarUrl: true;
      };
    };
  };
}>;

type ConversationWithParticipants = Prisma.ConversationGetPayload<{
  include: {
    participants: true;
    lastMessage: true;
  };
}>;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getConversations(userId: string): Promise<ConnectionWithRelations[]> {
    return this.prisma.connection.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
        status: 'ACCEPTED',
      },
      include: {
        requester: true,
        receiver: true,
        messages: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
  }

  async getMessages(
    connectionId: number,
    params?: { page?: number; pageSize?: number },
  ): Promise<MessageWithSender[]> {
    const { page = 1, pageSize = 20 } = params || {};
    const skip = params ? (page - 1) * pageSize : undefined;
    const take = params ? pageSize : undefined;

    return this.prisma.message.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      skip,
      take,
    });
  }

  async sendMessage(
    connectionId: number,
    userId: string,
    content: string,
    contentType: MessageContentType = MessageContentType.TEXT,
  ): Promise<Message> {
    const connection = await this.prisma.connection.findFirst({
      where: {
        id: connectionId,
        OR: [{ requesterId: userId }, { receiverId: userId }],
        status: 'ACCEPTED',
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    return this.prisma.message.create({
      data: {
        content,
        connectionId,
        conversationId: connectionId.toString(),
        senderId: userId,
        contentType,
        status: MessageStatus.SENT,
      },
    });
  }

  async markMessagesAsSeen(connectionId: number, userId: string) {
    const connection = await this.prisma.connection.findFirst({
      where: {
        id: connectionId,
        OR: [{ requesterId: userId }, { receiverId: userId }],
        status: 'ACCEPTED',
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    return {
      success: true,
      updatedCount: 0,
    };
  }

  async getConnectionDetails(
    connectionId: number,
  ): Promise<ConnectionWithRelations> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      include: {
        requester: true,
        receiver: true,
        messages: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    return connection;
  }

  async updateConnectionStatus(
    connectionId: number,
    status: ConnectionStatus,
  ): Promise<{
    updatedCount: number;
  }> {
    await this.prisma.connection.update({
      where: { id: connectionId },
      data: { status },
    });

    return {
      updatedCount: 0,
    };
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sender.id !== userId) {
      throw new Error('Unauthorized to delete this message');
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });
  }

  async addReaction(userId: string, dto: CreateReactionDto): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      include: { reactions: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user already reacted with this type
    const existingReaction = message.reactions.find(
      (r) => r.userId === userId && r.type === dto.type,
    );

    if (existingReaction) {
      throw new BadRequestException('Reaction already exists');
    }

    await this.prisma.reaction.create({
      data: {
        type: dto.type,
        emoji: dto.emoji,
        messageId: dto.messageId,
        userId,
      },
    });

    const updatedMessage = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      include: {
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!updatedMessage) {
      throw new NotFoundException('Message not found after adding reaction');
    }

    return updatedMessage;
  }

  async removeReaction(
    userId: string,
    messageId: string,
    type: string,
  ): Promise<Message> {
    if (!isReactionType(type)) {
      throw new BadRequestException(
        `Invalid reaction type. Valid types are: ${Object.values(ReactionType).join(', ')}`,
      );
    }

    const reaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        userId,
        type,
      },
    });

    if (!reaction) {
      throw new NotFoundException('Reaction not found');
    }

    await this.prisma.reaction.delete({
      where: { id: reaction.id },
    });

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
  ): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { status },
      include: {
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async markMessageAsRead(messageId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        isRead: true,
        status: MessageStatus.READ,
      },
      include: {
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async createConversation(
    participantIds: string[],
  ): Promise<ConversationWithParticipants> {
    return this.prisma.conversation.create({
      data: {
        participants: {
          connect: participantIds.map((id) => ({ id })),
        },
      },
      include: {
        participants: true,
        lastMessage: true,
      },
    });
  }

  async createMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<MessageWithSender> {
    // Get the conversation first
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Find or create connection
    const otherParticipant = conversation.participants.find(
      (p) => p.id !== senderId,
    );
    if (!otherParticipant) {
      throw new BadRequestException(
        'No other participant found in conversation',
      );
    }

    let connection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: senderId, receiverId: otherParticipant.id },
          { requesterId: otherParticipant.id, receiverId: senderId },
        ],
        status: 'ACCEPTED',
      },
    });

    if (!connection) {
      connection = await this.prisma.connection.create({
        data: {
          requesterId: senderId,
          receiverId: otherParticipant.id,
          status: 'ACCEPTED',
        },
      });
    }

    // Create the message with all required fields
    return this.prisma.message.create({
      data: {
        content,
        senderId,
        conversationId,
        connectionId: connection.id,
        status: MessageStatus.SENT,
        contentType: MessageContentType.TEXT,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async getConversation(
    id: string,
  ): Promise<ConversationWithParticipants | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        lastMessage: true,
      },
    });
  }
}
