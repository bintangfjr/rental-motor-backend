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
import * as moment from 'moment-timezone';

interface AdditionalCostItem {
  description: string;
  amount: number;
  type: 'discount' | 'additional';
}

@Injectable()
export class SewaService {
  constructor(private prisma: PrismaService) {}

  private readonly TIMEZONE = 'Asia/Jakarta';
  private readonly STATUS = {
    AKTIF: 'aktif',
    SELESAI: 'selesai',
    DIBATALKAN: 'dibatalkan',
  };

  private readonly STATUS_SELESAI = {
    TEPAT_WAKTU: 'Tepat Waktu',
    TERLAMBAT: 'Terlambat',
  };

  // ✅ METHOD: Parse semua format date ke Date object dengan WIB timezone
  private parseDateInput(dateString: string, fieldName: string): Date {
    if (!dateString) {
      throw new BadRequestException(`${fieldName} tidak boleh kosong`);
    }

    console.log(`🔧 Parsing ${fieldName}:`, dateString);

    try {
      let parsedMoment: moment.Moment;

      // Handle format frontend: "15/10/2025, 17.26"
      if (/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}\.\d{2}$/.test(dateString)) {
        const [datePart, timePart] = dateString.split(', ');
        const [day, month, year] = datePart.split('/');
        const [hour, minute] = timePart.split('.');

        const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        parsedMoment = moment.tz(isoFormat, 'YYYY-MM-DDTHH:mm', this.TIMEZONE);
      }
      // Handle format ISO: "2025-10-15" atau "2025-10-15T17:26"
      else if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        parsedMoment = moment
          .tz(dateString, 'YYYY-MM-DD', this.TIMEZONE)
          .startOf('day');
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
        parsedMoment = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', this.TIMEZONE);
      } else {
        // Fallback untuk format lain
        parsedMoment = moment(dateString).tz(this.TIMEZONE);
      }

      if (!parsedMoment.isValid()) {
        throw new BadRequestException(`${fieldName} tidak valid`);
      }

      const date = parsedMoment.toDate();

      console.log(`✅ ${fieldName} parsed:`, {
        input: dateString,
        output: date,
        locale: date.toLocaleString('id-ID'),
        iso: date.toISOString(),
        timezone: this.TIMEZONE,
      });

