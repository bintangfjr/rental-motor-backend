// src/sewa/sewa.service.ts
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

// Interface untuk additional costs dengan type
interface AdditionalCostItem {
  description: string;
  amount: number;
  type: 'discount' | 'additional';
}

@Injectable()
export class SewaService {
  constructor(private prisma: PrismaService) {}

  private readonly STATUS = {
    AKTIF: 'aktif',
    SELESAI: 'selesai',
    DIBATALKAN: 'dibatalkan',
  };

  private readonly STATUS_SELESAI = {
    TEPAT_WAKTU: 'Tepat Waktu',
    TERLAMBAT: 'Terlambat',
  };

  // ✅ METHOD: Parse WIB string ke Date object (UTC)
  private parseWIBToUTC(dateString: string): Date {
    if (!dateString) return new Date();

    console.log('🔧 Parsing WIB to UTC:', dateString);

    try {
      let parsedDate: moment.Moment;

      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // Format: '2025-10-15' (date only)
        parsedDate = moment.tz(dateString, 'Asia/Jakarta').startOf('day');
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
        // Format: '2025-10-15T14:30' (datetime without timezone)
        parsedDate = moment.tz(dateString, 'Asia/Jakarta');
      } else {
        parsedDate = moment(dateString).tz('Asia/Jakarta');
      }

      // Convert to UTC untuk disimpan di database
      const utcDate = parsedDate.utc().toDate();

      console.log('✅ WIB to UTC result:', {
        input: dateString,
        wib: parsedDate.format(),
        utc: utcDate.toISOString(),
        locale: utcDate.toLocaleString('id-ID'),
      });

      return utcDate;
    } catch (error) {
      console.error('❌ Error parsing date:', error);
      return new Date();
    }
  }

  // ✅ METHOD: Convert UTC Date dari database ke WIB untuk response
  private convertUTCToWIB(date: Date): Date {
    if (!date) return new Date();

    const wibDate = moment(date).tz('Asia/Jakarta').toDate();

    console.log('🔄 UTC to WIB:', {
      utc: date.toISOString(),
      wib: wibDate.toISOString(),
    });

    return wibDate;
  }

  // ✅ METHOD: Untuk calculation, parse sebagai WIB moment
  private parseWIBMoment(dateString: string): moment.Moment {
    return moment.tz(dateString, 'Asia/Jakarta');
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

  async findAll() {
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

    // ✅ Convert semua UTC dates ke WIB untuk response
    return sewas.map((sewa) => ({
      ...sewa,
      tgl_sewa: this.convertUTCToWIB(sewa.tgl_sewa),
      tgl_kembali: this.convertUTCToWIB(sewa.tgl_kembali),
      created_at: this.convertUTCToWIB(sewa.created_at),
      updated_at: this.convertUTCToWIB(sewa.updated_at),
    }));
  }

  async findOne(id: number) {
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
        histories: true,
      },
    });

    if (!sewa) {
      throw new NotFoundException('Sewa tidak ditemukan');
    }

    // ✅ Convert semua UTC dates ke WIB untuk response
    return {
      ...sewa,
      tgl_sewa: this.convertUTCToWIB(sewa.tgl_sewa),
      tgl_kembali: this.convertUTCToWIB(sewa.tgl_kembali),
      created_at: this.convertUTCToWIB(sewa.created_at),
      updated_at: this.convertUTCToWIB(sewa.updated_at),
      histories: sewa.histories.map((history) => ({
        ...history,
        tgl_selesai: this.convertUTCToWIB(history.tgl_selesai),
        created_at: this.convertUTCToWIB(history.created_at),
        updated_at: this.convertUTCToWIB(history.updated_at),
      })),
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

      // ✅ PERBAIKAN: Parse WIB input ke UTC untuk database
      console.log('=== 🕐 CREATE - DATE CONVERSION ===');
      console.log('Input WIB - tgl_sewa:', createSewaDto.tgl_sewa);
      console.log('Input WIB - tgl_kembali:', createSewaDto.tgl_kembali);

      const tglSewaUTC = this.parseWIBToUTC(createSewaDto.tgl_sewa);
      const tglKembaliUTC = this.parseWIBToUTC(createSewaDto.tgl_kembali);

      console.log('Stored UTC - tgl_sewa:', tglSewaUTC.toISOString());
      console.log('Stored UTC - tgl_kembali:', tglKembaliUTC.toISOString());
      console.log('================================');

      // ✅ Untuk calculation, gunakan WIB moments
      const tglSewaMoment = this.parseWIBMoment(createSewaDto.tgl_sewa);
      const tglKembaliMoment = this.parseWIBMoment(createSewaDto.tgl_kembali);

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

      if (durasi < 1) {
        durasi = 1;
        if (createSewaDto.satuan_durasi === 'jam') {
          baseHarga = Math.ceil(motor.harga / 24);
        } else {
          baseHarga = motor.harga;
        }
      }

      // Hitung biaya tambahan dengan type
      const additionalCosts =
        (createSewaDto.additional_costs as AdditionalCostItem[]) || [];
      const { totalDiscount, totalAdditional, netAdditionalCosts } =
        this.calculateAdditionalCostsTotals(additionalCosts);

      const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

      // Konversi jaminan dari array ke string
      const jaminanString = Array.isArray(createSewaDto.jaminan)
        ? createSewaDto.jaminan.join(', ')
        : createSewaDto.jaminan;

      // ✅ Simpan ke database sebagai UTC
      const sewa = await prisma.sewa.create({
        data: {
          motor_id: createSewaDto.motor_id,
          penyewa_id: createSewaDto.penyewa_id,
          admin_id: adminId,
          status: 'aktif',
          jaminan: jaminanString,
          pembayaran: createSewaDto.pembayaran,
          durasi_sewa: durasi,
          tgl_sewa: tglSewaUTC, // ✅ Stored as UTC
          tgl_kembali: tglKembaliUTC, // ✅ Stored as UTC
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

      console.log('✅ Sewa created - Database stored as UTC:', {
        id: sewa.id,
        tgl_sewa_db: sewa.tgl_sewa,
        tgl_kembali_db: sewa.tgl_kembali,
      });

      // Update motor status to 'disewa'
      await prisma.motor.update({
        where: { id: createSewaDto.motor_id },
        data: { status: 'disewa' },
      });

      // ✅ Return sebagai WIB
      return {
        ...sewa,
        tgl_sewa: this.convertUTCToWIB(sewa.tgl_sewa),
        tgl_kembali: this.convertUTCToWIB(sewa.tgl_kembali),
      };
    });
  }

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
        // ✅ BUSINESS LOGIC VALIDATION - Validasi tanggal kembali
        const tglSewaWIB = this.convertUTCToWIB(sewa.tgl_sewa);
        const tglSewaMoment = moment(tglSewaWIB);
        const tglKembaliMoment = this.parseWIBMoment(updateSewaDto.tgl_kembali);

        console.log('🔍 [Update Validation] Comparing dates:');
        console.log('  - existing tgl_sewa:', tglSewaMoment.format());
        console.log('  - new tgl_kembali:', tglKembaliMoment.format());
        console.log('  - result:', tglKembaliMoment > tglSewaMoment);

        // Validate new return date
        if (tglSewaMoment.isSameOrAfter(tglKembaliMoment)) {
          throw new BadRequestException(
            'Tanggal kembali harus setelah tanggal sewa',
          );
        }

        // Additional business logic validation
        const minDuration = sewa.satuan_durasi === 'jam' ? 1 : 1; // minimal 1 jam atau 1 hari
        const actualDuration =
          sewa.satuan_durasi === 'jam'
            ? tglKembaliMoment.diff(tglSewaMoment, 'hours', true)
            : tglKembaliMoment.diff(tglSewaMoment, 'days', true);

        if (actualDuration < minDuration) {
          throw new BadRequestException(
            `Durasi sewa minimal ${minDuration} ${sewa.satuan_durasi}`,
          );
        }

        // ✅ Parse WIB input ke UTC untuk database
        const tglKembaliUTC = this.parseWIBToUTC(updateSewaDto.tgl_kembali);
        updateData.tgl_kembali = tglKembaliUTC;

        // Calculate new duration and price
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

          if (diffInHours <= 24) {
            durasi = 1;
            baseHarga = sewa.motor.harga;
          } else {
            durasi = Math.ceil(diffInHours / 24);
            baseHarga = sewa.motor.harga * durasi;
          }
        }

        updateData.durasi_sewa = durasi;
        updateData.total_harga = baseHarga;
      }

      // Handle additional_costs update
      if (updateSewaDto.additional_costs !== undefined) {
        const additionalCosts =
          (updateSewaDto.additional_costs as AdditionalCostItem[]) || [];
        const { netAdditionalCosts } =
          this.calculateAdditionalCostsTotals(additionalCosts);

        const baseHarga = updateData.total_harga || sewa.total_harga;
        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

        updateData.additional_costs =
          additionalCosts.length > 0 ? additionalCosts : null;
        updateData.total_harga = finalTotalHarga;
      }

      if (updateSewaDto.jaminan !== undefined) {
        const jaminanString = Array.isArray(updateSewaDto.jaminan)
          ? updateSewaDto.jaminan.join(', ')
          : updateSewaDto.jaminan;
        updateData.jaminan = jaminanString;
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

      // ✅ Return sebagai WIB
      return {
        ...updatedSewa,
        tgl_sewa: this.convertUTCToWIB(updatedSewa.tgl_sewa),
        tgl_kembali: this.convertUTCToWIB(updatedSewa.tgl_kembali),
      };
    });
  }

  async selesai(id: number, selesaiSewaDto: SelesaiSewaDto) {
    return this.prisma.$transaction(async (prisma) => {
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

      // ✅ Parse WIB input ke UTC untuk database
      const tglSelesaiUTC = this.parseWIBToUTC(selesaiSewaDto.tgl_selesai);

      // ✅ Untuk calculation, gunakan dates sebagai WIB
      const tglKembaliWIB = this.convertUTCToWIB(sewa.tgl_kembali);
      const tglKembaliMoment = moment(tglKembaliWIB);
      const tglSelesaiMoment = this.parseWIBMoment(selesaiSewaDto.tgl_selesai);

      console.log('=== 🕐 SELESAI - DATE CALCULATION ===');
      console.log(
        'tgl_kembali_jadwal (WIB):',
        tglKembaliWIB.toLocaleString('id-ID'),
      );
      console.log('tgl_selesai_aktual (WIB):', selesaiSewaDto.tgl_selesai);
      console.log('==================================');

      let denda = 0;
      let statusSelesai = this.STATUS_SELESAI.TEPAT_WAKTU;
      let keterlambatanMenit = 0;

      // Calculate penalty if late - gunakan WIB moments
      if (tglSelesaiMoment > tglKembaliMoment) {
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
      }

      // Create history record dengan UTC
      const history = await prisma.history.create({
        data: {
          sewa_id: id,
          tgl_selesai: tglSelesaiUTC, // ✅ Stored as UTC
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

      // ✅ Return sebagai WIB
      return {
        ...history,
        tgl_selesai: this.convertUTCToWIB(history.tgl_selesai),
      };
    });
  }

  async remove(id: number) {
    return this.prisma.$transaction(async (prisma) => {
      const sewa = await prisma.sewa.findUnique({
        where: { id },
        include: { motor: true, histories: true },
      });

      if (!sewa) {
        throw new NotFoundException('Sewa tidak ditemukan');
      }

      if (sewa.status !== this.STATUS.SELESAI) {
        await prisma.motor.update({
          where: { id: sewa.motor_id },
          data: { status: 'tersedia' },
        });
      }

      if (sewa.histories.length > 0) {
        await prisma.history.deleteMany({
          where: { sewa_id: id },
        });
      }

      await prisma.sewa.delete({
        where: { id },
      });

      return { message: 'Data sewa berhasil dihapus' };
    });
  }

  async updateNotes(id: number, catatan_tambahan: string) {
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

    // ✅ Return sebagai WIB
    return {
      ...updatedSewa,
      tgl_sewa: this.convertUTCToWIB(updatedSewa.tgl_sewa),
      tgl_kembali: this.convertUTCToWIB(updatedSewa.tgl_kembali),
    };
  }

  async findAllWithHistory() {
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

    // ✅ Convert semua UTC dates ke WIB untuk response
    return sewas.map((sewa) => ({
      ...sewa,
      tgl_sewa: this.convertUTCToWIB(sewa.tgl_sewa),
      tgl_kembali: this.convertUTCToWIB(sewa.tgl_kembali),
      created_at: this.convertUTCToWIB(sewa.created_at),
      updated_at: this.convertUTCToWIB(sewa.updated_at),
      histories: sewa.histories.map((history) => ({
        ...history,
        tgl_selesai: this.convertUTCToWIB(history.tgl_selesai),
        created_at: this.convertUTCToWIB(history.created_at),
        updated_at: this.convertUTCToWIB(history.updated_at),
      })),
    }));
  }
}
