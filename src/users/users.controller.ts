import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Gender, User } from '@prisma/client';

import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { BlockUserDto } from './dto/block-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserPreferencesDto } from './dto/user-preferences.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(12), ParseIntPipe) pageSize: number,
    @Query('location') location?: string,
    @Query('gender') gender?: Gender,
    @Query('interest') interest?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('sortBy') sortBy?: 'age' | 'location',
  ) {
    return this.usersService.findAll({
      page,
      pageSize,
      location,
      gender,
      interest,
      searchTerm,
      sortBy,
    });
  }

  @Get('active')
  async getActiveUsers() {
    return this.usersService.getActiveUsers();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: { id: string },
  ) {
    if (id !== currentUser.id) {
      throw new UnauthorizedException('Cannot update other users');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() preferences: UserPreferencesDto,
  ): Promise<User> {
    return this.usersService.updatePreferences(user.id, preferences);
  }

  @Post('search')
  async searchUsers(
    @CurrentUser() user: User,
    @Body() preferences: UserPreferencesDto,
  ): Promise<User[]> {
    return this.usersService.searchUsers(user.id, preferences);
  }

  @Post('block')
  async blockUser(
    @CurrentUser() user: User,
    @Body() blockUserDto: BlockUserDto,
  ): Promise<void> {
    return this.usersService.blockUser(user.id, blockUserDto);
  }

  @Delete('block')
  async unblockUser(
    @CurrentUser() user: User,
    @Body() blockUserDto: BlockUserDto,
  ): Promise<void> {
    return this.usersService.unblockUser(user.id, blockUserDto);
  }

  @Get('blocked')
  async getBlockedUsers(@CurrentUser() user: User): Promise<User[]> {
    return this.usersService.getBlockedUsers(user.id);
  }

  @Get('blocked/:userId')
  async isUserBlocked(
    @CurrentUser() user: User,
    @Param('userId') targetUserId: string,
  ): Promise<{ isBlocked: boolean }> {
    const isBlocked = await this.usersService.isUserBlocked(
      user.id,
      targetUserId,
    );
    return { isBlocked };
  }
}