      return date;
    } catch (error) {
      console.error(`❌ Error parsing ${fieldName}:`, error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Format ${fieldName} tidak valid`);
    }
  }

  // ✅ METHOD: Untuk calculation dengan moment WIB
  private getMomentWIB(date: Date | string): moment.Moment {
    if (typeof date === 'string') {
      return moment.tz(date, this.TIMEZONE);
    }
    return moment(date).tz(this.TIMEZONE);
  }

  // ✅ METHOD: Validasi tanggal dengan STRICT RULES
  private validateDates(tglSewa: Date, tglKembali: Date): void {
    const tglSewaMoment = this.getMomentWIB(tglSewa);
    const tglKembaliMoment = this.getMomentWIB(tglKembali);
    const sekarangMoment = moment().tz(this.TIMEZONE);

    console.log('📅 STRICT Date Validation:', {
      sekarang: sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
      is_tgl_sewa_valid: tglSewaMoment.isSameOrAfter(sekarangMoment),
      is_tgl_kembali_valid: tglKembaliMoment.isAfter(tglSewaMoment),
    });

    // 🚨 STRICT VALIDATION: Tanggal sewa harus sama atau setelah waktu sekarang
    if (tglSewaMoment.isBefore(sekarangMoment)) {
      throw new BadRequestException(
        `Tanggal sewa tidak boleh di masa lalu. Sekarang: ${sekarangMoment.format('DD/MM/YYYY HH:mm')}`,
      );
    }

    // Validasi tanggal kembali setelah tanggal sewa
    if (tglKembaliMoment.isSameOrBefore(tglSewaMoment)) {
      throw new BadRequestException(
        'Tanggal kembali harus setelah tanggal sewa',
      );
    }

    // Validasi durasi minimal 1 jam untuk satuan jam
    const diffMinutes = tglKembaliMoment.diff(tglSewaMoment, 'minutes');
    if (diffMinutes < 60) {
      throw new BadRequestException('Durasi sewa minimal 1 jam');
    }
  }

  // ✅ METHOD: Validasi untuk update (lebih longgar)
  private validateUpdateDates(
    existingTglSewa: Date,
    newTglKembali: Date,
  ): void {
    const tglSewaMoment = this.getMomentWIB(existingTglSewa);
    const tglKembaliMoment = this.getMomentWIB(newTglKembali);
    const sekarangMoment = moment().tz(this.TIMEZONE);

    console.log('📅 UPDATE Date Validation:', {
      existing_tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      new_tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
      sekarang: sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
    });

    // Untuk update, tanggal kembali harus di masa depan
    if (tglKembaliMoment.isBefore(sekarangMoment)) {
      throw new BadRequestException('Tanggal kembali harus di masa depan');
    }

    if (tglKembaliMoment.isSameOrBefore(tglSewaMoment)) {
      throw new BadRequestException(
        'Tanggal kembali harus setelah tanggal sewa',
      );
    }
  }

  // ✅ METHOD: Hitung durasi dan harga
  private calculateDurationAndPrice(
    tglSewa: Date,
    tglKembali: Date,
    satuanDurasi: string,
    hargaMotor: number,
  ): { durasi: number; baseHarga: number } {
    const tglSewaMoment = this.getMomentWIB(tglSewa);
    const tglKembaliMoment = this.getMomentWIB(tglKembali);

    let durasi: number;
    let baseHarga: number;

    if (satuanDurasi === 'jam') {
      durasi = Math.ceil(tglKembaliMoment.diff(tglSewaMoment, 'hours', true));
      baseHarga = Math.ceil((hargaMotor / 24) * durasi);

      // Minimal 1 jam
      if (durasi < 1) {
        durasi = 1;
        baseHarga = Math.ceil(hargaMotor / 24);
      }
    } else {
      const diffInHours = tglKembaliMoment.diff(tglSewaMoment, 'hours', true);

      // Minimal 1 hari
      if (diffInHours <= 24) {
        durasi = 1;
        baseHarga = hargaMotor;
      } else {
        durasi = Math.ceil(diffInHours / 24);
        baseHarga = hargaMotor * durasi;
      }
    }

    console.log('💰 Duration and price calculation:', {
      satuan_durasi: satuanDurasi,
      durasi,
      baseHarga,
      hargaMotor,
      diff_hours: tglKembaliMoment.diff(tglSewaMoment, 'hours', true),
    });

    return { durasi, baseHarga };
  }

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

    console.log('📊 Additional costs calculation:', {
      totalDiscount,
      totalAdditional,
      netAdditionalCosts,
      items: additionalCosts?.length || 0,
    });

    return {
      totalDiscount,
      totalAdditional,
      netAdditionalCosts,
    };
  }

  // ✅ METHOD: Konversi jaminan
  private convertJaminanToString(
    jaminan: string[] | string | undefined,
  ): string {
    if (!jaminan) return '';

    if (Array.isArray(jaminan)) {
      return jaminan.join(', ');
    }

    return jaminan;
  }

  async findAll() {
    try {
      const sewas = await this.prisma.sewa.findMany({
        where: {
          status: { not: this.STATUS.SELESAI },
        },
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
              username: true,
            },
          },
          histories: {
            orderBy: { created_at: 'desc' },
          },
        },
      });

      if (!sewa) {
        throw new NotFoundException('Sewa tidak ditemukan');
      }

      return sewa;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error(`Error in findOne ID ${id}:`, error);
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log('=== 🚀 CREATE SEWA PROCESS ===');
        console.log('📝 Input data:', createSewaDto);

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
              where: { status: this.STATUS.AKTIF },
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

        // 3. Parse dan Validasi Dates dengan STRICT RULES
        console.log('=== 🕐 STRICT DATE PROCESSING ===');

        const tglSewaDate = this.parseDateInput(
          createSewaDto.tgl_sewa,
          'Tanggal sewa',
        );
        const tglKembaliDate = this.parseDateInput(
          createSewaDto.tgl_kembali,
          'Tanggal kembali',
        );

        // 🚨 STRICT VALIDATION - tidak boleh masa lalu
        this.validateDates(tglSewaDate, tglKembaliDate);

        // 4. Calculation Duration & Price
        const { durasi, baseHarga } = this.calculateDurationAndPrice(
          tglSewaDate,
          tglKembaliDate,
          createSewaDto.satuan_durasi,
          motor.harga,
        );

        // 5. Additional Costs
        const additionalCosts = createSewaDto.additional_costs || [];
        const { netAdditionalCosts } =
          this.calculateAdditionalCostsTotals(additionalCosts);
        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

        // 6. Jaminan
        const jaminanString = this.convertJaminanToString(
          createSewaDto.jaminan,
        );

        // 7. Create Sewa
        console.log('=== 💾 SAVING TO DATABASE ===');

        const sewa = await prisma.sewa.create({
          data: {
            motor_id: createSewaDto.motor_id,
            penyewa_id: createSewaDto.penyewa_id,
            admin_id: adminId,
            status: 'aktif',
            jaminan: jaminanString,
            pembayaran: createSewaDto.pembayaran,
            durasi_sewa: durasi,
            tgl_sewa: tglSewaDate,
            tgl_kembali: tglKembaliDate,
            total_harga: finalTotalHarga,
            satuan_durasi: createSewaDto.satuan_durasi,
            status_notifikasi: 'menunggu',
            additional_costs:
              additionalCosts.length > 0 ? additionalCosts : null,
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
          created_at: sewa.created_at,
        });

        return sewa;
      } catch (error) {
        console.error('Error in create sewa:', error);
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

        if (sewa.status === this.STATUS.SELESAI) {
          throw new BadRequestException(
            'Tidak dapat mengubah sewa yang sudah selesai',
          );
        }

        const updateData: any = {};

        // Handle tgl_kembali update
        if (updateSewaDto.tgl_kembali) {
          console.log('=== 🕐 UPDATE DATE PROCESSING ===');

          const tglKembaliDate = this.parseDateInput(
            updateSewaDto.tgl_kembali,
            'Tanggal kembali',
          );

          // Validasi untuk update (lebih longgar)
          this.validateUpdateDates(sewa.tgl_sewa, tglKembaliDate);

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
            additionalCosts.length > 0 ? additionalCosts : null;
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

        console.log('📝 Update data:', updateData);

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

        if (sewa.status === this.STATUS.SELESAI) {
          throw new BadRequestException('Sewa sudah selesai');
        }

        // Parse tanggal selesai
        const tglSelesaiDate = this.parseDateInput(
          selesaiSewaDto.tgl_selesai,
          'Tanggal selesai',
        );

        const tglKembaliMoment = this.getMomentWIB(sewa.tgl_kembali);
        const tglSelesaiMoment = this.getMomentWIB(tglSelesaiDate);
        const sekarangMoment = moment().tz(this.TIMEZONE);

        console.log('📅 Completion date validation:', {
          tgl_kembali_jadwal: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
          tgl_selesai_aktual: tglSelesaiMoment.format('DD/MM/YYYY HH:mm:ss'),
          sekarang: sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
          is_late: tglSelesaiMoment.isAfter(tglKembaliMoment),
          is_future: tglSelesaiMoment.isAfter(sekarangMoment),
        });

        // Validasi: tanggal selesai tidak boleh di masa depan
        if (tglSelesaiMoment.isAfter(sekarangMoment)) {
          throw new BadRequestException(
            'Tanggal selesai tidak boleh di masa depan',
          );
        }

        let denda = 0;
        let statusSelesai = this.STATUS_SELESAI.TEPAT_WAKTU;
        let keterlambatanMenit = 0;

        // Calculate penalty if late
        if (tglSelesaiMoment.isAfter(tglKembaliMoment)) {
          statusSelesai = this.STATUS_SELESAI.TERLAMBAT;

          if (sewa.satuan_durasi === 'jam') {
            keterlambatanMenit = Math.ceil(
              tglSelesaiMoment.diff(tglKembaliMoment, 'minutes', true),
            );
            const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
            denda = Math.ceil((keterlambatanMenit / 60) * hargaPerJam * 0.5);
          } else {
            const jamTerlambat = tglSelesaiMoment.diff(
              tglKembaliMoment,
              'hours',
              true,
            );
            const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
            denda = Math.ceil(jamTerlambat * hargaPerJam * 0.5);
          }

          console.log('💰 Denda calculation:', {
            keterlambatanMenit,
            denda,
            statusSelesai,
          });
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
        if (sewa.status !== this.STATUS.SELESAI) {
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
}
