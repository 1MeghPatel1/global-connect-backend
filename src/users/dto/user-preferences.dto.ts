import { Gender } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class UserPreferencesDto {
  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsEnum(Gender)
  @IsOptional()
  genderPreference?: Gender;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  interests?: string[];
}
