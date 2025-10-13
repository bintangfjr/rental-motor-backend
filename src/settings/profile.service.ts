import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(adminId: number) {
    return this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        nama_lengkap: true,
        username: true,
        email: true,
        is_super_admin: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async updateProfile(adminId: number, updateProfileDto: UpdateProfileDto) {
    return this.prisma.admin.update({
      where: { id: adminId },
      data: {
        nama_lengkap: updateProfileDto.nama_lengkap,
        username: updateProfileDto.username,
        email: updateProfileDto.email,
      },
      select: {
        id: true,
        nama_lengkap: true,
        username: true,
        email: true,
        is_super_admin: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async updatePassword(adminId: number, changePasswordDto: ChangePasswordDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    // Verify current password
    if (
      !(await bcrypt.compare(
        changePasswordDto.current_password,
        admin.password,
      ))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Check if new password matches confirmation
    if (
      changePasswordDto.password !== changePasswordDto.password_confirmation
    ) {
      throw new BadRequestException('Password confirmation does not match');
    }

    // Update password
    const hashedPassword = await bcrypt.hash(changePasswordDto.password, 10);

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { password: hashedPassword },
    });
  }

  async deleteAccount(adminId: number, deleteAccountDto: DeleteAccountDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    // Verify password
    if (!(await bcrypt.compare(deleteAccountDto.password, admin.password))) {
      throw new BadRequestException('Password is incorrect');
    }

    // Check if admin is the last super admin
    if (admin.is_super_admin) {
      const superAdminCount = await this.prisma.admin.count({
        where: {
          is_super_admin: true,
          id: { not: adminId },
        },
      });

      if (superAdminCount === 0) {
        throw new ForbiddenException(
          'Tidak dapat menghapus akun. Harus ada setidaknya satu super admin yang tersisa.',
        );
      }
    }

    // Delete admin account
    await this.prisma.admin.delete({
      where: { id: adminId },
    });
  }
}
