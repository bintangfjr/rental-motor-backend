import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSewaDto } from './dto/create-sewa.dto';
import { UpdateSewaDto } from './dto/update-sewa.dto';
import { SelesaiSewaDto } from './dto/selesai-sewa.dto';
import * as moment from 'moment';

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

      // Parse dates
      const tglSewa = new Date(createSewaDto.tgl_sewa);
      const tglKembali = new Date(createSewaDto.tgl_kembali);

      // Validate dates
      if (tglSewa >= tglKembali) {
        throw new BadRequestException(
          'Tanggal kembali harus setelah tanggal sewa',
        );
      }

      // Calculate duration based on satuan_durasi
      let durasi: number;
      let baseHarga: number;

      if (createSewaDto.satuan_durasi === 'jam') {
        // Untuk satuan jam, hitung per jam dengan pembulatan ke atas
        durasi = Math.ceil(
          moment(tglKembali).diff(moment(tglSewa), 'hours', true),
        );
        baseHarga = Math.ceil((motor.harga / 24) * durasi);
      } else {
        // Untuk satuan hari, 1 hari = 24 jam
        const diffInHours = moment(tglKembali).diff(
          moment(tglSewa),
          'hours',
          true,
        );

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
        tgl_sewa: Date;
        tgl_kembali: Date;
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
        tgl_sewa: tglSewa,
        tgl_kembali: tglKembali,
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

      // Handle tgl_kembali yang optional di update
      const tglSewa = new Date(sewa.tgl_sewa);
      const tglKembali = updateSewaDto.tgl_kembali
        ? new Date(updateSewaDto.tgl_kembali)
        : new Date(sewa.tgl_kembali);

      // Validate new return date only if provided
      if (updateSewaDto.tgl_kembali && tglSewa >= tglKembali) {
        throw new BadRequestException(
          'Tanggal kembali harus setelah tanggal sewa',
        );
      }

      // Calculate new duration and price only if dates changed
      let durasi = sewa.durasi_sewa;
      let baseHarga = sewa.total_harga;

      if (updateSewaDto.tgl_kembali) {
        if (sewa.satuan_durasi === 'jam') {
          durasi = Math.ceil(
            moment(tglKembali).diff(moment(tglSewa), 'hours', true),
          );
          baseHarga = Math.ceil((sewa.motor.harga / 24) * durasi);
        } else {
          // Untuk satuan hari, 1 hari = 24 jam
          const diffInHours = moment(tglKembali).diff(
            moment(tglSewa),
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
      }

      // Hitung biaya tambahan dengan type
      const additionalCosts =
        (updateSewaDto.additional_costs as AdditionalCostItem[]) || [];
      const { totalDiscount, totalAdditional, netAdditionalCosts } =
        this.calculateAdditionalCostsTotals(additionalCosts);

      // Total harga = base harga + biaya tambahan - potongan
      const finalTotalHarga = Math.max(0, baseHarga + netAdditionalCosts);

      // Definisikan tipe data yang aman untuk update
      interface SewaUpdateData {
        durasi_sewa?: number;
        total_harga?: number;
        tgl_kembali?: Date;
        jaminan?: string;
        pembayaran?: string;
        additional_costs?: any;
        catatan_tambahan?: string;
      }

      const updateData: SewaUpdateData = {};

      // Only include fields that are provided
      if (updateSewaDto.tgl_kembali) {
        updateData.tgl_kembali = tglKembali;
        updateData.durasi_sewa = durasi;
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

      // Handle additional_costs
      if (updateSewaDto.additional_costs !== undefined) {
        updateData.additional_costs = additionalCosts;

        // Update total_harga jika ada perubahan additional_costs
        if (!updateSewaDto.tgl_kembali) {
          updateData.total_harga = finalTotalHarga;
        }
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
        baseHarga,
        totalDiscount,
        totalAdditional,
        netAdditionalCosts,
        finalTotalHarga,
        additionalCosts,
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

      const tglKembaliJadwal = new Date(sewa.tgl_kembali);
      const tglSelesaiAktual = new Date(selesaiSewaDto.tgl_selesai);

      let denda = 0;
      let statusSelesai = this.STATUS_SELESAI.TEPAT_WAKTU;
      let keterlambatanMenit = 0;

      // Calculate penalty if late
      if (tglSelesaiAktual > tglKembaliJadwal) {
        statusSelesai = this.STATUS_SELESAI.TERLAMBAT;

        if (sewa.satuan_durasi === 'jam') {
          // Calculate delay in minutes for hourly rentals
          keterlambatanMenit = Math.ceil(
            moment(tglSelesaiAktual).diff(
              moment(tglKembaliJadwal),
              'minutes',
              true,
            ),
          );
          const hargaPerJam = Math.ceil(sewa.motor.harga / 24);
          denda = Math.ceil((keterlambatanMenit / 60) * hargaPerJam * 0.5);
        } else {
          // Calculate delay in hours for daily rentals
          const jamTerlambat = moment(tglSelesaiAktual).diff(
            moment(tglKembaliJadwal),
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
          tgl_selesai: tglSelesaiAktual,
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
