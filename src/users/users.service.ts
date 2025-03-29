import { PrismaService } from '@/database/prisma/prisma.service';
import { Gender, Prisma, User } from '@prisma/client';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { BlockUserDto } from './dto/block-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserPreferencesDto } from './dto/user-preferences.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...createUserDto,
        gender: createUserDto.gender || Gender.PREFER_NOT_TO_SAY,
      },
    });
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    location?: string;
    gender?: Gender;
    interest?: string;
    searchTerm?: string;
    sortBy?: 'age' | 'location';
  }) {
    const {
      page = 1,
      pageSize = 12,
      location,
      gender,
      interest,
      searchTerm,
      sortBy,
    } = params;

    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      AND: [
        location ? { city: { contains: location, mode: 'insensitive' } } : {},
        gender ? { gender } : {},
        interest ? { interests: { has: interest } } : {},
        searchTerm
          ? {
              OR: [
                { username: { contains: searchTerm, mode: 'insensitive' } },
                { city: { contains: searchTerm, mode: 'insensitive' } },
                { interests: { has: searchTerm } },
              ],
            }
          : {},
      ],
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = sortBy
      ? sortBy === 'age'
        ? { age: 'desc' }
        : { city: 'asc' }
      : { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          age: true,
          city: true,
          interests: true,
          gender: true,
          avatarUrl: true,
          online: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      pageSize,
      hasMore: total > skip + users.length,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        age: true,
        city: true,
        interests: true,
        gender: true,
        avatarUrl: true,
        online: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: updateUserDto.username,
        age: updateUserDto.age,
        city: updateUserDto.location,
        interests: updateUserDto.interests,
        gender: updateUserDto.gender,
        avatarUrl: updateUserDto.avatar,
      },
      select: {
        id: true,
        username: true,
        age: true,
        city: true,
        interests: true,
        gender: true,
        avatarUrl: true,
        online: true,
      },
    });

    return user;
  }

  async remove(id: string): Promise<User> {
    // Check if user exists
    await this.findById(id);

    return this.prisma.user.delete({
      where: { id },
    });
  }

  async getActiveUsers() {
    const users = await this.prisma.user.findMany({
      where: { online: true },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
      },
    });

    return {
      data: users,
      count: users.length,
    };
  }

  async updateOnlineStatus(id: string, online: boolean) {
    await this.prisma.user.update({
      where: { id },
      data: {
        online,
        lastActive: online ? new Date() : undefined,
      },
    });
  }

  async updatePreferences(
    userId: string,
    preferences: UserPreferencesDto,
  ): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          country: preferences.country,
          state: preferences.state,
          city: preferences.city,
          genderPreference: preferences.genderPreference,
          interests: preferences.interests,
        },
      });
    } catch (error) {
      throw new NotFoundException('User not found');
    }
  }

  async searchUsers(
    userId: string,
    preferences: UserPreferencesDto,
  ): Promise<User[]> {
    const where: Prisma.UserWhereInput = {};

    if (preferences.country) {
      where.country = preferences.country;
    }
    if (preferences.state) {
      where.state = preferences.state;
    }
    if (preferences.city) {
      where.city = preferences.city;
    }
    if (preferences.genderPreference) {
      where.gender = preferences.genderPreference;
    }
    if (preferences.interests?.length) {
      where.interests = {
        hasSome: preferences.interests,
      };
    }

    // Don't return the current user
    where.id = { not: userId };

    return this.prisma.user.findMany({
      where,
      take: 50,
    });
  }

  async blockUser(userId: string, blockUserDto: BlockUserDto): Promise<void> {
    if (userId === blockUserDto.blockedUserId) {
      throw new BadRequestException('Cannot block yourself');
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          blockedUsers: {
            connect: { id: parseInt(blockUserDto.blockedUserId) },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User to block not found');
      }
      throw error;
    }
  }

  async unblockUser(userId: string, blockUserDto: BlockUserDto): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          blockedUsers: {
            disconnect: { id: parseInt(blockUserDto.blockedUserId) },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User to unblock not found');
      }
      throw error;
    }
  }

  async getBlockedUsers(userId: string): Promise<User[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        blockedUsers: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.blockedUsers.map((block) => block.user);
  }

  async isUserBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { blockedUsers: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.blockedUsers.some(
      (blockedUser) => blockedUser.id.toString() === targetUserId,
    );
  }
}
