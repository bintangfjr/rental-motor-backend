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
  async adminLogin(loginAdminDto: LoginAdminDto) {
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

    const payload = {
      sub: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
    };

    return {
      access_token: this.jwtService.sign(payload),
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
  async changePassword(adminId: number, dto: ChangePasswordDto) {
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
  async getAdminProfile(adminId: number) {
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
  async validateAdmin(payload: any): Promise<AdminPayload | null> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin) return null;

    return {
      id: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
    };
  }
}
