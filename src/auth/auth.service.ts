import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { LoginAdminDto } from './dto/login-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

// Interface untuk payload JWT
export interface JwtPayload {
  sub: number;
  username: string;
  is_super_admin: boolean;
  iat?: number;
  exp?: number;
}

// Interface untuk response admin
export interface AdminResponse {
  id: number;
  nama_lengkap: string;
  username: string;
  email: string;
  is_super_admin: boolean;
  created_at?: Date;
  updated_at?: Date;
}

// Interface untuk admin payload (digunakan dalam context)
export interface AdminPayload {
  id: number;
  username: string;
  is_super_admin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Login Admin
  async adminLogin(loginAdminDto: LoginAdminDto): Promise<{
    access_token: string;
    admin: AdminResponse;
  }> {
    const admin = await this.prisma.admin.findUnique({
      where: { username: loginAdminDto.username },
    });

    if (!admin) {
      throw new UnauthorizedException('Username atau password salah.');
    }

    const isPasswordValid = await bcrypt.compare(
      loginAdminDto.password,
      admin.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Username atau password salah.');
    }

    const payload: JwtPayload = {
      sub: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      admin: {
        id: admin.id,
        nama_lengkap: admin.nama_lengkap,
        username: admin.username,
        email: admin.email,
        is_super_admin: admin.is_super_admin,
      },
    };
  }

  // Ganti Password Admin
  async changePassword(
    adminId: number,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin tidak ditemukan.');
    }

    // Verifikasi password lama
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.current_password,
      admin.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Password lama salah.');
    }

    // Verifikasi konfirmasi password baru
    if (dto.password !== dto.password_confirmation) {
      throw new BadRequestException('Password konfirmasi tidak cocok.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { password: hashedPassword },
    });

    return { message: 'Password berhasil diperbarui.' };
  }

  // Ambil profil admin
  async getAdminProfile(adminId: number): Promise<AdminResponse> {
    const admin = await this.prisma.admin.findUnique({
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

    if (!admin) {
      throw new UnauthorizedException('Admin tidak ditemukan.');
    }

    return admin;
  }

  // Validasi admin dari JWT
  async validateAdmin(payload: JwtPayload): Promise<AdminPayload | null> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin) {
      return null;
    }

    return {
      id: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
    };
  }

  // Logout Admin (Optional - untuk future implementation)
  async adminLogout(adminId: number): Promise<{ message: string }> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin tidak ditemukan.');
    }

    // Di sini Anda bisa menambahkan logika untuk:
    // 1. Menambahkan token ke blacklist (jika menggunakan JWT blacklist)
    // 2. Update last_logout_at field (jika ada di model Admin)
    // 3. Membersihkan session data

    return {
      message: 'Logout berhasil.',
    };
  }
}
