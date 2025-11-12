import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface OverdueCalculationResult {
  isOverdue: boolean;
  overdueMinutes: number;
  overdueHours: number;
  overdueDays: number;
  status: string;
  denda: number;
  keterlambatanMenit: number;
  keterlambatanJam: number;
  keterlambatanHari: number;
  breakdown: {
    dendaPerMenit: number;
    dendaPerJam: number;
    dendaPerHari: number;
    totalDenda: number;
  };
}

export interface DendaCalculationParams {
  totalHargaSewa: number;
  durasiSewaJam: number;
  keterlambatanMenit: number;
  dendaRate?: number; // Default 50% (0.5)
  penaltyMultiplier?: number; // Multiplier penalty (default 1.5)
  minChargeUnit?: 'menit' | 'jam' | 'hari'; // Unit minimum charge
}

export interface DendaBreakdown {
  dendaPerMenit: number;
  dendaPerJam: number;
  dendaPerHari: number;
  totalDenda: number;
  penaltyApplied: number;
  calculationMethod: string;
}

@Injectable()
export class OverdueService {
  constructor(private prisma: PrismaService) {}

  // Konstanta untuk perhitungan
  private readonly MINUTES_IN_HOUR = 60;
  private readonly HOURS_IN_DAY = 24;
  private readonly MINUTES_IN_DAY = 24 * 60;
  private readonly DEFAULT_DENDA_RATE = 0.5; // 50%
  private readonly DEFAULT_PENALTY_MULTIPLIER = 1.5; // 50% penalty
  private readonly MIN_CHARGE_UNIT = 'jam'; // Minimum charge per jam

