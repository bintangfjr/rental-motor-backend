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
import { AdditionalCostItemDto } from './dto/create-sewa.dto';

interface UpdateSewaData {
  tgl_kembali?: Date;
  durasi_sewa?: number;
  total_harga?: number;
  additional_costs?: string | null;
  jaminan?: string;
  pembayaran?: string;
  catatan_tambahan?: string | null;
}

@Injectable()
export class SewaService {
  constructor(private prisma: PrismaService) {}

  // ✅ FIXED: Parse date sebagai LOCAL TIME WIB
  private parseDateInput(dateString: string, fieldName: string): Date {
    if (!dateString) {
      throw new BadRequestException(`${fieldName} tidak boleh kosong`);
    }

    console.log(`🕐 [SIMPLE FORMAT Parse] ${fieldName}:`, dateString);

    let date: Date;

    if (dateString.includes('T') && dateString.length === 16) {
      // ✅ FORMAT SIMPLE: "2024-01-15T10:30" - Parse sebagai LOCAL TIME WIB
      const [datePart, timePart] = dateString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);

      // ✅ BUAT DATE OBJECT SEBAGAI LOCAL TIME (WIB)
      date = new Date(year, month - 1, day, hours, minutes, 0);
    } else {
      // Fallback untuk format lain
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} tidak valid`);
    }

    console.log(`✅ ${fieldName} parsed:`, {
      input: dateString,
      output: date.toLocaleString('id-ID'),
      strategy: 'Simple Format -> Local Time WIB',
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

    const diffHours =
      (tglKembali.getTime() - tglSewa.getTime()) / (1000 * 60 * 60);
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
      durasi = Math.max(1, Math.ceil(diffHours));
      baseHarga = Math.ceil((hargaMotor / 24) * durasi);
    } else {
      durasi = Math.max(1, Math.ceil(diffHours / 24));
      baseHarga = hargaMotor * durasi;
    }

    return { durasi, baseHarga };
  }

  // ✅ FIXED: Calculate additional costs dengan type safety
  private calculateAdditionalCostsTotals(
    additionalCosts: AdditionalCostItemDto[] = [],
  ): {
    totalDiscount: number;
    totalAdditional: number;
    netAdditionalCosts: number;
  } {
    const totalDiscount = additionalCosts
      .filter((cost) => cost.type === 'discount')
      .reduce((sum, cost) => sum + cost.amount, 0);

    const totalAdditional = additionalCosts
      .filter((cost) => cost.type === 'additional')
      .reduce((sum, cost) => sum + cost.amount, 0);

    return {
      totalDiscount,
      totalAdditional,
      netAdditionalCosts: totalAdditional - totalDiscount,
    };
  }

  // ✅ FIXED: Convert AdditionalCostItemDto[] ke JSON string untuk Prisma
  private convertAdditionalCostsForPrisma(
    additionalCosts: AdditionalCostItemDto[],
  ): string | null {
    if (!additionalCosts || additionalCosts.length === 0) {
      return null;
    }

    // Convert ke JSON string untuk Prisma JSON field
    return JSON.stringify(
      additionalCosts.map((cost) => ({
        description: cost.description,
        amount: cost.amount,
        type: cost.type,
      })),
    );
  }

  // ✅ METHOD: Convert jaminan to string
  private convertJaminanToString(
    jaminan: string[] | string | undefined,
  ): string {
    if (!jaminan) return '';
    return Array.isArray(jaminan) ? jaminan.join(', ') : jaminan;
  }

  // ✅ CREATE - Fixed All Errors dengan type safety
  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log('=== 🚀 CREATE SEWA - SIMPLE FORMAT ===');

        // 1. Validasi Motor
        const motor = await prisma.motor.findUnique({
          where: { id: createSewaDto.motor_id },
        });

        if (!motor) throw new NotFoundException('Motor tidak ditemukan');
        if (motor.status !== 'tersedia') {
          throw new BadRequestException('Motor tidak tersedia untuk disewa');
        }

        // 2. Validasi Penyewa
        const penyewa = await prisma.penyewa.findUnique({
          where: { id: createSewaDto.penyewa_id },
          include: { sewas: { where: { status: 'aktif' } } },
        });

        if (!penyewa) throw new NotFoundException('Penyewa tidak ditemukan');
        if (penyewa.is_blacklisted)
          throw new BadRequestException('Penyewa dalam daftar hitam');
        if (penyewa.sewas.length > 0)
          throw new BadRequestException('Penyewa memiliki sewa aktif');

        // 3. Parse Dates - SIMPLE PARSING sebagai WIB
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

        // 6. Additional Costs - FIXED: Convert untuk Prisma sebagai JSON string
        const additionalCosts = createSewaDto.additional_costs || [];
        const { netAdditionalCosts } =
          this.calculateAdditionalCostsTotals(additionalCosts);
        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

        // 7. Create Sewa - FIXED: Type safety untuk semua field
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
              this.convertAdditionalCostsForPrisma(additionalCosts),
            catatan_tambahan: createSewaDto.catatan_tambahan || null,
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

        console.log('✅ Sewa created successfully');
        return sewa;
      } catch (error) {
        console.error('❌ Error in create sewa:', error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException('Gagal membuat sewa');
      }
    });
  }

  // ✅ FIND ALL - Hanya sewa aktif (tidak termasuk yang selesai)
  async findAll(status?: string) {
    try {
      const where = status ? { status } : {};

      return await this.prisma.sewa.findMany({
        where,
        include: {
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
          penyewa: { select: { id: true, nama: true, no_whatsapp: true } },
          admin: { select: { id: true, nama_lengkap: true } },
        },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  // ✅ FIND ONE - Simplified dengan type safety
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
            select: { id: true, nama: true, no_whatsapp: true, alamat: true },
          },
          admin: { select: { id: true, nama_lengkap: true } },
        },
      });

      if (!sewa) {
        throw new NotFoundException(`Sewa dengan ID ${id} tidak ditemukan`);
      }
      return sewa;
    } catch (error) {
      console.error(`Error in findOne sewa ID ${id}:`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  // ✅ UPDATE - Fixed dengan type safety dan tanpa unsafe access
  async update(id: number, updateSewaDto: UpdateSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🚀 UPDATE SEWA ID ${id} ===`);

        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: { motor: true },
        });

        if (!sewa) throw new NotFoundException('Sewa tidak ditemukan');
        if (sewa.status === 'selesai') {
          throw new BadRequestException(
            'Tidak dapat mengubah sewa yang sudah selesai',
          );
        }

        // ✅ FIXED: Type-safe update data dengan interface
        const updateData: UpdateSewaData = {};

        // Handle tgl_kembali update
        if (updateSewaDto.tgl_kembali) {
          const tglKembaliDate = this.parseDateInput(
            updateSewaDto.tgl_kembali,
            'Tanggal kembali',
          );

          if (tglKembaliDate <= sewa.tgl_sewa) {
            throw new BadRequestException(
              'Tanggal kembali harus setelah tanggal sewa',
            );
          }

          updateData.tgl_kembali = tglKembaliDate;

          const { durasi, baseHarga } = this.calculateDurationAndPrice(
            sewa.tgl_sewa,
            tglKembaliDate,
            sewa.satuan_durasi,
            sewa.motor.harga,
          );

          updateData.durasi_sewa = durasi;
          updateData.total_harga = baseHarga;
        }

        // Handle additional_costs update - FIXED: Convert to JSON string
        if (updateSewaDto.additional_costs !== undefined) {
          const additionalCosts = updateSewaDto.additional_costs || [];
          const { netAdditionalCosts } =
            this.calculateAdditionalCostsTotals(additionalCosts);

          // ✅ FIXED: Tidak ada unsafe access - gunakan nilai yang sudah ada
          const currentBaseHarga =
            updateData.total_harga !== undefined
              ? updateData.total_harga
              : sewa.total_harga;

          updateData.total_harga = Math.max(
            0,
            currentBaseHarga + netAdditionalCosts,
          );
          updateData.additional_costs =
            this.convertAdditionalCostsForPrisma(additionalCosts);
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
          updateData.catatan_tambahan = updateSewaDto.catatan_tambahan || null;
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

        console.log('✅ Sewa updated successfully');
        return updatedSewa;
      } catch (error) {
        console.error(`Error in update sewa ID ${id}:`, error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException('Gagal memperbarui sewa');
      }
    });
  }

  // ✅✅✅ FIXED: SELESAI - Data pindah ke histories dan dihapus dari sewas
  async selesai(id: number, selesaiSewaDto: SelesaiSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🚀 SELESAI SEWA ID ${id} ===`);

        // 1. Cari data sewa lengkap
        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: {
            motor: true,
            penyewa: true,
            admin: { select: { id: true, nama_lengkap: true } },
          },
        });

        if (!sewa) throw new NotFoundException('Sewa tidak ditemukan');
        if (sewa.status === 'selesai')
          throw new BadRequestException('Sewa sudah selesai');

        // 2. Validasi tanggal selesai
        const tglSelesaiDate = this.parseDateInput(
          selesaiSewaDto.tgl_selesai,
          'Tanggal selesai',
        );
        const sekarang = new Date();

        if (tglSelesaiDate > sekarang) {
          throw new BadRequestException(
            'Tanggal selesai tidak boleh di masa depan',
          );
        }

        // 3. Hitung denda & keterlambatan
        let denda = 0;
        let statusSelesai = 'Tepat Waktu';
        let keterlambatanMenit = 0;

        if (tglSelesaiDate > sewa.tgl_kembali) {
          statusSelesai = 'Terlambat';
          const diffMinutes = Math.ceil(
            (tglSelesaiDate.getTime() - sewa.tgl_kembali.getTime()) /
              (1000 * 60),
          );
          keterlambatanMenit = diffMinutes;

          const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
          denda = Math.ceil((diffMinutes / 60) * hargaPerJam * 0.5);
        }

        // 4. ✅ SIMPAN DATA LENGKAP KE HISTORIES (sebelum hapus sewa)
        const history = await prisma.history.create({
          data: {
            // Data completion
            sewa_id: id,
            tgl_selesai: tglSelesaiDate,
            status_selesai: statusSelesai,
            harga: sewa.total_harga,
            denda: denda,
            catatan: selesaiSewaDto.catatan || null,
            keterlambatan_menit: keterlambatanMenit,

            // ✅ DATA SEWA LENGKAP (karena sewa akan dihapus)
            motor_plat: sewa.motor.plat_nomor,
            motor_merk: sewa.motor.merk,
            motor_model: sewa.motor.model,
            tahun_motor: sewa.motor.tahun,
            penyewa_nama: sewa.penyewa.nama,
            penyewa_whatsapp: sewa.penyewa.no_whatsapp,
            admin_nama: sewa.admin.nama_lengkap,
            tgl_sewa: sewa.tgl_sewa,
            tgl_kembali: sewa.tgl_kembali,
            durasi_sewa: sewa.durasi_sewa,
            satuan_durasi: sewa.satuan_durasi,
            jaminan: sewa.jaminan,
            pembayaran: sewa.pembayaran,
            additional_costs: sewa.additional_costs,
            catatan_tambahan: sewa.catatan_tambahan,
          },
        });

        // 5. ✅ HAPUS DATA DARI TABLE SEWAS (setelah backup ke histories)
        await prisma.sewa.delete({
          where: { id },
        });

        // 6. Update motor status back to available
        await prisma.motor.update({
          where: { id: sewa.motor_id },
          data: { status: 'tersedia' },
        });

        console.log('✅✅✅ Sewa completed and moved to history successfully');

        return {
          message: 'Sewa berhasil diselesaikan dan dipindah ke histories',
          history: history,
        };
      } catch (error) {
        console.error(`❌ Error in selesai sewa ID ${id}:`, error);
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        throw new BadRequestException('Gagal menyelesaikan sewa');
      }
    });
  }

  // ✅ REMOVE - Simplified dengan type safety
  async remove(id: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log(`=== 🗑️ DELETE SEWA ID ${id} ===`);

        const sewa = await prisma.sewa.findUnique({
          where: { id },
          include: { motor: true },
        });

        if (!sewa) throw new NotFoundException('Sewa tidak ditemukan');

        // Kembalikan status motor jika sewa belum selesai
        if (sewa.status !== 'selesai') {
          await prisma.motor.update({
            where: { id: sewa.motor_id },
            data: { status: 'tersedia' },
          });
        }

        // Hapus sewa
        await prisma.sewa.delete({ where: { id } });

        console.log('✅ Sewa deleted successfully');
        return { message: 'Data sewa berhasil dihapus' };
      } catch (error) {
        console.error(`Error in remove sewa ID ${id}:`, error);
        if (error instanceof NotFoundException) throw error;
        throw new InternalServerErrorException('Gagal menghapus sewa');
      }
    });
  }

  // ✅ UPDATE NOTES - Simplified dengan type safety
  async updateNotes(id: number, catatan_tambahan: string) {
    try {
      console.log(`=== 📝 UPDATE NOTES SEWA ID ${id} ===`);

      const sewa = await this.prisma.sewa.findUnique({ where: { id } });
      if (!sewa) throw new NotFoundException('Sewa tidak ditemukan');

      const updatedSewa = await this.prisma.sewa.update({
        where: { id },
        data: { catatan_tambahan: catatan_tambahan || null },
        include: {
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
          penyewa: { select: { id: true, nama: true, no_whatsapp: true } },
          admin: { select: { id: true, nama_lengkap: true } },
        },
      });

      console.log('✅ Notes updated successfully');
      return updatedSewa;
    } catch (error) {
      console.error(`Error in updateNotes sewa ID ${id}:`, error);
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Gagal memperbarui catatan');
    }
  }

  // ✅ FIND ACTIVE ONLY - Simplified dengan type safety
  async findActive() {
    try {
      return await this.prisma.sewa.findMany({
        where: { status: 'aktif' },
        include: {
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
          penyewa: { select: { id: true, nama: true, no_whatsapp: true } },
          admin: { select: { id: true, nama_lengkap: true } },
        },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      console.error('Error in findActive:', error);
      throw new InternalServerErrorException('Gagal mengambil data sewa aktif');
    }
  }

  // ✅ NEW METHOD: Cari sewa yang sudah jatuh tempo tapi belum selesai
  async findOverdue() {
    try {
      const sekarang = new Date();
      return await this.prisma.sewa.findMany({
        where: {
          status: 'aktif',
          tgl_kembali: { lt: sekarang }, // Tanggal kembali sudah lewat
        },
        include: {
          motor: {
            select: { id: true, plat_nomor: true, merk: true, model: true },
          },
          penyewa: { select: { id: true, nama: true, no_whatsapp: true } },
          admin: { select: { id: true, nama_lengkap: true } },
        },
        orderBy: { tgl_kembali: 'asc' },
      });
    } catch (error) {
      console.error('Error in findOverdue:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil data sewa overdue',
      );
    }
  }
}
