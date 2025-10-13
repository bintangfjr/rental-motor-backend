import {
  Controller,
  Get,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats() {
    try {
      const stats = await this.reportService.getDashboardStats();
      return { success: true, data: stats };
    } catch {
      throw new HttpException(
        'Failed to fetch dashboard statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('monthly')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get monthly reports' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  async getMonthlyReports(
    @Query('year') year?: number,
    @Query('month') month?: number,
  ) {
    try {
      const reports = await this.reportService.getMonthlyReports(year, month);
      return { success: true, data: reports };
    } catch {
      throw new HttpException(
        'Failed to fetch monthly reports',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('motor-usage')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get motor usage statistics' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getMotorUsage(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const usage = await this.reportService.getMotorUsage(startDate, endDate);
      return { success: true, data: usage };
    } catch {
      throw new HttpException(
        'Failed to fetch motor usage statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('financial')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get financial reports' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getFinancialReports(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const financial = await this.reportService.getFinancialReports(
        startDate,
        endDate,
      );
      return { success: true, data: financial };
    } catch {
      throw new HttpException(
        'Failed to fetch financial reports',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
