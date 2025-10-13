import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async findAll() {
    return this.prisma.admin.findMany({
      where: { deleted_at: null },
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

  async findOne(id: number) {
    const admin = await this.prisma.admin.findFirst({
      where: { id, deleted_at: null },
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

    if (!admin) throw new NotFoundException('Admin tidak ditemukan');
    return admin;
  }

  async create(createAdminDto: CreateAdminDto) {
    const existingAdmin = await this.prisma.admin.findFirst({
      where: {
        OR: [
          { username: createAdminDto.username },
          { email: createAdminDto.email },
        ],
        deleted_at: null,
      },
    });

    if (existingAdmin) {
      throw new ConflictException('Username atau email sudah digunakan');
    }

    const hashedPassword = await bcrypt.hash(createAdminDto.password, 10);

    return this.prisma.admin.create({
      data: {
        nama_lengkap: createAdminDto.nama_lengkap,
        username: createAdminDto.username,
        email: createAdminDto.email,
        password: hashedPassword,
        is_super_admin: createAdminDto.is_super_admin || false,
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

  async update(id: number, updateAdminDto: UpdateAdminDto) {
    const existingAdmin = await this.prisma.admin.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existingAdmin) throw new NotFoundException('Admin tidak ditemukan');

    // Check duplicates
    if (updateAdminDto.username || updateAdminDto.email) {
      const duplicateAdmin = await this.prisma.admin.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { deleted_at: null },
            {
              OR: [
                updateAdminDto.username
                  ? { username: updateAdminDto.username }
                  : {},
                updateAdminDto.email ? { email: updateAdminDto.email } : {},
              ],
            },
          ],
        },
      });
      if (duplicateAdmin) {
        throw new ConflictException('Username atau email sudah digunakan');
      }
    }

    // Define typed data object
    const data: Partial<Admin> = {
      nama_lengkap: updateAdminDto.nama_lengkap,
      username: updateAdminDto.username,
      email: updateAdminDto.email,
      is_super_admin: updateAdminDto.is_super_admin,
    };

    if (updateAdminDto.password) {
      data.password = await bcrypt.hash(updateAdminDto.password, 10);
    }

    return this.prisma.admin.update({
      where: { id },
      data,
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

  async softDelete(id: number) {
    const admin = await this.prisma.admin.findFirst({
      where: { id, deleted_at: null },
    });
    if (!admin) throw new NotFoundException('Admin tidak ditemukan');

    return this.prisma.admin.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async restore(id: number) {
    const admin = await this.prisma.admin.findFirst({ where: { id } });
    if (!admin) throw new NotFoundException('Admin tidak ditemukan');
    if (!admin.deleted_at)
      throw new ConflictException('Admin tidak dalam status terhapus');

    return this.prisma.admin.update({
      where: { id },
      data: { deleted_at: null },
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

  async forceDelete(id: number) {
    const admin = await this.prisma.admin.findFirst({ where: { id } });
    if (!admin) throw new NotFoundException('Admin tidak ditemukan');

    return this.prisma.admin.delete({ where: { id } });
  }

  async login(loginAdminDto: LoginAdminDto) {
    const admin = await this.prisma.admin.findFirst({
      where: { username: loginAdminDto.username, deleted_at: null },
    });

    if (
      !admin ||
      !(await bcrypt.compare(loginAdminDto.password, admin.password))
    ) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const payload = {
      username: admin.username,
      sub: admin.id,
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

  async findAllWithTrashed() {
    return this.prisma.admin.findMany({
      select: {
        id: true,
        nama_lengkap: true,
        username: true,
        email: true,
        is_super_admin: true,
        deleted_at: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}
