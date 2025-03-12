import { AuthProvider, Gender } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsEnum(AuthProvider)
  @IsNotEmpty()
  provider: AuthProvider;

  @IsString()
  @IsOptional()
  accessToken?: string; // For OAuth providers

  @IsString()
  @IsOptional()
  idToken?: string; // For OAuth providers

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
