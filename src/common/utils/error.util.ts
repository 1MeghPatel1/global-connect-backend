import { Prisma } from '@prisma/client';

import { Logger } from '@nestjs/common';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export class ErrorUtil {
  private static readonly logger = new Logger('ErrorUtil');

  static handleError(error: unknown, context: string): never {
    // Log the error with context
    this.logger.error(
      `Error in ${context}: ${this.getErrorMessage(error)}`,
      this.getErrorStack(error),
    );

    // Handle Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': // Unique constraint violation
          throw new BadRequestException(
            'A record with this value already exists.',
          );
        case 'P2025': // Record not found
          throw new NotFoundException('Record not found.');
        case 'P2003': // Foreign key constraint failed
          throw new BadRequestException('Related record does not exist.');
        default:
          throw new InternalServerErrorException('Database error occurred.');
      }
    }

    // Handle other types of errors
    if (error instanceof UnauthorizedException) {
      throw error; // Re-throw authentication errors as-is
    }

    if (error instanceof BadRequestException) {
      throw error; // Re-throw validation errors as-is
    }

    // For unknown errors, throw a generic error
    throw new InternalServerErrorException('An unexpected error occurred.');
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private static getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.stack;
    }
    return undefined;
  }
}
