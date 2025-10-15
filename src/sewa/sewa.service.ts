// src/sewa/sewa.service.ts
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

// Interface untuk additional costs dengan type
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

  // ✅ METHOD: Parse dan validasi input date dari frontend (WIB)
  private parseAndValidateWIBDate(dateString: string, fieldName: string): Date {
    if (!dateString) {
      throw new BadRequestException(`${fieldName} tidak boleh kosong`);
    }

    console.log(`🔧 Parsing ${fieldName}:`, dateString);

    try {
      let parsedMoment: moment.Moment;

      // Handle berbagai format input
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // Format: '2025-10-15' (date only) - set ke 00:00 WIB
        parsedMoment = moment
          .tz(dateString, 'YYYY-MM-DD', this.TIMEZONE)
          .startOf('day');
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
        // Format: '2025-10-15T14:30' (datetime without timezone) - assume WIB
        parsedMoment = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', this.TIMEZONE);
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*/.test(dateString)) {
        // Format ISO dengan timezone - convert ke WIB
        parsedMoment = moment(dateString).tz(this.TIMEZONE);
      } else {
        throw new BadRequestException(
          `Format ${fieldName} tidak valid. Gunakan format YYYY-MM-DD atau YYYY-MM-DDTHH:mm`,
        );
      }

      if (!parsedMoment.isValid()) {
        throw new BadRequestException(`${fieldName} tidak valid`);
      }

      // ✅ Simpan sebagai Date object (akan disimpan sesuai timezone database)
      const date = parsedMoment.toDate();

      console.log(`✅ ${fieldName} parsed:`, {
        input: dateString,
        moment: parsedMoment.format('YYYY-MM-DD HH:mm:ss'),
        jsDate: date,
        iso: date.toISOString(),
        locale: parsedMoment.format('DD/MM/YYYY HH:mm:ss'),
      });

      return date;
    } catch (error) {
      console.error(`❌ Error parsing ${fieldName}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Format ${fieldName} tidak valid`);
    }
  }

  // ✅ METHOD: Convert Date dari database ke string WIB untuk response
  private formatDateToWIB(date: Date, includeTime: boolean = true): string {
    if (!date) return '';

    const momentDate = moment(date).tz(this.TIMEZONE);

    if (includeTime) {
      return momentDate.format('YYYY-MM-DDTHH:mm');
    } else {
      return momentDate.format('YYYY-MM-DD');
    }
  }

  // ✅ METHOD: Untuk calculation dengan moment WIB
  private getMomentWIB(date: Date | string): moment.Moment {
    if (typeof date === 'string') {
      return moment.tz(date, this.TIMEZONE);
    }
    return moment(date).tz(this.TIMEZONE);
  }

  // ✅ METHOD: Get current time in WIB
  private getCurrentWIB(): moment.Moment {
    return moment().tz(this.TIMEZONE);
  }

  // ✅ METHOD: Validasi tanggal sewa tidak di masa lalu
  private validateRentalDateNotInPast(tglSewaMoment: moment.Moment): void {
    const sekarangMoment = this.getCurrentWIB();
    const sepuluhMenitLalu = sekarangMoment.clone().subtract(10, 'minutes');

    console.log('🕐 Validating rental date:', {
      tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      sekarang: sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      sepuluh_menit_lalu: sepuluhMenitLalu.format('DD/MM/YYYY HH:mm:ss'),
      is_valid: tglSewaMoment.isSameOrAfter(sepuluhMenitLalu),
    });

    if (tglSewaMoment.isBefore(sepuluhMenitLalu)) {
      throw new BadRequestException('Tanggal sewa tidak boleh di masa lalu');
    }
  }

  // ✅ METHOD: Validasi tanggal kembali setelah tanggal sewa
  private validateReturnDateAfterRentalDate(
    tglSewaMoment: moment.Moment,
    tglKembaliMoment: moment.Moment,
  ): void {
    console.log('🕐 Validating return date:', {
      tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
      is_valid: tglKembaliMoment.isAfter(tglSewaMoment),
    });

    if (tglKembaliMoment.isSameOrBefore(tglSewaMoment)) {
      throw new BadRequestException(
        'Tanggal kembali harus setelah tanggal sewa',
      );
    }
  }

  // ✅ METHOD: Hitung durasi dan harga berdasarkan satuan
  private calculateDurationAndPrice(
    tglSewaMoment: moment.Moment,
    tglKembaliMoment: moment.Moment,
    satuanDurasi: string,
    hargaMotor: number,
  ): { durasi: number; baseHarga: number } {
    let durasi: number;
    let baseHarga: number;

    if (satuanDurasi === 'jam') {
      // Untuk per jam
      durasi = Math.ceil(tglKembaliMoment.diff(tglSewaMoment, 'hours', true));
      baseHarga = Math.ceil((hargaMotor / 24) * durasi);

      // Minimal 1 jam
      if (durasi < 1) {
        durasi = 1;
        baseHarga = Math.ceil(hargaMotor / 24);
      }
    } else {
      // Untuk harian
      const diffInHours = tglKembaliMoment.diff(tglSewaMoment, 'hours', true);

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

  // Helper function untuk menghitung total dari additional costs
  private calculateAdditionalCostsTotals(
    additionalCosts: AdditionalCostItem[],
  ): {
    totalDiscount: number;
    totalAdditional: number;
    netAdditionalCosts: number;
  } {
    let totalDiscount = 0;
    let totalAdditional = 0;

    if (additionalCosts && additionalCosts.length > 0) {
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

  // ✅ METHOD: Konversi jaminan array ke string
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

      // ✅ Convert semua dates ke string WIB untuk response
      return sewas.map((sewa) => ({
        ...sewa,
        tgl_sewa: this.formatDateToWIB(sewa.tgl_sewa),
        tgl_kembali: this.formatDateToWIB(sewa.tgl_kembali),
        created_at: this.formatDateToWIB(sewa.created_at),
        updated_at: this.formatDateToWIB(sewa.updated_at),
      }));
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

      // ✅ Convert semua dates ke string WIB untuk response
      return {
        ...sewa,
        tgl_sewa: this.formatDateToWIB(sewa.tgl_sewa),
        tgl_kembali: this.formatDateToWIB(sewa.tgl_kembali),
        created_at: this.formatDateToWIB(sewa.created_at),
        updated_at: this.formatDateToWIB(sewa.updated_at),
        histories: sewa.histories.map((history) => ({
          ...history,
          tgl_selesai: this.formatDateToWIB(history.tgl_selesai),
          created_at: this.formatDateToWIB(history.created_at),
          updated_at: this.formatDateToWIB(history.updated_at),
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(`Error in findOne ID ${id}:`, error);
      throw new InternalServerErrorException('Gagal mengambil data sewa');
    }
  }

  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      try {
        console.log('=== 🚀 CREATE SEWA PROCESS ===');

        // Validasi motor tersedia
        const motor = await prisma.motor.findUnique({
          where: { id: createSewaDto.motor_id },
        });

        if (!motor) {
          throw new NotFoundException('Motor tidak ditemukan');
        }

        if (motor.status !== 'tersedia') {
          throw new BadRequestException('Motor tidak tersedia untuk disewa');
        }

        // Validasi penyewa
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

        // ✅ PARSE DAN VALIDASI DATES DENGAN WIB
        console.log('=== 🕐 DATE PROCESSING ===');

        const tglSewaDate = this.parseAndValidateWIBDate(
          createSewaDto.tgl_sewa,
          'Tanggal sewa',
        );
        const tglKembaliDate = this.parseAndValidateWIBDate(
          createSewaDto.tgl_kembali,
          'Tanggal kembali',
        );

        // Untuk calculation, gunakan moment WIB
        const tglSewaMoment = this.getMomentWIB(tglSewaDate);
        const tglKembaliMoment = this.getMomentWIB(tglKembaliDate);

        console.log('📅 WIB Times for calculation:', {
          tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
          tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
        });

        // Validasi business rules
        this.validateRentalDateNotInPast(tglSewaMoment);
        this.validateReturnDateAfterRentalDate(tglSewaMoment, tglKembaliMoment);

        // Calculate duration dan harga
        const { durasi, baseHarga } = this.calculateDurationAndPrice(
          tglSewaMoment,
          tglKembaliMoment,
          createSewaDto.satuan_durasi,
          motor.harga,
        );

        // Hitung biaya tambahan dengan type
        const additionalCosts = createSewaDto.additional_costs || [];
        const { netAdditionalCosts } =
          this.calculateAdditionalCostsTotals(additionalCosts);

        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

        // Konversi jaminan
        const jaminanString = this.convertJaminanToString(
          createSewaDto.jaminan,
        );

        // ✅ SIMPAN KE DATABASE
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

        // Update status motor
        await prisma.motor.update({
          where: { id: createSewaDto.motor_id },
          data: { status: 'disewa' },
        });

        console.log('✅ Sewa created successfully:', {
          id: sewa.id,
          motor_id: sewa.motor_id,
          total_harga: sewa.total_harga,
        });

        // ✅ RETURN RESPONSE DENGAN FORMAT WIB
        return {
          ...sewa,
          tgl_sewa: this.formatDateToWIB(sewa.tgl_sewa),
          tgl_kembali: this.formatDateToWIB(sewa.tgl_kembali),
          created_at: this.formatDateToWIB(sewa.created_at),
          updated_at: this.formatDateToWIB(sewa.updated_at),
        };
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

          // Parse dan validasi tanggal kembali baru
          const tglKembaliDate = this.parseAndValidateWIBDate(
            updateSewaDto.tgl_kembali,
            'Tanggal kembali',
          );
          const tglKembaliMoment = this.getMomentWIB(tglKembaliDate);

          // Dapatkan tanggal sewa existing sebagai WIB
          const tglSewaMoment = this.getMomentWIB(sewa.tgl_sewa);

          console.log('📅 Date comparison for update:', {
            existing_tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
            new_tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
          });

          // Validasi tanggal kembali setelah tanggal sewa
          this.validateReturnDateAfterRentalDate(
            tglSewaMoment,
            tglKembaliMoment,
          );

          // Additional business logic validation
          const minDuration = sewa.satuan_durasi === 'jam' ? 1 : 1;
          const actualDuration =
            sewa.satuan_durasi === 'jam'
              ? tglKembaliMoment.diff(tglSewaMoment, 'hours', true)
              : tglKembaliMoment.diff(tglSewaMoment, 'days', true);

          if (actualDuration < minDuration) {
            throw new BadRequestException(
              `Durasi sewa minimal ${minDuration} ${sewa.satuan_durasi}`,
            );
          }

          updateData.tgl_kembali = tglKembaliDate;

          // Calculate new duration and price
          const { durasi, baseHarga } = this.calculateDurationAndPrice(
            tglSewaMoment,
            tglKembaliMoment,
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
          const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

          updateData.additional_costs =
            additionalCosts.length > 0 ? additionalCosts : null;
          updateData.total_harga = finalTotalHarga;
        }

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

        // ✅ Return sebagai WIB
        return {
          ...updatedSewa,
          tgl_sewa: this.formatDateToWIB(updatedSewa.tgl_sewa),
          tgl_kembali: this.formatDateToWIB(updatedSewa.tgl_kembali),
          created_at: this.formatDateToWIB(updatedSewa.created_at),
          updated_at: this.formatDateToWIB(updatedSewa.updated_at),
        };
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

        // ✅ Parse dan validasi tanggal selesai
        const tglSelesaiDate = this.parseAndValidateWIBDate(
          selesaiSewaDto.tgl_selesai,
          'Tanggal selesai',
        );
        const tglSelesaiMoment = this.getMomentWIB(tglSelesaiDate);

        // Dapatkan tanggal kembali sebagai WIB
        const tglKembaliMoment = this.getMomentWIB(sewa.tgl_kembali);

        console.log('📅 Completion date calculation:', {
          tgl_kembali_jadwal: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
          tgl_selesai_aktual: tglSelesaiMoment.format('DD/MM/YYYY HH:mm:ss'),
          is_late: tglSelesaiMoment.isAfter(tglKembaliMoment),
        });

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

        // Create history record
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

        // ✅ Return sebagai WIB
        return {
          ...history,
          tgl_selesai: this.formatDateToWIB(history.tgl_selesai),
          created_at: this.formatDateToWIB(history.created_at),
          updated_at: this.formatDateToWIB(history.updated_at),
        };
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

      // ✅ Return sebagai WIB
      return {
        ...updatedSewa,
        tgl_sewa: this.formatDateToWIB(updatedSewa.tgl_sewa),
        tgl_kembali: this.formatDateToWIB(updatedSewa.tgl_kembali),
        created_at: this.formatDateToWIB(updatedSewa.created_at),
        updated_at: this.formatDateToWIB(updatedSewa.updated_at),
      };
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

      // ✅ Convert semua dates ke string WIB untuk response
      return sewas.map((sewa) => ({
        ...sewa,
        tgl_sewa: this.formatDateToWIB(sewa.tgl_sewa),
        tgl_kembali: this.formatDateToWIB(sewa.tgl_kembali),
        created_at: this.formatDateToWIB(sewa.created_at),
        updated_at: this.formatDateToWIB(sewa.updated_at),
        histories: sewa.histories.map((history) => ({
          ...history,
          tgl_selesai: this.formatDateToWIB(history.tgl_selesai),
          created_at: this.formatDateToWIB(history.created_at),
          updated_at: this.formatDateToWIB(history.updated_at),
        })),
      }));
    } catch (error) {
      console.error('Error in findAllWithHistory:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil data sewa dengan history',
      );
    }
  }
}
