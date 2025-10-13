import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('histories')
@ApiBearerAuth()
@Controller('histories')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all rental histories' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
  ) {
    try {
      const histories = await this.historyService.findAll(page, limit, search);
      return { success: true, data: histories };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch histories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get history by ID' })
  async findOne(@Param('id') id: string) {
    try {
      const history = await this.historyService.findOne(+id);
      if (!history) {
        throw new HttpException('History not found', HttpStatus.NOT_FOUND);
      }
      return { success: true, data: history };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete history' })
  async remove(@Param('id') id: string) {
    try {
      const result = await this.historyService.remove(+id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to delete history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get history statistics summary' })
  async getStatsSummary() {
    try {
      const stats = await this.historyService.getStatsSummary();
      return { success: true, data: stats };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch history statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
