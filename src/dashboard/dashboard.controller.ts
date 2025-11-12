import {
  Controller,
  Get,
  UseGuards,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  DashboardService,
  DashboardData,
  SewaHarianResponse,
  PendapatanHarianResponse,
  StatistikRingkasResponse,
} from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Endpoint untuk mengambil data dashboard utama
   * @returns { success: boolean, data: DashboardData }
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getDashboardData(): Promise<{ success: boolean; data: DashboardData }> {
    try {
      // Memanggil service untuk mengambil data
      const dashboardData: DashboardData =
        await this.dashboardService.getDashboardData();

      return { success: true, data: dashboardData };
    } catch (error: unknown) {
      // Jika error berasal dari HttpException, lempar ulang
      if (error instanceof HttpException) {
        throw error;
      }

      // Log error ke console untuk debugging
      console.error('Dashboard fetch error:', error);

      throw new HttpException(
        'Failed to fetch dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ ENDPOINT BARU: Statistik Sewa Harian
   * @param period Periode data (7days atau 30days)
   * @returns { success: boolean, data: SewaHarianResponse }
   */
  @Get('sewa-harian')
  @UseGuards(JwtAuthGuard)
  async getSewaHarianStats(
    @Query('period') period: '7days' | '30days' = '7days',
  ): Promise<{ success: boolean; data: SewaHarianResponse }> {
    try {
      console.log(`📊 Request sewa harian stats dengan period: ${period}`);

      const data = await this.dashboardService.getSewaHarianStats(period);

      return { success: true, data };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Sewa harian stats error:', error);
      throw new HttpException(
        'Failed to fetch daily rental stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ ENDPOINT BARU: Statistik Pendapatan Harian
   * @param period Periode data (7days atau 30days)
   * @returns { success: boolean, data: PendapatanHarianResponse }
   */
  @Get('pendapatan-harian')
  @UseGuards(JwtAuthGuard)
  async getPendapatanHarianStats(
    @Query('period') period: '7days' | '30days' = '7days',
  ): Promise<{ success: boolean; data: PendapatanHarianResponse }> {
    try {
      const data = await this.dashboardService.getPendapatanHarianStats(period);
      return { success: true, data };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Pendapatan harian stats error:', error);
      throw new HttpException(
        'Failed to fetch daily income stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ✅ ENDPOINT BARU: Statistik Ringkas untuk Cards
   * @returns { success: boolean, data: StatistikRingkasResponse }
   */
  @Get('statistik-ringkas')
  @UseGuards(JwtAuthGuard)
  async getStatistikRingkas(): Promise<{
    success: boolean;
    data: StatistikRingkasResponse;
  }> {
    try {
      const [sewaHarian, pendapatanHarian, sewaAktif, motorTersedia] =
        await Promise.all([
          // Sewa hari ini
          this.dashboardService.getSewaHarianStats('7days'),
          // Pendapatan hari ini
          this.dashboardService.getPendapatanHarianStats('7days'),
          // Count sewa aktif
          this.prisma.sewa.count({
            where: { status: 'Aktif' },
          }),
          // Count motor tersedia
          this.prisma.motor.count({
            where: { status: 'tersedia' },
          }),
        ]);

      const data: StatistikRingkasResponse = {
        sewa: {
          hari_ini: sewaHarian.hari_ini,
          kemarin: sewaHarian.kemarin,
          persentase: sewaHarian.persentase_perubahan,
        },
        pendapatan: {
          hari_ini: pendapatanHarian.hari_ini,
          kemarin: pendapatanHarian.kemarin,
          persentase: pendapatanHarian.persentase_perubahan,
        },
        aktif: sewaAktif,
        tersedia: motorTersedia,
      };

      return { success: true, data };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Statistik ringkas error:', error);
      throw new HttpException(
        'Failed to fetch quick stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // FIX: Tambahkan properti prisma ke controller
  private get prisma() {
    return this.dashboardService['prisma'];
  }
}
