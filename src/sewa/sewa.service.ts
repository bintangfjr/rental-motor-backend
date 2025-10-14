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

  // ✅ METHOD BARU: Parse datetime ke format SQL datetime string
  private parseDateTimeForDB(dateString: string): string {
    if (!dateString)
      return moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');

    console.log('🔧 Parsing date for DB:', dateString);

    try {
      let dateMoment: moment.Moment;

      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // Format: '2025-10-15' (date only)
        dateMoment = moment.tz(dateString, 'Asia/Jakarta').startOf('day');
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
        // Format: '2025-10-15T14:30' (datetime without timezone)
        dateMoment = moment.tz(dateString, 'Asia/Jakarta');
      } else {
        dateMoment = moment(dateString).tz('Asia/Jakarta');
      }

      const result = dateMoment.format('YYYY-MM-DD HH:mm:ss');

      console.log('✅ Date for DB:', {
        input: dateString,
        dbFormat: result,
        moment: dateMoment.format(),
        iso: dateMoment.toISOString(),
        timezone: 'Asia/Jakarta',
      });

      return result;
    } catch (error) {
      console.error('❌ Error parsing date for DB:', error);
      return moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
    }
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
    return this.prisma.sewa.findMany({
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

    return sewa;
  }

  async create(createSewaDto: CreateSewaDto, adminId: number) {
    return this.prisma.$transaction(async (prisma) => {
      // ✅ DEBUG: Cek timezone database session
      const dbTimezone =
        await prisma.$queryRaw`SELECT @@session.time_zone as timezone`;
      console.log('🗄️ Database session timezone:', dbTimezone);

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

      // ✅ PERBAIKAN: Parse dates sebagai string SQL datetime
      console.log('=== 🕐 DATE PARSING FOR DB ===');
      console.log('Input - tgl_sewa:', createSewaDto.tgl_sewa);
      console.log('Input - tgl_kembali:', createSewaDto.tgl_kembali);

      const tglSewaDB = this.parseDateTimeForDB(createSewaDto.tgl_sewa);
      const tglKembaliDB = this.parseDateTimeForDB(createSewaDto.tgl_kembali);

      console.log('For DB - tgl_sewa:', tglSewaDB);
      console.log('For DB - tgl_kembali:', tglKembaliDB);
      console.log('============================');

      // Untuk perhitungan duration, gunakan moment objects
      const tglSewaMoment = moment.tz(createSewaDto.tgl_sewa, 'Asia/Jakarta');
      const tglKembaliMoment = moment.tz(
        createSewaDto.tgl_kembali,
        'Asia/Jakarta',
      );

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
        // Untuk satuan jam, hitung per jam dengan pembulatan ke atas
        durasi = Math.ceil(tglKembaliMoment.diff(tglSewaMoment, 'hours', true));
        baseHarga = Math.ceil((motor.harga / 24) * durasi);
      } else {
        // Untuk satuan hari, 1 hari = 24 jam
        const diffInHours = tglKembaliMoment.diff(tglSewaMoment, 'hours', true);

        // Minimal 1 hari
        if (diffInHours <= 24) {
          durasi = 1;
          baseHarga = motor.harga;
        } else {
          // Untuk lebih dari 24 jam, hitung per 24 jam
          durasi = Math.ceil(diffInHours / 24);
          baseHarga = motor.harga * durasi;
        }
      }

      // Ensure minimum duration
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

      // Total harga = base harga + biaya tambahan - potongan
      const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

      // Konversi jaminan dari array ke string
      const jaminanString = Array.isArray(createSewaDto.jaminan)
        ? createSewaDto.jaminan.join(', ')
        : createSewaDto.jaminan;

      // Definisikan tipe data yang aman untuk Prisma
      interface SewaCreateData {
        motor_id: number;
        penyewa_id: number;
        admin_id: number;
        status: string;
        jaminan?: string;
        pembayaran?: string;
        durasi_sewa: number;
        tgl_sewa: string; // ✅ Changed from Date to string
        tgl_kembali: string; // ✅ Changed from Date to string
        total_harga: number;
        satuan_durasi: string;
        status_notifikasi: string;
        additional_costs?: any;
        catatan_tambahan?: string;
      }

      const data: SewaCreateData = {
        motor_id: createSewaDto.motor_id,
        penyewa_id: createSewaDto.penyewa_id,
        admin_id: adminId,
        status: this.STATUS.AKTIF,
        jaminan: jaminanString,
        pembayaran: createSewaDto.pembayaran,
        durasi_sewa: durasi,
        tgl_sewa: tglSewaDB, // ✅ SQL datetime string
        tgl_kembali: tglKembaliDB, // ✅ SQL datetime string
        total_harga: finalTotalHarga,
        satuan_durasi: createSewaDto.satuan_durasi,
        status_notifikasi: 'menunggu',
      };

      // Tambahkan additional_costs jika ada
      if (additionalCosts.length > 0) {
        data.additional_costs = additionalCosts;
      }

      // Tambahkan catatan tambahan jika ada
      if (createSewaDto.catatan_tambahan) {
        data.catatan_tambahan = createSewaDto.catatan_tambahan;
      }

      console.log('📦 Data to be inserted:', {
        tgl_sewa: data.tgl_sewa,
        tgl_kembali: data.tgl_kembali,
        type_tgl_sewa: typeof data.tgl_sewa,
        type_tgl_kembali: typeof data.tgl_kembali,
      });

      const sewa = await prisma.sewa.create({
        data: data,
        include: {
          motor: true,
          penyewa: true,
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
        },
      });

      console.log('✅ Sewa created with dates:', {
        id: sewa.id,
        tgl_sewa: sewa.tgl_sewa,
        tgl_kembali: sewa.tgl_kembali,
      });

      // Update motor status to 'disewa'
      await prisma.motor.update({
        where: { id: createSewaDto.motor_id },
        data: { status: 'disewa' },
      });

      // Debug log
      console.log('Sewa created with additional costs:', {
        baseHarga,
        totalDiscount,
        totalAdditional,
        netAdditionalCosts,
        finalTotalHarga,
        additionalCosts,
      });

      return sewa;
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
        const tglKembaliDB = this.parseDateTimeForDB(updateSewaDto.tgl_kembali);
        updateData.tgl_kembali = tglKembaliDB;

        // Debug logging untuk update
        console.log('=== 🕐 UPDATE DATE PARSING DEBUG ===');
        console.log('Input - tgl_kembali:', updateSewaDto.tgl_kembali);
        console.log('For DB - tgl_kembali:', tglKembaliDB);
        console.log('================================');

        // Untuk perhitungan duration, gunakan moment objects
        const tglSewaMoment = moment(sewa.tgl_sewa);
        const tglKembaliMoment = moment.tz(
          updateSewaDto.tgl_kembali,
          'Asia/Jakarta',
        );

        // Validate new return date
        if (tglSewaMoment.isSameOrAfter(tglKembaliMoment)) {
          throw new BadRequestException(
            'Tanggal kembali harus setelah tanggal sewa',
          );
        }

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

      // Hitung biaya tambahan dengan type
      const additionalCosts =
        (updateSewaDto.additional_costs as AdditionalCostItem[]) || [];
      const { totalDiscount, totalAdditional, netAdditionalCosts } =
        this.calculateAdditionalCostsTotals(additionalCosts);

      // Update total harga jika ada additional costs
      if (updateSewaDto.additional_costs !== undefined) {
        updateData.additional_costs = additionalCosts;

        const baseHarga = updateData.total_harga || sewa.total_harga;
        const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);
        updateData.total_harga = finalTotalHarga;
      }

      if (updateSewaDto.jaminan !== undefined) {
        updateData.jaminan = Array.isArray(updateSewaDto.jaminan)
          ? updateSewaDto.jaminan.join(', ')
          : updateSewaDto.jaminan;
      }

      if (updateSewaDto.pembayaran !== undefined) {
        updateData.pembayaran = updateSewaDto.pembayaran;
      }

      // Handle catatan tambahan
      if (updateSewaDto.catatan_tambahan !== undefined) {
        updateData.catatan_tambahan = updateSewaDto.catatan_tambahan;
      }

      // Jika tidak ada data yang diupdate, throw error
      if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('Tidak ada data yang diupdate');
      }

      // Debug log untuk melihat data yang akan diupdate
      console.log('Data update sewa:', {
        id,
        updateData,
      });

      return prisma.sewa.update({
        where: { id },
        data: updateData,
        include: {
          motor: true,
          penyewa: true,
          admin: {
            select: {
              id: true,
              nama_lengkap: true,
            },
          },
        },
      });
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

      // ✅ PERBAIKAN: Parse tgl_selesai sebagai string SQL datetime
      const tglSelesaiDB = this.parseDateTimeForDB(selesaiSewaDto.tgl_selesai);
      const tglKembaliJadwal = moment(sewa.tgl_kembali);
      const tglSelesaiMoment = moment.tz(
        selesaiSewaDto.tgl_selesai,
        'Asia/Jakarta',
      );

      console.log('=== 🕐 SELESAI DATE DEBUG ===');
      console.log('tgl_kembali_jadwal:', sewa.tgl_kembali);
      console.log('tgl_selesai_aktual:', tglSelesaiDB);
      console.log('==========================');

      let denda = 0;
      let statusSelesai = this.STATUS_SELESAI.TEPAT_WAKTU;
      let keterlambatanMenit = 0;

      // Calculate penalty if late
      if (tglSelesaiMoment > tglKembaliJadwal) {
        statusSelesai = this.STATUS_SELESAI.TERLAMBAT;

        if (sewa.satuan_durasi === 'jam') {
          // Calculate delay in minutes for hourly rentals
          keterlambatanMenit = Math.ceil(
            tglSelesaiMoment.diff(tglKembaliJadwal, 'minutes', true),
          );
          const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
          denda = Math.ceil((keterlambatanMenit / 60) * hargaPerJam * 0.5);
        } else {
          // Calculate delay in hours for daily rentals
          const jamTerlambat = tglSelesaiMoment.diff(
            tglKembaliJadwal,
            'hours',
            true,
          );
          // Denda dihitung per jam keterlambatan
          const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
          denda = Math.ceil(jamTerlambat * hargaPerJam * 0.5);
        }
      }

      // Create history record
      const history = await prisma.history.create({
        data: {
          sewa_id: id,
          tgl_selesai: tglSelesaiDB, // ✅ SQL datetime string
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
          status: this.STATUS.SELESAI,
          status_notifikasi: 'selesai',
        },
      });

      // Update motor status back to available
      await prisma.motor.update({
        where: { id: sewa.motor_id },
        data: { status: 'tersedia' },
      });

      return history;
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

      // If sewa is active, set motor back to available
      if (sewa.status !== this.STATUS.SELESAI) {
        await prisma.motor.update({
          where: { id: sewa.motor_id },
          data: { status: 'tersedia' },
        });
      }

      // Delete related histories first (if any)
      if (sewa.histories.length > 0) {
        await prisma.history.deleteMany({
          where: { sewa_id: id },
        });
      }

      // Delete sewa
      await prisma.sewa.delete({
        where: { id },
      });

      return { message: 'Data sewa berhasil dihapus' };
    });
  }

  // ✅ Method untuk update catatan
  async updateNotes(id: number, catatan_tambahan: string) {
    // Cek apakah sewa exists
    const sewa = await this.prisma.sewa.findUnique({
      where: { id },
    });

    if (!sewa) {
      throw new NotFoundException('Sewa tidak ditemukan');
    }

    // Update catatan tambahan
    return this.prisma.sewa.update({
      where: { id },
      data: {
        catatan_tambahan: catatan_tambahan,
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
    });
  }

  // ✅ Method untuk mendapatkan semua sewa termasuk yang selesai
  async findAllWithHistory() {
    return this.prisma.sewa.findMany({
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
  }
}