  /**
   * ✅ Hitung keterlambatan dalam MENIT berdasarkan tanggal kembali dan tanggal selesai
   */
  calculateKeterlambatanMenit(tglSelesai: Date, tglKembali: Date): number {
    if (tglSelesai <= tglKembali) return 0;

    const diffMs = tglSelesai.getTime() - tglKembali.getTime();
    return Math.ceil(diffMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * ✅ Hitung keterlambatan dalam MENIT untuk sewa aktif (real-time)
   */
  calculateOverdueMinutes(sewa: any): number {
    const sekarang = new Date();
    const tglKembali = sewa.tgl_kembali;

    if (sekarang <= tglKembali) return 0;

    const diffMs = sekarang.getTime() - tglKembali.getTime();
    return Math.ceil(diffMs / (1000 * 60)); // Return menit
  }

  /**
   * ✅ Hitung harga per jam berdasarkan total harga sewa dan durasi
   */
  calculateHargaPerJam(totalHargaSewa: number, durasiSewaJam: number): number {
    if (durasiSewaJam <= 0) return 0;
    return Math.ceil(totalHargaSewa / durasiSewaJam);
  }

  /**
   * ✅ Hitung harga per menit berdasarkan harga per jam
   */
  calculateHargaPerMenit(hargaPerJam: number): number {
    return hargaPerJam / this.MINUTES_IN_HOUR;
  }

  /**
   * ✅ Hitung harga per hari berdasarkan total harga sewa dan durasi
   */
  calculateHargaPerHari(
    totalHargaSewa: number,
    durasiSewaHari: number,
  ): number {
    if (durasiSewaHari <= 0) return 0;
    return Math.ceil(totalHargaSewa / durasiSewaHari);
  }

  /**
   * ✅ Hitung breakdown denda dengan sistem penalty
   */
  calculateDendaBreakdown(params: DendaCalculationParams): DendaBreakdown {
    const {
      totalHargaSewa,
      durasiSewaJam,
      keterlambatanMenit,
      dendaRate = this.DEFAULT_DENDA_RATE,
      penaltyMultiplier = this.DEFAULT_PENALTY_MULTIPLIER,
      minChargeUnit = this.MIN_CHARGE_UNIT,
    } = params;

    if (keterlambatanMenit <= 0) {
      return {
        dendaPerMenit: 0,
        dendaPerJam: 0,
        dendaPerHari: 0,
        totalDenda: 0,
        penaltyApplied: 0,
        calculationMethod: 'Tidak ada keterlambatan',
      };
    }

    // Hitung harga dasar
    const hargaPerJam = this.calculateHargaPerJam(
      totalHargaSewa,
      durasiSewaJam,
    );
    const hargaPerMenit = this.calculateHargaPerMenit(hargaPerJam);
    const hargaPerHari = this.calculateHargaPerHari(
      totalHargaSewa,
      durasiSewaJam / this.HOURS_IN_DAY,
    );

    console.log('💰 HARGA DASAR:', {
      hargaPerJam,
      hargaPerMenit,
      hargaPerHari,
      durasiSewaJam,
    });

    // Hitung denda tanpa penalty (proporsional)
    const dendaMenitProporsional =
      hargaPerMenit * dendaRate * keterlambatanMenit;
    const dendaJamProporsional =
      hargaPerJam * dendaRate * (keterlambatanMenit / this.MINUTES_IN_HOUR);
    const dendaHariProporsional =
      hargaPerHari * dendaRate * (keterlambatanMenit / this.MINUTES_IN_DAY);

    // Hitung denda dengan penalty
    const dendaMenitWithPenalty =
      hargaPerMenit * dendaRate * penaltyMultiplier * keterlambatanMenit;
    const dendaJamWithPenalty =
      hargaPerJam *
      dendaRate *
      penaltyMultiplier *
      Math.ceil(keterlambatanMenit / this.MINUTES_IN_HOUR);
    const dendaHariWithPenalty =
      hargaPerHari *
      dendaRate *
      penaltyMultiplier *
      Math.ceil(keterlambatanMenit / this.MINUTES_IN_DAY);

    // Tentukan metode perhitungan berdasarkan durasi keterlambatan
    let calculationMethod = '';
    let totalDenda = 0;

    // LOGIKA PERHITUNGAN BERDASARKAN DURASI
    if (keterlambatanMenit <= 120) {
      // ≤ 2 jam: hitung per menit dengan penalty
      calculationMethod = 'per_menit_penalty';
      totalDenda = Math.ceil(dendaMenitWithPenalty);
    } else if (keterlambatanMenit <= 480) {
      // ≤ 8 jam: hitung per jam dengan penalty (pembulatan ke atas)
      calculationMethod = 'per_jam_penalty';
      totalDenda = Math.ceil(dendaJamWithPenalty);
    } else {
      // > 8 jam: hitung per hari dengan penalty (pembulatan ke atas)
      calculationMethod = 'per_hari_penalty';
      totalDenda = Math.ceil(dendaHariWithPenalty);
    }

    // Minimum charge: minimal 1 jam denda
    const minDenda = Math.ceil(hargaPerJam * dendaRate * penaltyMultiplier);
    if (totalDenda < minDenda) {
      totalDenda = minDenda;
      calculationMethod = 'min_charge_1_jam';
    }

    const result: DendaBreakdown = {
      dendaPerMenit: Math.ceil(
        (dendaMenitWithPenalty / keterlambatanMenit) *
          (keterlambatanMenit > 0 ? 1 : 0),
      ),
      dendaPerJam: Math.ceil(
        (dendaJamWithPenalty /
          Math.ceil(keterlambatanMenit / this.MINUTES_IN_HOUR)) *
          (keterlambatanMenit > 0 ? 1 : 0),
      ),
      dendaPerHari: Math.ceil(
        (dendaHariWithPenalty /
          Math.ceil(keterlambatanMenit / this.MINUTES_IN_DAY)) *
          (keterlambatanMenit > 0 ? 1 : 0),
      ),
      totalDenda,
      penaltyApplied: penaltyMultiplier,
      calculationMethod,
    };

    console.log('🔍 BREAKDOWN DENDA:', {
      keterlambatanMenit,
      hours: keterlambatanMenit / this.MINUTES_IN_HOUR,
      days: keterlambatanMenit / this.MINUTES_IN_DAY,
      dendaProporsional: {
        menit: dendaMenitProporsional,
        jam: dendaJamProporsional,
        hari: dendaHariProporsional,
      },
      dendaWithPenalty: {
        menit: dendaMenitWithPenalty,
        jam: dendaJamWithPenalty,
        hari: dendaHariWithPenalty,
      },
      finalResult: result,
      minDenda,
    });

    return result;
  }

  /**
   * ✅ Hitung denda berdasarkan parameter yang diberikan dengan sistem penalty
   */
  calculateDenda(params: DendaCalculationParams): number {
    const breakdown = this.calculateDendaBreakdown(params);
    return breakdown.totalDenda;
  }

  /**
   * ✅ Hitung semua aspek overdue untuk sewa tertentu dengan breakdown lengkap
   */
  calculateOverdueForSewa(sewa: any): OverdueCalculationResult {
    const overdueMinutes = this.calculateOverdueMinutes(sewa);
    const isOverdue = overdueMinutes > 0;

    // Tentukan status berdasarkan kondisi
    let status = sewa.status;
    if (isOverdue && sewa.status === 'aktif') {
      status = 'Lewat Tempo';
    }

    // Hitung denda jika ada keterlambatan
    let denda = 0;
    let breakdown: DendaBreakdown = {
      dendaPerMenit: 0,
      dendaPerJam: 0,
      dendaPerHari: 0,
      totalDenda: 0,
      penaltyApplied: 0,
      calculationMethod: 'Tidak ada keterlambatan',
    };

    if (isOverdue) {
      const durasiSewaJam =
        sewa.durasi_sewa *
        (sewa.satuan_durasi === 'hari' ? this.HOURS_IN_DAY : 1);

      breakdown = this.calculateDendaBreakdown({
        totalHargaSewa: sewa.total_harga,
        durasiSewaJam: durasiSewaJam,
        keterlambatanMenit: overdueMinutes,
        dendaRate: 0.5, // 50%
        penaltyMultiplier: 1.5, // 50% penalty
      });

      denda = breakdown.totalDenda;
    }

    return {
      isOverdue,
      overdueMinutes,
      overdueHours: Math.ceil(overdueMinutes / this.MINUTES_IN_HOUR),
      overdueDays: Math.ceil(overdueMinutes / this.MINUTES_IN_DAY),
      status,
      denda,
      keterlambatanMenit: overdueMinutes,
      keterlambatanJam: Math.ceil(overdueMinutes / this.MINUTES_IN_HOUR),
      keterlambatanHari: Math.ceil(overdueMinutes / this.MINUTES_IN_DAY),
      breakdown,
    };
  }

  /**
   * ✅ Update overdue status untuk sewa tertentu
   */
  async updateOverdueStatus(id: number): Promise<OverdueCalculationResult> {
    try {
      const sewa = await this.prisma.sewa.findUnique({
        where: { id },
        include: { motor: true },
      });

      if (!sewa || sewa.status !== 'aktif') {
        throw new BadRequestException(
          `Sewa dengan ID ${id} tidak ditemukan atau tidak aktif`,
        );
      }

      const overdueResult = this.calculateOverdueForSewa(sewa);

      console.log(`🔍 CALCULATE OVERDUE sewa ID ${id}:`, {
        sekarang: new Date().toLocaleString('id-ID'),
        tgl_kembali: sewa.tgl_kembali.toLocaleString('id-ID'),
        overdue_minutes: overdueResult.overdueMinutes,
        overdue_hours: overdueResult.overdueHours,
        overdue_days: overdueResult.overdueDays,
        is_overdue: overdueResult.isOverdue,
        status_sebelum: sewa.status,
        status_setelah: overdueResult.status,
        denda: overdueResult.denda,
        breakdown: overdueResult.breakdown,
      });

      // Update database jika ada perubahan
      if (
        overdueResult.isOverdue !== sewa.is_overdue ||
        overdueResult.overdueMinutes !== sewa.overdue_hours
      ) {
        const updateData: any = {
          is_overdue: overdueResult.isOverdue,
          overdue_hours: overdueResult.overdueMinutes, // Sekarang menyimpan menit
          last_overdue_calc: new Date(),
        };

        // Jika overdue, update status juga
        if (overdueResult.isOverdue && sewa.status === 'aktif') {
          updateData.status = 'Lewat Tempo';
        }

        await this.prisma.sewa.update({
          where: { id },
          data: updateData,
        });

        console.log(`🔄 UPDATED OVERDUE STATUS sewa ID ${id}:`, {
          was_status: sewa.status,
          now_status: updateData.status || sewa.status,
          was_overdue: sewa.is_overdue,
          now_overdue: overdueResult.isOverdue,
          was_minutes: sewa.overdue_hours,
          now_minutes: overdueResult.overdueMinutes,
          denda: overdueResult.denda,
        });
      }

      return overdueResult;
    } catch (error) {
      console.error(
        `❌ Error in updateOverdueStatus for sewa ID ${id}:`,
        error,
      );
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        'Gagal memperbarui status overdue',
      );
    }
  }

  /**
   * ✅ Update overdue status untuk semua sewa aktif
   */
  async updateAllActiveSewasOverdueStatus(): Promise<{
    total: number;
    updated: number;
    overdue: number;
    totalDenda: number;
  }> {
    try {
      const activeSewas = await this.prisma.sewa.findMany({
        where: { status: 'aktif' },
        include: { motor: true },
      });

      let updatedCount = 0;
      let overdueCount = 0;
      let totalDenda = 0;

      for (const sewa of activeSewas) {
        const overdueResult = this.calculateOverdueForSewa(sewa);

        // Cek jika perlu update database
        if (
          overdueResult.isOverdue !== sewa.is_overdue ||
          overdueResult.overdueMinutes !== sewa.overdue_hours
        ) {
          const updateData: any = {
            is_overdue: overdueResult.isOverdue,
            overdue_hours: overdueResult.overdueMinutes,
            last_overdue_calc: new Date(),
          };

          if (overdueResult.isOverdue && sewa.status === 'aktif') {
            updateData.status = 'Lewat Tempo';
          }

          await this.prisma.sewa.update({
            where: { id: sewa.id },
            data: updateData,
          });

          updatedCount++;
        }

        if (overdueResult.isOverdue) {
          overdueCount++;
          totalDenda += overdueResult.denda;
        }
      }

      console.log(
        `✅ Updated overdue status for ${updatedCount} out of ${activeSewas.length} active sewas`,
        { totalDenda, overdueCount },
      );

      return {
        total: activeSewas.length,
        updated: updatedCount,
        overdue: overdueCount,
        totalDenda,
      };
    } catch (error) {
      console.error('❌ Error in updateAllActiveSewasOverdueStatus:', error);
      throw new InternalServerErrorException(
        'Gagal memperbarui status overdue untuk semua sewa',
      );
    }
  }

  /**
   * ✅ Hitung denda untuk penyelesaian sewa dengan breakdown lengkap
   */
  async calculateDendaForSelesai(
    sewaId: number,
    tglSelesai: Date,
  ): Promise<{
    denda: number;
    keterlambatanMenit: number;
    keterlambatanJam: number;
    keterlambatanHari: number;
    statusSelesai: string;
    perhitungan: any;
    breakdown: DendaBreakdown;
  }> {
    try {
      const sewa = await this.prisma.sewa.findUnique({
        where: { id: sewaId },
        include: { motor: true },
      });

      if (!sewa) {
        throw new BadRequestException(
          `Sewa dengan ID ${sewaId} tidak ditemukan`,
        );
      }

      let denda = 0;
      let statusSelesai = 'Tepat Waktu';
      let keterlambatanMenit = 0;
      let breakdown: DendaBreakdown = {
        dendaPerMenit: 0,
        dendaPerJam: 0,
        dendaPerHari: 0,
        totalDenda: 0,
        penaltyApplied: 0,
        calculationMethod: 'Tidak ada keterlambatan',
      };

      console.log(`🔍 DATA SEWA UNTUK PERHITUNGAN DENDA:`, {
        status: sewa.status,
        is_overdue: sewa.is_overdue,
        overdue_hours: sewa.overdue_hours,
        total_harga: sewa.total_harga,
        durasi_sewa: sewa.durasi_sewa,
        satuan_durasi: sewa.satuan_durasi,
        tgl_kembali: sewa.tgl_kembali,
        tgl_selesai: tglSelesai,
      });

      // Hitung keterlambatan
      if (
        sewa.status === 'Lewat Tempo' ||
        sewa.is_overdue ||
        tglSelesai > sewa.tgl_kembali
      ) {
        statusSelesai = 'Terlambat';

        // Gunakan overdue_hours (dalam menit) jika ada, atau hitung manual
        if (sewa.overdue_hours > 0) {
          keterlambatanMenit = sewa.overdue_hours;
        } else {
          keterlambatanMenit = this.calculateKeterlambatanMenit(
            tglSelesai,
            sewa.tgl_kembali,
          );
        }

        // Hitung denda dengan breakdown
        const durasiSewaJam =
          sewa.durasi_sewa *
          (sewa.satuan_durasi === 'hari' ? this.HOURS_IN_DAY : 1);

        breakdown = this.calculateDendaBreakdown({
          totalHargaSewa: sewa.total_harga,
          durasiSewaJam: durasiSewaJam,
          keterlambatanMenit: keterlambatanMenit,
          dendaRate: 0.5, // 50%
          penaltyMultiplier: 1.5, // 50% penalty
        });

        denda = breakdown.totalDenda;
      }

      const perhitungan = {
        total_harga_sewa: sewa.total_harga,
        durasi_sewa_jam:
          sewa.durasi_sewa *
          (sewa.satuan_durasi === 'hari' ? this.HOURS_IN_DAY : 1),
        keterlambatan_menit: keterlambatanMenit,
        keterlambatan_jam: Math.ceil(keterlambatanMenit / this.MINUTES_IN_HOUR),
        keterlambatan_hari: Math.ceil(keterlambatanMenit / this.MINUTES_IN_DAY),
        denda_calculated: denda,
        breakdown,
      };

      return {
        denda,
        keterlambatanMenit,
        keterlambatanJam: Math.ceil(keterlambatanMenit / this.MINUTES_IN_HOUR),
        keterlambatanHari: Math.ceil(keterlambatanMenit / this.MINUTES_IN_DAY),
        statusSelesai,
        perhitungan,
        breakdown,
      };
    } catch (error) {
      console.error(
        `❌ Error in calculateDendaForSelesai for sewa ID ${sewaId}:`,
        error,
      );
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Gagal menghitung denda');
    }
  }

  /**
   * ✅ Dapatkan statistik overdue
   */
  async getOverdueStats(): Promise<{
    totalActive: number;
    totalOverdue: number;
    totalMinutesOverdue: number;
    totalHoursOverdue: number;
    totalDaysOverdue: number;
    estimatedTotalDenda: number;
  }> {
    try {
      const activeSewas = await this.prisma.sewa.findMany({
        where: { status: 'aktif' },
        include: { motor: true },
      });

      let totalOverdue = 0;
      let totalMinutesOverdue = 0;
      let totalHoursOverdue = 0;
      let totalDaysOverdue = 0;
      let estimatedTotalDenda = 0;

      for (const sewa of activeSewas) {
        const overdueResult = this.calculateOverdueForSewa(sewa);

        if (overdueResult.isOverdue) {
          totalOverdue++;
          totalMinutesOverdue += overdueResult.overdueMinutes;
          totalHoursOverdue += overdueResult.overdueHours;
          totalDaysOverdue += overdueResult.overdueDays;
          estimatedTotalDenda += overdueResult.denda;
        }
      }

      return {
        totalActive: activeSewas.length,
        totalOverdue,
        totalMinutesOverdue,
        totalHoursOverdue,
        totalDaysOverdue,
        estimatedTotalDenda,
      };
    } catch (error) {
      console.error('❌ Error in getOverdueStats:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil statistik overdue',
      );
    }
  }

  /**
   * ✅ Cari semua sewa yang overdue
   */
  async findOverdueSewas() {
    try {
      const sekarang = new Date();
      const overdueSewas = await this.prisma.sewa.findMany({
        where: {
          status: 'aktif',
          tgl_kembali: { lt: sekarang }, // Tanggal kembali sudah lewat
        },
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
          penyewa: { select: { id: true, nama: true, no_whatsapp: true } },
          admin: { select: { id: true, nama_lengkap: true } },
        },
        orderBy: { tgl_kembali: 'asc' },
      });

      // ✅ Update overdue hours untuk semua sewa overdue dan hitung denda
      const overdueSewasWithCalculation = await Promise.all(
        overdueSewas.map(async (sewa) => {
          const overdueResult = await this.updateOverdueStatus(sewa.id);
          return {
            ...sewa,
            overdueCalculation: overdueResult,
          };
        }),
      );

      return overdueSewasWithCalculation;
    } catch (error) {
      console.error('Error in findOverdueSewas:', error);
      throw new InternalServerErrorException(
        'Gagal mengambil data sewa overdue',
      );
    }
  }

  /**
   * ✅ Helper: Simulasi perhitungan denda untuk testing
   */
  simulateDendaCalculation(
    totalHargaSewa: number,
    durasiSewaJam: number,
    keterlambatanMenit: number,
  ): DendaBreakdown {
    return this.calculateDendaBreakdown({
      totalHargaSewa,
      durasiSewaJam,
      keterlambatanMenit,
      dendaRate: 0.5,
      penaltyMultiplier: 1.5,
    });
  }
}
