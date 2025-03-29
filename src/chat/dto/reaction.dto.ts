import { ReactionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export function isReactionType(value: unknown): value is ReactionType {
  return (
    typeof value === 'string' &&
    Object.values(ReactionType).includes(value as ReactionType) &&
    value in ReactionType
  );
}

export class CreateReactionDto {
  @IsUUID()
  messageId: string;

  @IsEnum(ReactionType)
  type!: ReactionType;

  @IsString()
  @IsOptional()
  emoji?: string;
}

export class DeleteReactionDto {
  @IsUUID()
  messageId: string;

  @IsEnum(ReactionType)
  type!: ReactionType;
}
