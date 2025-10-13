import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Get,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginAdminDto } from './dto/login-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

// Interface untuk request dengan user dari JWT
interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    username: string;
    email: string;
    nama_lengkap: string;
    is_super_admin: boolean;
    isAdmin: boolean;
  };
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /** LOGIN ADMIN */
  @Post('admin/login')
  @ApiOperation({ summary: 'Login for administrators' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        success: true,
        access_token: 'jwt_token_here',
        admin: {
          id: 1,
          nama_lengkap: 'Admin Name',
          username: 'admin',
          email: 'admin@example.com',
          is_super_admin: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      example: {
        success: false,
        message: 'Username atau password salah.',
        statusCode: 401,
      },
    },
  })
  async adminLogin(@Body() loginAdminDto: LoginAdminDto) {
    // Debug payload
    this.logger.debug(`Login payload: ${JSON.stringify(loginAdminDto)}`);

    try {
      const result = await this.authService.adminLogin(loginAdminDto);
      return {
        success: true,
        access_token: result.access_token,
        admin: result.admin,
      };
    } catch (error: any) {
      this.logger.error(`Login error: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Login failed',
          statusCode: HttpStatus.UNAUTHORIZED,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /** LOGOUT ADMIN (JWT stateless) */
  @Post('admin/logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout administrator (client-side token removal)' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful (client should remove token)',
    schema: {
      example: {
        success: true,
        message:
          'Logout successful. Please remove the token from client storage.',
      },
    },
  })
  adminLogout(@Request() req: AuthenticatedRequest) {
    this.logger.log(`Admin ${req.user.id} logged out`);
    return {
      success: true,
      message:
        'Logout successful. Please remove the token from client storage.',
    };
  }

  /** CHANGE PASSWORD ADMIN */
  @Post('admin/change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change administrator password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      example: {
        success: true,
        message: 'Password updated successfully!',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid current password or validation error',
    schema: {
      example: {
        success: false,
        message: 'Current password is incorrect',
        statusCode: 400,
      },
    },
  })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    this.logger.debug(`Change password request by adminId=${req.user.id}`);

    // Validasi manual: pastikan password dan konfirmasi password sama
    if (
      changePasswordDto.password !== changePasswordDto.password_confirmation
    ) {
      throw new HttpException(
        {
          success: false,
          message: 'Password confirmation does not match',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.authService.changePassword(req.user.id, changePasswordDto);
      return {
        success: true,
        message: 'Password updated successfully!',
      };
    } catch (error: any) {
      this.logger.error(`Change password error: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to change password',
          statusCode: HttpStatus.BAD_REQUEST,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** GET CURRENT ADMIN PROFILE */
  @Get('admin/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current administrator profile' })
  @ApiResponse({
    status: 200,
    description: 'Admin profile retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 1,
          nama_lengkap: 'Admin Name',
          username: 'admin',
          email: 'admin@example.com',
          is_super_admin: true,
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        success: false,
        message: 'Unauthorized',
        statusCode: 401,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
    schema: {
      example: {
        success: false,
        message: 'Admin not found',
        statusCode: 404,
      },
    },
  })
  async getCurrentAdmin(@Request() req: AuthenticatedRequest): Promise<any> {
    this.logger.debug(`Get profile request for adminId=${req.user.id}`);

    try {
      const admin = await this.authService.getAdminProfile(req.user.id);

      if (!admin) {
        throw new HttpException(
          {
            success: false,
            message: 'Admin not found',
            statusCode: HttpStatus.NOT_FOUND,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: admin,
      };
    } catch (error: any) {
      this.logger.error(`Get profile error: ${error.message}`);

      // Jika error sudah berupa HttpException, lempar kembali
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message: 'Failed to get admin profile',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
