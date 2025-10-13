import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

// Definisikan tipe user untuk JWT
interface AdminUser {
  id: number;
  username: string;
  is_super_admin?: boolean;
}

interface AuthenticatedRequest extends Request {
  user: AdminUser;
}

@Controller('admins')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      // Custom error message untuk class-validator
      const messages = errors.map((error) => {
        if (error.constraints) {
          return Object.values(error.constraints).join(', ');
        }
        return `${error.property} has an invalid value`;
      });

      return new HttpException(
        {
          message: messages,
          error: 'Bad Request',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    },
  }),
)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    try {
      const admins = await this.adminService.findAll();
      return { success: true, data: admins };
    } catch (error: unknown) {
      console.error('Error in findAll:', error);
      throw new HttpException(
        'Failed to fetch admins',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    try {
      const admin = await this.adminService.findOne(+id);
      if (!admin) {
        throw new HttpException('Admin not found', HttpStatus.NOT_FOUND);
      }
      return { success: true, data: admin };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      console.error('Error in findOne:', error);
      throw new HttpException(
        'Failed to fetch admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createAdminDto: CreateAdminDto) {
    try {
      console.log('Data diterima di backend create:', createAdminDto); // DEBUG

      const admin = await this.adminService.create(createAdminDto);
      return {
        success: true,
        data: admin,
        message: 'Admin berhasil ditambahkan.',
      };
    } catch (error: unknown) {
      console.error('Error in create:', error); // DEBUG

      // Handle Prisma duplicate error
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        throw new HttpException(
          'Username or email already exists',
          HttpStatus.CONFLICT,
        );
      }

      // Handle other known errors
      if (error instanceof HttpException) {
        throw error;
      }

      // Handle validation errors from service layer
      const message = (error as { message?: string })?.message;
      if (message && message.includes('already digunakan')) {
        throw new HttpException(message, HttpStatus.CONFLICT);
      }

      throw new HttpException(
        message || 'Failed to create admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      console.log('Data diterima di backend update:', updateAdminDto); // DEBUG

      if (req.user.id === +id && updateAdminDto.is_super_admin !== undefined) {
        throw new HttpException(
          'Cannot change your own super admin status',
          HttpStatus.FORBIDDEN,
        );
      }

      const admin = await this.adminService.update(+id, updateAdminDto);
      return {
        success: true,
        data: admin,
        message: 'Admin berhasil diperbarui.',
      };
    } catch (error: unknown) {
      console.error('Error in update:', error); // DEBUG

      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        throw new HttpException(
          'Username or email already exists',
          HttpStatus.CONFLICT,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as { message?: string })?.message || 'Failed to update admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    if (req.user.id === +id) {
      throw new HttpException(
        'Tidak dapat menghapus akun sendiri.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      await this.adminService.softDelete(+id);
      return {
        success: true,
        message: 'Admin berhasil dihapus (soft delete).',
      };
    } catch (error: unknown) {
      console.error('Error in remove:', error);
      throw new HttpException(
        'Failed to delete admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard)
  async restore(@Param('id') id: string) {
    try {
      const admin = await this.adminService.restore(+id);
      return {
        success: true,
        data: admin,
        message: 'Admin berhasil dipulihkan.',
      };
    } catch (error: unknown) {
      console.error('Error in restore:', error);
      throw new HttpException(
        'Failed to restore admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id/force')
  @UseGuards(JwtAuthGuard)
  async forceDelete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    if (req.user.id === +id) {
      throw new HttpException(
        'Tidak dapat menghapus akun sendiri.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      await this.adminService.forceDelete(+id);
      return {
        success: true,
        message: 'Admin berhasil dihapus permanen.',
      };
    } catch (error: unknown) {
      console.error('Error in forceDelete:', error);
      throw new HttpException(
        'Failed to force delete admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('login')
  async login(@Body() loginAdminDto: LoginAdminDto) {
    try {
      const result = await this.adminService.login(loginAdminDto);
      return { success: true, ...result };
    } catch (error: unknown) {
      console.error('Error in login:', error);
      throw new HttpException(
        (error as { message?: string })?.message || 'Login failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout() {
    return { success: true, message: 'Logout successful' };
  }
}
