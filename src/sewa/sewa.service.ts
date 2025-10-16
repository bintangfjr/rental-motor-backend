import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSewaDto } from './dto/create-sewa.dto';
import { UpdateSewaDto } from './dto/update-sewa.dto';
import { SelesaiSewaDto } from './dto/selesai-sewa.dto';

interface AdditionalCostItem {
  description: string;
  amount: number;
  type: 'discount' | 'additional';
}

@Injectable()
export class SewaService {
  constructor(private prisma: PrismaService) {}

  // ✅ METHOD: Simple date parsing - terima string ISO langsung
  private parseDateInput(dateString: string, fieldName: string): Date {
    if (!dateString) {
      throw new BadRequestException(`${fieldName} tidak boleh kosong`);
    }

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} tidak valid`);
    }

    console.log(`✅ ${fieldName} parsed:`, {
      input: dateString,
      output: date,
      iso: date.toISOString(),
      locale: date.toLocaleString('id-ID'),
    });

    return date;
  }

  // ✅ METHOD: Simple date validation
  private validateDates(tglSewa: Date, tglKembali: Date): void {
    if (tglKembali <= tglSewa) {
      throw new BadRequestException(
        'Tanggal kembali harus setelah tanggal sewa',
      );
    }

    // Minimal 1 jam
    const diffMs = tglKembali.getTime() - tglSewa.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      throw new BadRequestException('Durasi sewa minimal 1 jam');
    }
  }

  // ✅ METHOD: Calculate duration & price
  private calculateDurationAndPrice(
    tglSewa: Date,
    tglKembali: Date,
    satuanDurasi: string,
    hargaMotor: number,
  ): { durasi: number; baseHarga: number } {
    const diffMs = tglKembali.getTime() - tglSewa.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    let durasi: number;
    let baseHarga: number;

    if (satuanDurasi === 'jam') {
      durasi = Math.ceil(diffHours);
      baseHarga = Math.ceil((hargaMotor / 24) * durasi);

      // Minimal 1 jam
      if (durasi < 1) {
        durasi = 1;
        baseHarga = Math.ceil(hargaMotor / 24);
      }
    } else {
      // Untuk harian, minimal 1 hari
      if (diffHours <= 24) {
        durasi = 1;
        baseHarga = hargaMotor;
      } else {
        durasi = Math.ceil(diffHours / 24);
        baseHarga = hargaMotor * durasi;
      }
    }

    console.log('💰 Duration and price calculation:', {
      satuan_durasi: satuanDurasi,
      durasi,
      baseHarga,
      hargaMotor,
      diff_hours: diffHours,
    });

    return { durasi, baseHarga };
  }

  // ✅ METHOD: Calculate additional costs
  private calculateAdditionalCostsTotals(
    additionalCosts: AdditionalCostItem[],
  ) {
    let totalDiscount = 0;
    let totalAdditional = 0;

    if (additionalCosts?.length > 0) {
      additionalCosts.forEach((cost) => {
        if (cost.type === 'discount') {
          totalDiscount += cost.amount;
        } else if (cost.type === 'additional') {
          totalAdditional += cost.amount;
        }
      });
    }

    const netAdditionalCosts = totalAdditional - totalDiscount;

    return {
      totalDiscount,
      totalAdditional,
      netAdditionalCosts,
    };
  }

  // ✅ METHOD: Convert jaminan to string
  private convertJaminanToString(
    jaminan: string[] | string | undefined,
  ): string {
    if (!jaminan) return '';

    if (Array.isArray(jaminan)) {
      return jaminan.join(', ');
    }

    return jaminan;
  }

  // ✅ CREATE - Simplified
  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log('=== 🚀 CREATE SEWA PROCESS ===');

        // 1. Validasi Motor
        const motor = await prisma.motor.findUnique({
          where: { id: createSewaDto.motor_id },
        });

        if (!motor) {
          throw new NotFoundException('Motor tidak ditemukan');
        }

        if (motor.status !== 'tersedia') {
          throw new BadRequestException('Motor tidak tersedia untuk disewa');
        }

        // 2. Validasi Penyewa
        const penyewa = await prisma.penyewa.findUnique({
          where: { id: createSewaDto.penyewa_id },
          include: {
            sewas: {
              where: { status: 'aktif' },
            },
          },
        });

        if (!penyewa) {
          throw new NotFoundException('Penyewa tidak ditemukan');
        }

        if (penyewa.is_blacklisted) {
          throw new BadRequestException('Penyewa dalam daftar hitam');
        }

        if (penyewa.sewas.length > 0) {
          throw new BadRequestException('Penyewa memiliki sewa aktif');
        }

        // 3. Parse Dates - SIMPLE PARSING
        const tglSewaDate = this.parseDateInput(
          createSewaDto.tgl_sewa,
          'Tanggal sewa',
        );
        const tglKembaliDate = this.parseDateInput(
          createSewaDto.tgl_kembali,
          'Tanggal kembali',
        );

        // 4. Validasi Dates
        this.validateDates(tglSewaDate, tglKembaliDate);

        // 5. Calculation Duration & Price
        const { durasi, baseHarga } = this.calculateDurationAndPrice(
          tglSewaDate,
          tglKembaliDate,
          createSewaDto.satuan_durasi,
          motor.harga,
        );

        // 6. Additional Costs
        const additionalCosts = createSewaDto.additional_costs || [];
        const { netAdditionalCosts } =
          this.calculateAdditionalCostsTotals(additionalCosts);
        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

        // 7. Create Sewa
        const sewa = await prisma.sewa.create({
          data: {
            motor_id: createSewaDto.motor_id,
            penyewa_id: createSewaDto.penyewa_id,
            admin_id: adminId,
            status: 'aktif',
            jaminan: this.convertJaminanToString(createSewaDto.jaminan),
            pembayaran: createSewaDto.pembayaran,
            durasi_sewa: durasi,
            tgl_sewa: tglSewaDate,
            tgl_kembali: tglKembaliDate,
            total_harga: finalTotalHarga,
            satuan_durasi: createSewaDto.satuan_durasi,
            status_notifikasi: 'menunggu',
            additional_costs:
              additionalCosts.length > 0 ? (additionalCosts as any) : null,
            catatan_tambahan: createSewaDto.catatan_tambahan,
          },
          include: {
            motor: true,
            penyewa: true,
            admin: { select: { id: true, nama_lengkap: true } },
          },
        });

        // 8. Update Motor Status
        await prisma.motor.update({
          where: { id: createSewaDto.motor_id },
          data: { status: 'disewa' },
        });

        console.log('✅ Sewa created successfully:', {
          id: sewa.id,
          tgl_sewa: sewa.tgl_sewa,
          tgl_kembali: sewa.tgl_kembali,
          total_harga: sewa.total_harga,
        });

        return sewa;
      } catch (error) {
        console.error('❌ Error in create sewa:', error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException('Gagal membuat sewa: ' + error.message);
      }
    });
  }

  // ✅ FIND ALL
  async findAll() {
    try {
      const sewas = await this.prisma.sewa.findMany({
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return sewas;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  // ✅ FIND ONE
  async findOne(id: number) {
    try {
      const sewa = await this.prisma.sewa.findUnique({
        where: { id },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
              harga: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
              alamat: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
          histories: {
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      if (!sewa) {
        throw new NotFoundException(`Sewa dengan ID ${id} tidak ditemukan`);
      }

      return sewa;
    } catch (error) {
      console.error(`Error in findOne sewa ID ${id}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  // ✅ UPDATE
  async update(id: number, updateSewaDto: UpdateSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🚀 UPDATE SEWA ID ${id} ===`);

        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: { motor: true },
        });

        if (!sewa) {
          throw new NotFoundException('Sewa tidak ditemukan');
        }

        if (sewa.status === 'selesai') {
          throw new BadRequestException(
            'Tidak dapat mengubah sewa yang sudah selesai',
          );
        }

        const updateData: any = {};

        // Handle tgl_kembali update
        if (updateSewaDto.tgl_kembali) {
          const tglKembaliDate = this.parseDateInput(
            updateSewaDto.tgl_kembali,
            'Tanggal kembali',
          );

          // Validasi tanggal kembali harus setelah tanggal sewa
          if (tglKembaliDate <= sewa.tgl_sewa) {
            throw new BadRequestException(
              'Tanggal kembali harus setelah tanggal sewa',
            );
          }

          updateData.tgl_kembali = tglKembaliDate;

          // Recalculate duration & price
          const { durasi, baseHarga } = this.calculateDurationAndPrice(
            sewa.tgl_sewa,
            tglKembaliDate,
            sewa.satuan_durasi,
            sewa.motor.harga,
          );

          updateData.durasi_sewa = durasi;
          updateData.total_harga = baseHarga;
        }

        // Handle additional_costs update
        if (updateSewaDto.additional_costs !== undefined) {
          const additionalCosts = updateSewaDto.additional_costs || [];
          const { netAdditionalCosts } =
            this.calculateAdditionalCostsTotals(additionalCosts);

          const baseHarga = updateData.total_harga || sewa.total_harga;
          updateData.total_harga = Math.max(0, baseHarga + netAdditionalCosts);
          updateData.additional_costs =
            additionalCosts.length > 0 ? (additionalCosts as any) : null;
        }

        // Handle other fields
        if (updateSewaDto.jaminan !== undefined) {
          updateData.jaminan = this.convertJaminanToString(
            updateSewaDto.jaminan,
          );
        }

        if (updateSewaDto.pembayaran !== undefined) {
          updateData.pembayaran = updateSewaDto.pembayaran;
        }

        if (updateSewaDto.catatan_tambahan !== undefined) {
          updateData.catatan_tambahan = updateSewaDto.catatan_tambahan;
        }

        if (Object.keys(updateData).length === 0) {
          throw new BadRequestException('Tidak ada data yang diupdate');
        }

        const updatedSewa = await prisma.sewa.update({
          where: { id },
          data: updateData,
          include: {
            motor: true,
            penyewa: true,
            admin: { select: { id: true, nama_lengkap: true } },
          },
        });

        console.log('✅ Sewa updated successfully:', { id: updatedSewa.id });

        return updatedSewa;
      } catch (error) {
        console.error(`Error in update sewa ID ${id}:`, error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException(
          'Gagal memperbarui sewa: ' + error.message,
        );
      }
    });
  }

  // ✅ SELESAI
  async selesai(id: number, selesaiSewaDto: SelesaiSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🚀 SELESAI SEWA ID ${id} ===`);

        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: { motor: true },
        });

        if (!sewa) {
          throw new NotFoundException('Sewa tidak ditemukan');
        }

        if (sewa.status === 'selesai') {
          throw new BadRequestException('Sewa sudah selesai');
        }

        // Parse tanggal selesai
        const tglSelesaiDate = this.parseDateInput(
          selesaiSewaDto.tgl_selesai,
          'Tanggal selesai',
        );

        // Validasi: tanggal selesai tidak boleh di masa depan
        const sekarang = new Date();
        if (tglSelesaiDate > sekarang) {
          throw new BadRequestException(
            'Tanggal selesai tidak boleh di masa depan',
          );
        }

        let denda = 0;
        let statusSelesai = 'Tepat Waktu';
        let keterlambatanMenit = 0;

        // Calculate penalty if late
        if (tglSelesaiDate > sewa.tgl_kembali) {
          statusSelesai = 'Terlambat';

          const diffMs = tglSelesaiDate.getTime() - sewa.tgl_kembali.getTime();
          const diffMinutes = Math.ceil(diffMs / (1000 * 60));

          keterlambatanMenit = diffMinutes;

          if (sewa.satuan_durasi === 'jam') {
            const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
            denda = Math.ceil((diffMinutes / 60) * hargaPerJam * 0.5);
          } else {
            const diffHours = diffMinutes / 60;
            const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
            denda = Math.ceil(diffHours * hargaPerJam * 0.5);
          }
        }

        const history = await prisma.history.create({
          data: {
            sewa_id: id,
            tgl_selesai: tglSelesaiDate,
            status_selesai: statusSelesai,
            harga: sewa.total_harga,
            denda: denda,
            catatan: selesaiSewaDto.catatan,
            keterlambatan_menit: keterlambatanMenit,
          },
        });

        // Update sewa status to completed
        await prisma.sewa.update({
          where: { id },
          data: {
            status: 'selesai',
            status_notifikasi: 'selesai',
          },
        });

        // Update motor status back to available
        await prisma.motor.update({
          where: { id: sewa.motor_id },
          data: { status: 'tersedia' },
        });

        console.log('✅ Sewa completed successfully:', {
          sewa_id: id,
          history_id: history.id,
          denda,
        });

        return history;
      } catch (error) {
        console.error(`Error in selesai sewa ID ${id}:`, error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException(
          'Gagal menyelesaikan sewa: ' + error.message,
        );
      }
    });
  }

  // ✅ REMOVE
  async remove(id: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🗑️ DELETE SEWA ID ${id} ===`);

        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: { motor: true, histories: true },
        });

        if (!sewa) {
          throw new NotFoundException('Sewa tidak ditemukan');
        }

        // Kembalikan status motor jika sewa belum selesai
        if (sewa.status !== 'selesai') {
          await prisma.motor.update({
            where: { id: sewa.motor_id },
            data: { status: 'tersedia' },
          });
        }

        // Hapus histories jika ada
        if (sewa.histories.length > 0) {
          await prisma.history.deleteMany({
            where: { sewa_id: id },
          });
        }

        // Hapus sewa
        await prisma.sewa.delete({
          where: { id },
        });

        console.log('✅ Sewa deleted successfully:', { id });

        return { message: 'Data sewa berhasil dihapus' };
      } catch (error) {
        console.error(`Error in remove sewa ID ${id}:`, error);
        if (error instanceof NotFoundException) {
          throw error;
        }
        throw new InternalServerErrorException(
          'Gagal menghapus sewa: ' + error.message,
        );
      }
    });
  }

  // ✅ UPDATE NOTES
  async updateNotes(id: number, catatan_tambahan: string) {
    try {
      console.log(`=== 📝 UPDATE NOTES SEWA ID ${id} ===`);

      const sewa = await this.prisma.sewa.findUnique({
        where: { id },
      });

      if (!sewa) {
        throw new NotFoundException('Sewa tidak ditemukan');
      }

      const updatedSewa = await this.prisma.sewa.update({
        where: { id },
        data: { catatan_tambahan },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
        },
      });

      console.log('✅ Notes updated successfully:', { id });

      return updatedSewa;
    } catch (error) {
      console.error(`Error in updateNotes sewa ID ${id}:`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        'Gagal memperbarui catatan: ' + error.message,
      );
    }
  }

  // ✅ FIND ALL WITH HISTORY
  async findAllWithHistory() {
    try {
      const sewas = await this.prisma.sewa.findMany({
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
          histories: {
            orderBy: {
              created_at: 'desc',
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return sewas;
    } catch (error) {
      console.error('Error in findAllWithHistory:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil data sewa dengan history',
      );
    }
  }

  // ✅ FIND ACTIVE ONLY
  async findActive() {
    try {
      const sewas = await this.prisma.sewa.findMany({
        where: { status: 'aktif' },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return sewas;
    } catch (error) {
      console.error('Error in findActive:', error);
      throw new InternalServerErrorException('Gagal mengambil data sewa aktif');
    }
  }

  // ✅ FIND COMPLETED ONLY
  async findCompleted() {
    try {
      const sewas = await this.prisma.sewa.findMany({
        where: { status: 'selesai' },
        include: {
          motor: {
            select: {
              id: true,
              plat_nomor: true,
              merk: true,
              model: true,
            },
          },
          penyewa: {
            select: {
              id: true,
              nama: true,
              no_whatsapp: true,
            },
          },
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
          histories: {
            orderBy: {
              created_at: 'desc',
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return sewas;
    } catch (error) {
      console.error('Error in findCompleted:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil data sewa selesai',
      );
    }
  }
}
