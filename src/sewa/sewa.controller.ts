import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Req,
  Query,
} from '@nestjs/common';
import { SewaService } from './sewa.service';
import { CreateSewaDto } from './dto/create-sewa.dto';
import { UpdateSewaDto } from './dto/update-sewa.dto';
import { SelesaiSewaDto } from './dto/selesai-sewa.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    nama_lengkap: string;
    username: string;
    email: string;
    is_super_admin: boolean;
  };
}

interface UpdateNotesDto {
  catatan_tambahan: string;
}

interface PerpanjangSewaDto {
  tgl_kembali_baru: string;
}

// ✅ Response interface untuk standardisasi
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

@Controller('sewas')
export class SewaController {
  constructor(private readonly sewaService: SewaService) {}

  // ✅ Helper method untuk error handling
  private handleError(error: unknown, defaultMessage: string): never {
    console.error('Controller Error:', error);

    if (error instanceof HttpException) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : defaultMessage;

    // ✅ Tentukan status code berdasarkan error type
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

    if (errorMessage.includes('tidak ditemukan')) {
      statusCode = HttpStatus.NOT_FOUND;
    } else if (
      errorMessage.includes('tidak tersedia') ||
      errorMessage.includes('tidak valid') ||
      errorMessage.includes('harus setelah') ||
      errorMessage.includes('masa lalu') ||
      errorMessage.includes('masa depan')
    ) {
      statusCode = HttpStatus.BAD_REQUEST;
    }

    throw new HttpException(errorMessage, statusCode);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query('status') status?: string): Promise<ApiResponse<any>> {
    try {
      console.log('Fetching all sewas with status:', status || 'all');

      const sewas = await this.sewaService.findAll(status);

      return {
        success: true,
        data: sewas,
        message: 'Data sewa berhasil diambil',
        meta: {
          total: sewas.length,
        },
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal mengambil data sewa');
    }
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  async findActive(): Promise<ApiResponse<any>> {
    try {
      console.log('Fetching active sewas');

      const sewas = await this.sewaService.findActive();

      return {
        success: true,
        data: sewas,
        message: 'Data sewa aktif berhasil diambil',
        meta: {
          total: sewas.length,
        },
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal mengambil data sewa aktif');
    }
  }

  @Get('overdue')
  @UseGuards(JwtAuthGuard)
  async findOverdue(): Promise<ApiResponse<any>> {
    try {
      console.log('Fetching overdue sewas');

      const sewas = await this.sewaService.findOverdue();

      return {
        success: true,
        data: sewas,
        message: 'Data sewa overdue berhasil diambil',
        meta: {
          total: sewas.length,
        },
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal mengambil data sewa overdue');
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<ApiResponse<any>> {
    try {
      console.log(`Fetching sewa ID: ${id}`);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      const sewa = await this.sewaService.findOne(sewaId);

      return {
        success: true,
        data: sewa,
        message: 'Data sewa berhasil diambil',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal mengambil data sewa');
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createSewaDto: CreateSewaDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<any>> {
    try {
      console.log('Creating new sewa with data:', {
        ...createSewaDto,
        adminId: req.user.id,
      });

      // ✅ Validasi basic
      if (!createSewaDto.motor_id || !createSewaDto.penyewa_id) {
        throw new BadRequestException('Motor ID dan Penyewa ID harus diisi');
      }

      const sewa = await this.sewaService.create(createSewaDto, req.user.id);

      return {
        success: true,
        data: sewa,
        message: 'Sewa berhasil ditambahkan',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal membuat sewa');
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateSewaDto: UpdateSewaDto,
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`Updating sewa ID ${id} with data:`, updateSewaDto);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      // ✅ Validasi data update tidak kosong
      if (Object.keys(updateSewaDto).length === 0) {
        throw new BadRequestException('Tidak ada data yang akan diupdate');
      }

      const sewa = await this.sewaService.update(sewaId, updateSewaDto);

      return {
        success: true,
        data: sewa,
        message: 'Sewa berhasil diperbarui',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal memperbarui sewa');
    }
  }

  @Put(':id/perpanjang')
  @UseGuards(JwtAuthGuard)
  async perpanjang(
    @Param('id') id: string,
    @Body() perpanjangSewaDto: PerpanjangSewaDto,
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`Memperpanjang sewa ID ${id}:`, perpanjangSewaDto);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      // ✅ Validasi tanggal kembali baru
      if (!perpanjangSewaDto.tgl_kembali_baru) {
        throw new BadRequestException('Tanggal kembali baru harus diisi');
      }

      const result = await this.sewaService.perpanjang(
        sewaId,
        perpanjangSewaDto,
      );

      return {
        success: true,
        data: result,
        message: 'Sewa berhasil diperpanjang',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal memperpanjang sewa');
    }
  }

  @Post(':id/selesai')
  @UseGuards(JwtAuthGuard)
  async selesai(
    @Param('id') id: string,
    @Body() selesaiSewaDto: SelesaiSewaDto,
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`Menyelesaikan sewa ID ${id}:`, selesaiSewaDto);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      // ✅ Validasi tanggal selesai
      if (!selesaiSewaDto.tgl_selesai) {
        throw new BadRequestException('Tanggal selesai harus diisi');
      }

      const result = await this.sewaService.selesai(sewaId, selesaiSewaDto);

      return {
        success: true,
        data: result,
        message: 'Sewa berhasil diselesaikan',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal menyelesaikan sewa');
    }
  }

  @Put(':id/notes')
  @UseGuards(JwtAuthGuard)
  async updateNotes(
    @Param('id') id: string,
    @Body() updateNotesDto: UpdateNotesDto,
  ): Promise<ApiResponse<any>> {
    try {
      console.log(`Updating notes for sewa ID ${id}:`, updateNotesDto);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      const sewa = await this.sewaService.updateNotes(
        sewaId,
        updateNotesDto.catatan_tambahan,
      );

      return {
        success: true,
        data: sewa,
        message: 'Catatan berhasil diperbarui',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal memperbarui catatan');
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string): Promise<ApiResponse<void>> {
    try {
      console.log(`Deleting sewa ID ${id}`);

      // ✅ Validasi ID
      const sewaId = parseInt(id, 10);
      if (isNaN(sewaId) || sewaId <= 0) {
        throw new BadRequestException('ID sewa tidak valid');
      }

      const result = await this.sewaService.remove(sewaId);

      return {
        success: true,
        message: result.message,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal menghapus sewa');
    }
  }

  // ✅ ENDPOINT BARU: Get statistics
  @Get('stats/overview')
  @UseGuards(JwtAuthGuard)
  async getStats(): Promise<ApiResponse<any>> {
    try {
      console.log('Fetching sewa statistics');

      const [active, overdue, allSewas] = await Promise.all([
        this.sewaService.findActive(),
        this.sewaService.findOverdue(),
        this.sewaService.findAll(),
      ]);

      const stats = {
        total: allSewas.length,
        active: active.length,
        overdue: overdue.length,
        completed: allSewas.filter((s) => s.status === 'selesai').length,
      };

      return {
        success: true,
        data: stats,
        message: 'Statistik sewa berhasil diambil',
      };
    } catch (error: unknown) {
      this.handleError(error, 'Gagal mengambil statistik sewa');
    }
  }
}

// ✅ Import yang diperlukan
import { BadRequestException } from '@nestjs/common';
