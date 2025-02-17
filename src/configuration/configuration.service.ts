import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  get<T = string>(key: string): T {
    const value = this.configService.get<T>(key);

    if (!value || typeof value !== 'string') {
      throw new Error(`${key} is not a string or is missing`);
    }

    return value;
  }
}
