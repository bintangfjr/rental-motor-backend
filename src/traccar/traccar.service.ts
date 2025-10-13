import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as moment from 'moment';

@Injectable()
export class TraccarService {
  private readonly logger = new Logger(TraccarService.name);
  private readonly traccarUrl: string;
  private readonly traccarEmail: string;
  private readonly traccarPassword: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {
    this.traccarUrl = process.env.TRACCAR_URL || '';
    this.traccarEmail = process.env.TRACCAR_EMAIL || '';
    this.traccarPassword = process.env.TRACCAR_PASSWORD || '';

    if (!this.traccarUrl || !this.traccarEmail || !this.traccarPassword) {
      this.logger.warn('Traccar credentials not configured');
    }
  }

  private getAuthHeader() {
    const base64Auth = Buffer.from(
      `${this.traccarEmail}:${this.traccarPassword}`,
    ).toString('base64');
    return {
      Authorization: `Basic ${base64Auth}`,
      'Content-Type': 'application/json',
    };
  }

  async getDashboardData() {
    try {
      const [motorsWithGps, devices, positions] = await Promise.all([
        this.getMotorsWithGps(),
        this.getDevices(),
        this.getAllPositions(),
      ]);

      // Sync devices with local database
      await this.syncDevicesWithLocal(devices);

      return {
        devices,
        positions,
        motors: motorsWithGps,
      };
    } catch (error) {
      this.logger.error('Failed to get dashboard data:', error);

      // Return fallback data if Traccar is unavailable
      const motorsWithGps = await this.getMotorsWithGps();
      return {
        devices: [],
        positions: [],
        motors: motorsWithGps,
        error: `Gagal mengambil data dari server GPS: ${error.message}`,
      };
    }
  }

  async getDeviceData(deviceId: string) {
    try {
      const [deviceData, positionData, motor] = await Promise.all([
        this.getDevice(deviceId),
        this.getDevicePosition(deviceId),
        this.prisma.motor.findFirst({
          where: { device_id: deviceId },
        }),
      ]);

      return {
        motor,
        deviceData,
        positionData,
        deviceId,
      };
    } catch (error) {
      this.logger.error(`Failed to get device data for ${deviceId}:`, error);

      const motor = await this.prisma.motor.findFirst({
        where: { device_id: deviceId },
      });

      return {
        motor,
        deviceData: null,
        positionData: null,
        error: `Gagal mengambil data device: ${error.message}`,
      };
    }
  }

  private async getMotorsWithGps() {
    return this.prisma.motor.findMany({
      where: {
        OR: [
          { device_id: { not: null } },
          { imei: { not: null } },
          { no_gsm: { not: null } },
        ],
      },
      select: {
        id: true,
        plat_nomor: true,
        merk: true,
        model: true,
        device_id: true,
        imei: true,
        no_gsm: true,
        lat: true,
        lng: true,
        last_update: true,
        status: true,
      },
    });
  }

  private async getDevices(): Promise<any[]> {
    if (!this.traccarUrl) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.traccarUrl}/api/devices`, {
          headers: this.getAuthHeader(),
          timeout: 10000,
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to get devices from Traccar:', error);
      throw new Error('Failed to connect to Traccar server');
    }
  }

  private async getDevice(deviceId: string): Promise<any> {
    if (!this.traccarUrl) return null;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.traccarUrl}/api/devices/${deviceId}`, {
          headers: this.getAuthHeader(),
          timeout: 10000,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get device ${deviceId}:`, error);
      throw new Error('Failed to fetch device data');
    }
  }

  private async getDevicePosition(deviceId: string): Promise<any> {
    if (!this.traccarUrl) return null;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.traccarUrl}/api/positions`, {
          headers: this.getAuthHeader(),
          params: {
            deviceId,
            maxResults: 1,
          },
          timeout: 10000,
        }),
      );

      const positions = response.data || [];
      return positions.length > 0 ? positions[0] : null;
    } catch (error) {
      this.logger.error(
        `Failed to get position for device ${deviceId}:`,
        error,
      );
      throw new Error('Failed to fetch device position');
    }
  }

  async getAllPositions(): Promise<any[]> {
    if (!this.traccarUrl) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.traccarUrl}/api/positions`, {
          headers: this.getAuthHeader(),
          timeout: 10000,
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to get all positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }

  async getDevicePositions(deviceId: string): Promise<any[]> {
    if (!this.traccarUrl) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.traccarUrl}/api/positions`, {
          headers: this.getAuthHeader(),
          params: { deviceId },
          timeout: 10000,
        }),
      );

      return response.data || [];
    } catch (error) {
      this.logger.error(
        `Failed to get positions for device ${deviceId}:`,
        error,
      );
      throw new Error('Failed to fetch device positions');
    }
  }

  async syncDevicesWithLocal(devices?: any[]): Promise<any> {
    try {
      const devicesToSync = devices || (await this.getDevices());
      const results = [];

      for (const device of devicesToSync) {
        const motor = await this.prisma.motor.findFirst({
          where: {
            OR: [
              { imei: device.uniqueId },
              { no_gsm: device.phone },
              { device_id: device.id.toString() },
            ],
          },
        });

        if (motor) {
          const updatedMotor = await this.prisma.motor.update({
            where: { id: motor.id },
            data: {
              device_id: device.id.toString(),
              status: device.status || 'offline',
              // Update position if available
              ...(device.position && {
                lat: device.position.lat,
                lng: device.position.lng,
                last_update: new Date(),
              }),
            },
          });
          results.push(updatedMotor);
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to sync devices:', error);
      throw new Error('Failed to sync devices with local database');
    }
  }
}
