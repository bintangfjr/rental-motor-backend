import {
  Controller,
  Get,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interface tipe data dashboard
export interface DashboardData {
  totalAdmins: number;
  totalUsers: number;
  totalSewa: number;
  totalMotor: number;
  // Tambahkan properti lain sesuai kebutuhan
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Endpoint untuk mengambil data dashboard
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
}
