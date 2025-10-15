// src/sewa/sewa.service.ts (VERSI DIPERBAIKI)
import {
  Injectable,
  BadRequestException,
  NotFoundException,
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

  // ✅ METHOD: Parse input ke Date object dengan timezone WIB
  private parseWIBDate(dateString: string, fieldName: string): Date {
    if (!dateString) {
      throw new BadRequestException(`${fieldName} tidak boleh kosong`);
    }

    console.log(`🔧 Parsing ${fieldName}:`, dateString);

    try {
      let parsedMoment: moment.Moment;

      // Handle berbagai format input
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // Format: '2025-10-15' (date only)
        parsedMoment = moment
          .tz(dateString, 'YYYY-MM-DD', this.TIMEZONE)
          .startOf('day');
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
        // Format: '2025-10-15T14:30' (datetime without timezone)
        parsedMoment = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', this.TIMEZONE);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}\.\d{2}$/.test(dateString)) {
        // Format: "15/10/2025, 17.26" dari frontend
        const [datePart, timePart] = dateString.split(', ');
        const [day, month, year] = datePart.split('/');
        const [hour, minute] = timePart.split('.');
        const isoFormat = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        parsedMoment = moment.tz(isoFormat, 'YYYY-MM-DDTHH:mm', this.TIMEZONE);
      } else {
        throw new BadRequestException(`Format ${fieldName} tidak didukung`);
      }

      if (!parsedMoment.isValid()) {
        throw new BadRequestException(`${fieldName} tidak valid`);
      }

      // ✅ Kembalikan sebagai Date object - Biarkan Prisma handle storage
      const date = parsedMoment.toDate();

      console.log(`✅ ${fieldName} parsed:`, {
        input: dateString,
        moment: parsedMoment.format('DD/MM/YYYY HH:mm:ss'),
        jsDate: date,
        timezone: this.TIMEZONE,
      });

      return date;
    } catch (error) {
      console.error(`❌ Error parsing ${fieldName}:`, error);
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

    return {
      totalDiscount,
      totalAdditional,
      netAdditionalCosts: totalAdditional - totalDiscount,
    };
  }

  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      // Check if motor exists and is available
      const motor = await prisma.motor.findUnique({
        where: { id: createSewaDto.motor_id },
      });

      if (!motor) {
        throw new NotFoundException('Motor tidak ditemukan');
      }

      if (motor.status !== 'tersedia') {
        throw new BadRequestException('Motor tidak tersedia untuk disewa');
      }

      // Check if penyewa exists and is not blacklisted
      const penyewa = await prisma.penyewa.findUnique({
        where: { id: createSewaDto.penyewa_id },
        include: {
          sewas: {
            where: {
              status: this.STATUS.AKTIF,
            },
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

      // ✅ PARSE DATES MENGGUNAKAN METHOD YANG BENAR
      console.log('=== 🕐 DATE PARSING ===');

      const tglSewaDate = this.parseWIBDate(
        createSewaDto.tgl_sewa,
        'Tanggal sewa',
      );
      const tglKembaliDate = this.parseWIBDate(
        createSewaDto.tgl_kembali,
        'Tanggal kembali',
      );

      // Untuk calculation, gunakan moment objects
      const tglSewaMoment = this.getMomentWIB(createSewaDto.tgl_sewa);
      const tglKembaliMoment = this.getMomentWIB(createSewaDto.tgl_kembali);

      console.log('📅 Date calculation:', {
        tgl_sewa: tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
        tgl_kembali: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
        diff_hours: tglKembaliMoment.diff(tglSewaMoment, 'hours', true),
      });

      // Validate dates
      if (tglSewaMoment.isSameOrAfter(tglKembaliMoment)) {
        throw new BadRequestException(
          'Tanggal kembali harus setelah tanggal sewa',
        );
      }

      // Calculate duration based on satuan_durasi
      let durasi: number;
      let baseHarga: number;

      if (createSewaDto.satuan_durasi === 'jam') {
        durasi = Math.ceil(tglKembaliMoment.diff(tglSewaMoment, 'hours', true));
        baseHarga = Math.ceil((motor.harga / 24) * durasi);
      } else {
        const diffInHours = tglKembaliMoment.diff(tglSewaMoment, 'hours', true);

        if (diffInHours <= 24) {
          durasi = 1;
          baseHarga = motor.harga;
        } else {
          durasi = Math.ceil(diffInHours / 24);
          baseHarga = motor.harga * durasi;
        }
      }

      // Ensure minimum duration
      if (durasi < 1) {
        durasi = 1;
        baseHarga =
          createSewaDto.satuan_durasi === 'jam'
            ? Math.ceil(motor.harga / 24)
            : motor.harga;
      }

      // Hitung biaya tambahan
      const additionalCosts = createSewaDto.additional_costs || [];
      const { netAdditionalCosts } =
        this.calculateAdditionalCostsTotals(additionalCosts);
      const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

      // Konversi jaminan
      const jaminanString = Array.isArray(createSewaDto.jaminan)
        ? createSewaDto.jaminan.join(', ')
        : createSewaDto.jaminan;

      // ✅ GUNAKAN PRISMA NORMAL - TANPA RAW SQL
      const sewa = await prisma.sewa.create({
        data: {
          motor_id: createSewaDto.motor_id,
          penyewa_id: createSewaDto.penyewa_id,
          admin_id: adminId,
          status: 'aktif',
          jaminan: jaminanString,
          pembayaran: createSewaDto.pembayaran,
          durasi_sewa: durasi,
          tgl_sewa: tglSewaDate, // ✅ Date object
          tgl_kembali: tglKembaliDate, // ✅ Date object
          total_harga: finalTotalHarga,
          satuan_durasi: createSewaDto.satuan_durasi,
          status_notifikasi: 'menunggu',
          additional_costs: additionalCosts.length > 0 ? additionalCosts : null,
          catatan_tambahan: createSewaDto.catatan_tambahan,
        },
        include: {
          motor: true,
          penyewa: true,
          admin: { select: { id: true, nama_lengkap: true } },
        },
      });

      // Update motor status
      await prisma.motor.update({
        where: { id: createSewaDto.motor_id },
        data: { status: 'disewa' },
      });

      console.log('✅ Sewa created successfully:', {
        id: sewa.id,
        tgl_sewa: sewa.tgl_sewa,
        tgl_kembali: sewa.tgl_kembali,
      });

      return sewa;
    });
  }

  // ... method lainnya (update, selesai, dll) juga gunakan approach yang sama
  // HAPUS SEMUA RAW SQL DAN GUNAKAN PRISMA NORMAL

  async update(id: number, updateSewaDto: UpdateSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
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
        const tglKembaliDate = this.parseWIBDate(
          updateSewaDto.tgl_kembali,
          'Tanggal kembali',
        );
        const tglKembaliMoment = this.getMomentWIB(updateSewaDto.tgl_kembali);
        const tglSewaMoment = this.getMomentWIB(sewa.tgl_sewa);

        // Validate
        if (tglSewaMoment.isSameOrAfter(tglKembaliMoment)) {
          throw new BadRequestException(
            'Tanggal kembali harus setelah tanggal sewa',
          );
        }

        updateData.tgl_kembali = tglKembaliDate;

        // Recalculate duration and price
        let durasi = sewa.durasi_sewa;
        let baseHarga = sewa.total_harga;

        if (sewa.satuan_durasi === 'jam') {
          durasi = Math.ceil(
            tglKembaliMoment.diff(tglSewaMoment, 'hours', true),
          );
          baseHarga = Math.ceil((sewa.motor.harga / 24) * durasi);
        } else {
          const diffInHours = tglKembaliMoment.diff(
            tglSewaMoment,
            'hours',
            true,
          );
          durasi = Math.ceil(diffInHours / 24);
          baseHarga = sewa.motor.harga * durasi;
        }

        updateData.durasi_sewa = durasi;
        updateData.total_harga = baseHarga;
      }

      // ... handle other fields (sama seperti sebelumnya)

      const updatedSewa = await prisma.sewa.update({
        where: { id },
        data: updateData,
        include: {
          motor: true,
          penyewa: true,
          admin: { select: { id: true, nama_lengkap: true } },
        },
      });

      return updatedSewa;
    });
  }
}
