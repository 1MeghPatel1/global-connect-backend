import { AuthProvider } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
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
  accessToken?: string; // For OAuth providers like Google

  @IsString()
  @IsOptional()
  idToken?: string; // For OAuth providers
}
