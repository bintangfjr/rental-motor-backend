// src/websocket/services/iopgps-events.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export interface IopgpsSyncUpdate {
  type: 'sync_started' | 'sync_completed' | 'sync_failed';
  success?: number;
  failed?: number;
  total?: number;
  duration?: number;
  timestamp: string;
  errors?: string[];
}

export interface IopgpsLocationUpdate {
  motorId: number;
  plat_nomor: string;
  imei: string;
  lat: number;
  lng: number;
  address?: string;
  last_update: string;
  location_status: 'realtime' | 'stale' | 'none';
  gps_status?: string;
  timestamp: string;
}

export interface IopgpsHealthUpdate {
  status: 'healthy' | 'degraded' | 'unhealthy';
  tokenStatus: boolean;
  lastSync?: string;
  message: string;
  timestamp: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/iopgps',
})
export class IopgpsEventsService {
  private readonly logger = new Logger(IopgpsEventsService.name);

  @WebSocketServer()
  server: Server;

  /**
   * Emit sync status update
   */
  emitSyncUpdate(update: IopgpsSyncUpdate): void {
    try {
      this.server.emit('sync_update', update);
      this.logger.debug(`Sync update emitted: ${update.type}`);
    } catch (error) {
      this.logger.error('Failed to emit sync update', error);
    }
  }

  /**
   * Emit location update for specific motor
   */
  emitLocationUpdate(update: IopgpsLocationUpdate): void {
    try {
      // Broadcast to all clients
      this.server.emit('location_update', update);

      // Also emit to room for specific motor
      this.server.to(`motor_${update.motorId}`).emit('location_update', update);

      this.logger.debug(`Location update emitted for motor ${update.motorId}`);
    } catch (error) {
      this.logger.error('Failed to emit location update', error);
    }
  }

  /**
   * Emit health status update
   */
  emitHealthUpdate(update: IopgpsHealthUpdate): void {
    try {
      this.server.emit('health_update', update);
      this.logger.debug(`Health update emitted: ${update.status}`);
    } catch (error) {
      this.logger.error('Failed to emit health update', error);
    }
  }

  /**
   * Emit token status update
   */
  emitTokenUpdate(hasToken: boolean, message: string): void {
    try {
      this.server.emit('token_update', {
        hasToken,
        message,
        timestamp: new Date().toISOString(),
      });
      this.logger.debug(
        `Token update emitted: ${hasToken ? 'Valid' : 'Invalid'}`,
      );
    } catch (error) {
      this.logger.error('Failed to emit token update', error);
    }
  }

  /**
   * Join room for specific motor updates
   */
  async joinMotorRoom(client: any, motorId: number): Promise<void> {
    try {
      await client.join(`motor_${motorId}`);
      this.logger.debug(`Client joined motor room: motor_${motorId}`);
    } catch (error) {
      this.logger.error('Failed to join motor room', error);
    }
  }

  /**
   * Leave motor room
   */
  async leaveMotorRoom(client: any, motorId: number): Promise<void> {
    try {
      await client.leave(`motor_${motorId}`);
      this.logger.debug(`Client left motor room: motor_${motorId}`);
    } catch (error) {
      this.logger.error('Failed to leave motor room', error);
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.server.engine.clientsCount;
  }
}
