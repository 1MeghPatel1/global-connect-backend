import { IsNotEmpty, IsString } from 'class-validator';

export class LeaveConversationDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}
