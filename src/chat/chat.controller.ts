import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  MessageContentType,
  MessageStatus,
  ReactionType,
} from '@prisma/client';
import { User } from '@prisma/client';

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateReactionDto } from './dto/reaction.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@CurrentUser() user: User) {
    return this.chatService.getConversations(user.id);
  }

  @Get('conversations/:id')
  async getConversation(@CurrentUser() user: User, @Param('id') id: string) {
    return this.chatService.getConversation(id);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.chatService.getMessages(id);
  }

  @Post('conversations')
  async createConversation(
    @CurrentUser() user: User,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    return this.chatService.createConversation([
      user.id,
      createConversationDto.participantId,
    ]);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body('content') content: string,
    @Body('contentType')
    contentType: MessageContentType = MessageContentType.TEXT,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.sendMessage(id, user.id, content, contentType);
  }

  @Post('conversations/:id/seen')
  async markMessagesAsSeen(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.markMessagesAsSeen(id, user.id);
  }

  @Post('messages/:messageId/reactions')
  async addReaction(@CurrentUser() user: User, @Body() dto: CreateReactionDto) {
    return this.chatService.addReaction(user.id, dto);
  }

  @Delete('messages/:messageId/reactions/:type')
  async removeReaction(
    @CurrentUser() user: User,
    @Param('messageId') messageId: string,
    @Param('type') type: ReactionType,
  ) {
    return this.chatService.removeReaction(user.id, messageId, type);
  }

  @Patch('messages/:messageId/status')
  async updateMessageStatus(
    @Param('messageId') messageId: string,
    @Body('status') status: MessageStatus,
  ) {
    return this.chatService.updateMessageStatus(messageId, status);
  }

  @Patch('messages/:messageId/read')
  async markMessageAsRead(@Param('messageId') messageId: string) {
    return this.chatService.markMessageAsRead(messageId);
  }
}
