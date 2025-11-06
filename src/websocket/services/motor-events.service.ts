import { Injectable, Logger } from '@nestjs/common';
import { WebsocketGateway } from '../websocket.gateway';

export interface MotorLocationUpdate {
  motorId: number;
  plat_nomor: string;
  lat: number;
  lng: number;
  speed?: number;
  direction?: number;
  address?: string;
  last_update: string;
  gps_status: string;
}

export interface MotorStatusUpdate {
  motorId: number;
  plat_nomor: string;
  oldStatus: string;
  newStatus: string;
  updated_by?: string;
  timestamp: string;
}

export interface MotorServiceUpdate {
  motorId: number;
  plat_nomor: string;
  serviceStatus: string;
  serviceType?: string;
  technician?: string;
  notes?: string;
  timestamp: string;
}

export interface MotorMileageUpdate {
  motorId: number;
  plat_nomor: string;
  total_mileage: number;
  distance_km: number;
  period_date: string;
  average_speed_kmh: number;
  timestamp: string;
}

@Injectable()
export class MotorEventsService {
  private readonly logger = new Logger(MotorEventsService.name);

  constructor(private websocketGateway: WebsocketGateway) {}

  // ========== LOCATION UPDATES ==========

  /**
   * Emit real-time location update for a motor
   */
  emitLocationUpdate(update: MotorLocationUpdate): void {
    try {
      // Broadcast to specific motor room
      this.websocketGateway.broadcastToRoom(
        `motor:${update.motorId}`,
        'motor:location:update',
        {
          ...update,
          event: 'location_update',
          timestamp: new Date().toISOString(),
        },
      );

      // Broadcast to tracking room (all motors)
      this.websocketGateway.broadcastToRoom(
        'motor:tracking',
        'motor:tracking:update',
        {
          ...update,
          event: 'tracking_update',
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.debug(`Location update emitted for motor ${update.motorId}`);
    } catch (error) {
      this.logger.error(`Failed to emit location update: ${error.message}`);
    }
  }

  /**
   * Emit bulk location updates for multiple motors
   */
  emitBulkLocationUpdates(updates: MotorLocationUpdate[]): void {
    try {
      updates.forEach((update) => {
        this.emitLocationUpdate(update);
      });

      this.logger.debug(
        `Bulk location updates emitted for ${updates.length} motors`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit bulk location updates: ${error.message}`,
      );
    }
  }

  // ========== STATUS UPDATES ==========

  /**
   * Emit motor status change
   */
  emitStatusUpdate(update: MotorStatusUpdate): void {
    try {
      // Broadcast to specific motor room
      this.websocketGateway.broadcastToRoom(
        `motor:${update.motorId}`,
        'motor:status:update',
        {
          ...update,
          event: 'status_update',
          timestamp: new Date().toISOString(),
        },
      );

      // Broadcast to all connected clients for dashboard updates
      this.websocketGateway.broadcastToAll('motor:status:changed', {
        ...update,
        event: 'status_changed',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Status update emitted for motor ${update.motorId}: ${update.oldStatus} -> ${update.newStatus}`,
      );
    } catch (error) {
      this.logger.error(`Failed to emit status update: ${error.message}`);
    }
  }

  // ========== SERVICE UPDATES ==========

  /**
   * Emit service status update
   */
  emitServiceUpdate(update: MotorServiceUpdate): void {
    try {
      // Broadcast to specific motor room
      this.websocketGateway.broadcastToRoom(
        `motor:${update.motorId}`,
        'motor:service:update',
        {
          ...update,
          event: 'service_update',
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.log(
        `Service update emitted for motor ${update.motorId}: ${update.serviceStatus}`,
      );
    } catch (error) {
      this.logger.error(`Failed to emit service update: ${error.message}`);
    }
  }

  // ========== MILEAGE UPDATES ==========

  /**
   * Emit mileage update
   */
  emitMileageUpdate(update: MotorMileageUpdate): void {
    try {
      // Broadcast to specific motor room
      this.websocketGateway.broadcastToRoom(
        `motor:${update.motorId}`,
        'motor:mileage:update',
        {
          ...update,
          event: 'mileage_update',
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.debug(`Mileage update emitted for motor ${update.motorId}`);
    } catch (error) {
      this.logger.error(`Failed to emit mileage update: ${error.message}`);
    }
  }

  // ========== REAL-TIME SYNC UPDATES ==========

  /**
   * Emit GPS sync completion
   */
  emitGpsSyncComplete(
    motorId: number,
    success: boolean,
    message?: string,
  ): void {
    try {
      this.websocketGateway.broadcastToRoom(
        `motor:${motorId}`,
        'motor:gps:sync:complete',
        {
          motorId,
          success,
          message,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error(`Failed to emit GPS sync complete: ${error.message}`);
    }
  }

  /**
   * Emit mileage sync completion
   */
  emitMileageSyncComplete(
    motorId: number,
    success: boolean,
    message?: string,
  ): void {
    try {
      this.websocketGateway.broadcastToRoom(
        `motor:${motorId}`,
        'motor:mileage:sync:complete',
        {
          motorId,
          success,
          message,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit mileage sync complete: ${error.message}`,
      );
    }
  }

  // ========== SYSTEM EVENTS ==========

  /**
   * Notify clients about motor creation
   */
  emitMotorCreated(motor: any): void {
    try {
      this.websocketGateway.broadcastToAll('motor:created', {
        motor,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to emit motor created: ${error.message}`);
    }
  }

  /**
   * Notify clients about motor deletion
   */
  emitMotorDeleted(motorId: number, plat_nomor: string): void {
    try {
      this.websocketGateway.broadcastToAll('motor:deleted', {
        motorId,
        plat_nomor,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to emit motor deleted: ${error.message}`);
    }
  }

  // ========== HEALTH AND STATISTICS ==========

  /**
   * Emit connected clients statistics
   */
  emitConnectionStats(): void {
    try {
      const clients = this.websocketGateway.getConnectedClients();
      const stats = {
        totalClients: clients.size,
        timestamp: new Date().toISOString(),
      };

      this.websocketGateway.broadcastToAll('websocket:stats', stats);
    } catch (error) {
      this.logger.error(`Failed to emit connection stats: ${error.message}`);
    }
  }
}
