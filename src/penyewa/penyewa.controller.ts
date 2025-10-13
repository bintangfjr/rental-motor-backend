import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PenyewaService } from './penyewa.service';
import { CreatePenyewaDto } from './dto/create-penyewa.dto';
import { UpdatePenyewaDto } from './dto/update-penyewa.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('penyewas')
export class PenyewaController {
  constructor(private readonly penyewaService: PenyewaService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    try {
      const penyewas = await this.penyewaService.findAll();
      return { success: true, data: penyewas };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch penyewas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    try {
      const penyewa = await this.penyewaService.findOne(+id); // ✅ Kembali ke konversi
      return { success: true, data: penyewa };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch penyewa',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('foto_ktp', {
      storage: diskStorage({
        destination: './uploads/fotos_penyewa',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return callback(new Error('Only image files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  )
  async create(
    @Body() createPenyewaDto: CreatePenyewaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      const penyewa = await this.penyewaService.create(createPenyewaDto, file);
      return {
        success: true,
        data: penyewa,
        message: 'Penyewa berhasil ditambahkan.',
      };
    } catch (error: unknown) {
      // Handle Prisma unique constraint error
      if (
        this.isPrismaClientKnownRequestError(error) &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Nomor WhatsApp already exists',
          HttpStatus.CONFLICT,
        );
      }

      // Handle other errors with proper type checking
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create penyewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('foto_ktp', {
      storage: diskStorage({
        destination: './uploads/fotos_penyewa',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return callback(new Error('Only image files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updatePenyewaDto: UpdatePenyewaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      const penyewa = await this.penyewaService.update(
        +id, // ✅ Kembali ke konversi
        updatePenyewaDto,
        file,
      );
      return {
        success: true,
        data: penyewa,
        message: 'Data penyewa berhasil diperbarui.',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      // Handle Prisma unique constraint error
      if (
        this.isPrismaClientKnownRequestError(error) &&
        error.code === 'P2002'
      ) {
        throw new HttpException(
          'Nomor WhatsApp already exists',
          HttpStatus.CONFLICT,
        );
      }

      // Handle other errors with proper type checking
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update penyewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id/blacklist')
  @UseGuards(JwtAuthGuard)
  async toggleBlacklist(@Param('id') id: string) {
    try {
      const penyewa = await this.penyewaService.toggleBlacklist(+id); // ✅ Kembali ke konversi
      const message = penyewa.is_blacklisted
        ? 'Penyewa berhasil ditambahkan ke daftar hitam.'
        : 'Penyewa berhasil dihapus dari daftar hitam.';

      return {
        success: true,
        data: penyewa,
        message,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to toggle blacklist status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    try {
      const result = await this.penyewaService.remove(+id); // ✅ Kembali ke konversi
      return {
        success: true,
        message: result.message,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      // Handle other errors with proper type checking
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete penyewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Type guard untuk Prisma errors
  private isPrismaClientKnownRequestError(
    error: unknown,
  ): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as any).code === 'string'
    );
  }
}
