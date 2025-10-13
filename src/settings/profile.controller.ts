import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: any;
}

@Controller('settings/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    try {
      const profile = await this.profileService.getProfile(req.user.id);
      return { success: true, data: profile };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to fetch profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    try {
      const profile = await this.profileService.updateProfile(
        req.user.id,
        updateProfileDto,
      );
      return {
        success: true,
        data: profile,
        message: 'Profil berhasil diperbarui.',
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new HttpException(
          'Username atau email sudah digunakan',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        error.message || 'Failed to update profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  async updatePassword(
    @Req() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    try {
      await this.profileService.updatePassword(req.user.id, changePasswordDto);
      return {
        success: true,
        message: 'Password berhasil diperbarui.',
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to update password',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Req() req: AuthenticatedRequest,
    @Body() deleteAccountDto: DeleteAccountDto,
  ) {
    try {
      await this.profileService.deleteAccount(req.user.id, deleteAccountDto);
      return {
        success: true,
        message: 'Akun berhasil dihapus.',
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Failed to delete account',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: AuthenticatedRequest) {
    // Logout untuk JWT biasanya di-handle di client (hapus token)
    return { success: true, message: 'Anda telah logout.' };
  }
}
