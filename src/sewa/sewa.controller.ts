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

@Controller('sewas')
export class SewaController {
  constructor(private readonly sewaService: SewaService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    try {
      const sewas = await this.sewaService.findAll();
      return {
        success: true,
        data: sewas,
        message: 'Data sewa berhasil diambil',
      };
    } catch (error: unknown) {
      console.error('Error fetching sewas:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal mengambil data sewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    try {
      const sewa = await this.sewaService.findOne(+id);
      return {
        success: true,
        data: sewa,
        message: 'Data sewa berhasil diambil',
      };
    } catch (error: unknown) {
      console.error(`Error fetching sewa ID ${id}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal mengambil data sewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createSewaDto: CreateSewaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      console.log('Creating sewa with data:', createSewaDto);
      console.log('Admin ID:', req.user.id);

      const sewa = await this.sewaService.create(createSewaDto, req.user.id);
      return {
        success: true,
        data: sewa,
        message: 'Sewa berhasil ditambahkan.',
      };
    } catch (error: unknown) {
      console.error('Error creating sewa:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal membuat sewa';

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() updateSewaDto: UpdateSewaDto) {
    try {
      console.log(`Updating sewa ID ${id} with data:`, updateSewaDto);

      const sewa = await this.sewaService.update(+id, updateSewaDto);
      return {
        success: true,
        data: sewa,
        message: 'Sewa berhasil diperbarui.',
      };
    } catch (error: unknown) {
      console.error(`Error updating sewa ID ${id}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal memperbarui sewa';

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':id/selesai')
  @UseGuards(JwtAuthGuard)
  async selesai(
    @Param('id') id: string,
    @Body() selesaiSewaDto: SelesaiSewaDto,
  ) {
    try {
      console.log(`Completing sewa ID ${id} with data:`, selesaiSewaDto);

      const result = await this.sewaService.selesai(+id, selesaiSewaDto);
      return {
        success: true,
        data: result,
        message: 'Sewa berhasil diselesaikan.',
      };
    } catch (error: unknown) {
      console.error(`Error completing sewa ID ${id}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal menyelesaikan sewa';

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    try {
      console.log(`Deleting sewa ID ${id}`);

      const result = await this.sewaService.remove(+id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error: unknown) {
      console.error(`Error deleting sewa ID ${id}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal menghapus sewa';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ✅ TAMBAHAN: Endpoint untuk update catatan
  @Put(':id/notes')
  @UseGuards(JwtAuthGuard)
  async updateNotes(
    @Param('id') id: string,
    @Body() updateNotesDto: UpdateNotesDto,
  ) {
    try {
      console.log(`Updating notes for sewa ID ${id}:`, updateNotesDto);

      const sewa = await this.sewaService.updateNotes(
        +id,
        updateNotesDto.catatan_tambahan,
      );

      return {
        success: true,
        data: sewa,
        message: 'Catatan berhasil diperbarui.',
      };
    } catch (error: unknown) {
      console.error(`Error updating notes for sewa ID ${id}:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      // ✅ PERBAIKAN: Handle unknown error dengan type safety
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal memperbarui catatan';

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
