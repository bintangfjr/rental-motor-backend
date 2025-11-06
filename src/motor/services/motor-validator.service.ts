// src/motor/services/motor-validator.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { MotorGpsService } from '../motor-gps.service';
import { Motor } from '@prisma/client';

// Interface untuk create/update data
interface CreateMotorData {
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status?: string;
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;
}

interface UpdateMotorData {
  plat_nomor?: string;
  merk?: string;
  model?: string;
  tahun?: number;
  harga?: number;
  no_gsm?: string;
  imei?: string;
  status?: string;
  service_technician?: string;
  last_service_date?: string;
  service_notes?: string;
}

type GpsStatus = 'Online' | 'Offline' | 'NoImei' | 'Error';

// Type untuk Prisma create/update data
type MotorCreateInput = Parameters<
  MotorGpsService['prisma']['motor']['create']
>[0]['data'];
type MotorUpdateInput = Parameters<
  MotorGpsService['prisma']['motor']['update']
>[0]['data'];

@Injectable()
export class MotorValidatorService {
  constructor(private motorGpsService: MotorGpsService) {}

  /**
   * Validate IMEI with IOPGPS system
   */
  async validateImei(imei: string): Promise<boolean> {
    if (!imei) {
      return false;
    }

    try {
      return await this.motorGpsService.validateImeiWithIopgps(imei);
    } catch {
      throw new BadRequestException(
        'Gagal memvalidasi IMEI dengan sistem IOPGPS',
      );
    }
  }

  /**
   * Validate motor data for creation
   */
  async validateCreateData(createMotorDto: CreateMotorData): Promise<void> {
    // Validasi IMEI jika diisi
    if (createMotorDto.imei) {
      const isValidImei = await this.validateImei(createMotorDto.imei);
      if (!isValidImei) {
        throw new BadRequestException(
          'IMEI tidak valid atau tidak terdaftar di sistem IOPGPS',
        );
      }
    }
  }

  /**
   * Validate motor data for update
   */
  async validateUpdateData(
    existingMotor: Motor,
    updateMotorDto: UpdateMotorData,
  ): Promise<void> {
    // Validasi IMEI jika diubah
    if (updateMotorDto.imei && updateMotorDto.imei !== existingMotor.imei) {
      const isValidImei = await this.validateImei(updateMotorDto.imei);
      if (!isValidImei) {
        throw new BadRequestException(
          'IMEI tidak valid atau tidak terdaftar di sistem IOPGPS',
        );
      }
    }
  }

  /**
   * Determine GPS status based on IMEI
   */
  determineGpsStatus(imei?: string, existingGpsStatus?: string): GpsStatus {
    if (!imei) {
      return 'NoImei';
    }
    return (
      existingGpsStatus === 'NoImei'
        ? 'Offline'
        : existingGpsStatus || 'Offline'
    ) as GpsStatus;
  }

  /**
   * Build create data for motor
   */
  buildCreateData(createMotorDto: CreateMotorData): MotorCreateInput {
    const gpsStatus = this.determineGpsStatus(createMotorDto.imei);

    const createData: MotorCreateInput = {
      plat_nomor: createMotorDto.plat_nomor,
      merk: createMotorDto.merk,
      model: createMotorDto.model,
      tahun: createMotorDto.tahun,
      harga: createMotorDto.harga,
      no_gsm: createMotorDto.no_gsm,
      imei: createMotorDto.imei,
      status: createMotorDto.status ?? 'tersedia',
      gps_status: gpsStatus,
    };

    // Tambahkan service fields hanya jika ada
    if (createMotorDto.service_technician !== undefined) {
      createData.service_technician = createMotorDto.service_technician;
    }
    if (createMotorDto.last_service_date !== undefined) {
      createData.last_service_date = createMotorDto.last_service_date
        ? new Date(createMotorDto.last_service_date)
        : null;
    }
    if (createMotorDto.service_notes !== undefined) {
      createData.service_notes = createMotorDto.service_notes;
    }

    return createData;
  }

  /**
   * Build update data for motor
   */
  buildUpdateData(
    existingMotor: Motor,
    updateMotorDto: UpdateMotorData,
  ): MotorUpdateInput {
    const updateData: MotorUpdateInput = {};

    // Basic fields
    if (updateMotorDto.plat_nomor !== undefined) {
      updateData.plat_nomor = updateMotorDto.plat_nomor;
    }
    if (updateMotorDto.merk !== undefined) {
      updateData.merk = updateMotorDto.merk;
    }
    if (updateMotorDto.model !== undefined) {
      updateData.model = updateMotorDto.model;
    }
    if (updateMotorDto.tahun !== undefined) {
      updateData.tahun = updateMotorDto.tahun;
    }
    if (updateMotorDto.harga !== undefined) {
      updateData.harga = updateMotorDto.harga;
    }
    if (updateMotorDto.no_gsm !== undefined) {
      updateData.no_gsm = updateMotorDto.no_gsm;
    }
    if (updateMotorDto.imei !== undefined) {
      updateData.imei = updateMotorDto.imei;
      updateData.gps_status = this.determineGpsStatus(
        updateMotorDto.imei,
        existingMotor.gps_status,
      );
    }
    if (updateMotorDto.status !== undefined) {
      updateData.status = updateMotorDto.status;
    }

    // Service fields
    if (updateMotorDto.service_technician !== undefined) {
      updateData.service_technician = updateMotorDto.service_technician;
    }
    if (updateMotorDto.last_service_date !== undefined) {
      updateData.last_service_date = updateMotorDto.last_service_date
        ? new Date(updateMotorDto.last_service_date)
        : null;
    }
    if (updateMotorDto.service_notes !== undefined) {
      updateData.service_notes = updateMotorDto.service_notes;
    }

    return updateData;
  }
}
