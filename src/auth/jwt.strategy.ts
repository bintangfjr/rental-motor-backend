import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  // Diubah dari 'jwt-admin' menjadi 'jwt'
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret-key',
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    // Check if token has required properties
    if (!payload.sub || !payload.username) {
      throw new UnauthorizedException('Token tidak valid');
    }

    try {
      // For admin authentication only - check if admin exists and is not deleted
      const admin = await this.prisma.admin.findFirst({
        where: {
          id: payload.sub,
          deleted_at: null, // Exclude soft-deleted admins
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

      if (!admin) {
        throw new UnauthorizedException(
          'Admin tidak ditemukan atau akun telah dihapus',
        );
      }

      // Return user object that will be attached to request
      return {
        id: admin.id,
        sub: admin.id, // Maintain consistency with JWT standard
        username: admin.username,
        email: admin.email,
        nama_lengkap: admin.nama_lengkap,
        is_super_admin: admin.is_super_admin,
        isAdmin: true, // Flag to identify this is an admin user
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Gagal memvalidasi token');
    }
  }
}
