import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebsocketExceptionsFilter } from './filters/websocket-exception.filter';

// Interfaces untuk type safety
interface AuthenticatedSocket extends Socket {
  userId?: number;
  adminId?: number;
}

interface WebSocketMessage {
  message: string;
  clientId: string;
  timestamp: string;
}

interface MotorSubscriptionPayload {
  motorId: number;
}

interface PongResponse {
  timestamp: string;
  serverTime: number;
}

interface HealthResponse {
  status: string;
  connectedClients: number;
  timestamp: string;
  uptime: number;
}

interface MotorSubscribedResponse {
  motorId: number;
  room: string;
  timestamp: string;
}

interface ConnectionStats {
  totalClients: number;
  connectedClients: number;
  rooms: string[];
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'api',
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new ValidationPipe())
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly connectedClients: Map<string, AuthenticatedSocket> =
    new Map();

  afterInit(server: Server): void {
    this.logger.log('WebSocket Gateway initialized');

    // Simpan server instance jika diperlukan untuk future use
    // this.server = server; // Tidak perlu karena sudah ada @WebSocketServer()

    // Setup interval untuk cleanup connections
    setInterval(() => {
      this.logger.debug(`Connected clients: ${this.connectedClients.size}`);
      this.cleanupDisconnectedClients();
    }, 30000); // Log setiap 30 detik
  }

  // Ubah menjadi synchronous atau tambahkan await expression
  handleConnection(client: AuthenticatedSocket): void {
    try {
      // Authenticate client - gunakan type assertion yang aman
      const auth = client.handshake.auth as { token?: string };
      const headers = client.handshake.headers as { token?: string };

      const token = auth.token || headers.token;

      if (token) {
        // Verifikasi token dan dapatkan user/admin info
        // Contoh implementasi authentication:
        // try {
        //   const decoded = await this.jwtService.verify(token);
        //   client.adminId = decoded.sub;
        //   client.userId = decoded.userId;
        // } catch (error) {
        //   this.logger.warn(`Invalid token from client ${client.id}`);
        //   client.disconnect();
        //   return;
        // }

        // Untuk sementara, kita log saja
        this.logger.debug(`Token received from client ${client.id}`);
      }

      this.connectedClients.set(client.id, client);
      this.logger.log(
        `Client connected: ${client.id}. Total: ${this.connectedClients.size}`,
      );

      // Send welcome message
      const welcomeMessage: WebSocketMessage = {
        message: 'Connected to Rental Motor WebSocket',
        clientId: client.id,
        timestamp: new Date().toISOString(),
      };

      client.emit('connected', welcomeMessage);

      // Notify all clients about new connection (optional)
      this.broadcastToAll('client:connected', {
        clientId: client.id,
        totalClients: this.connectedClients.size,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection error: ${errorMessage}`);
      client.disconnect();
    }
  }

  // Atau jika ingin tetap async, tambahkan await expression:
  // async handleConnection(client: AuthenticatedSocket): Promise<void> {
  //   try {
  //     // Contoh jika ada operasi async
  //     // await this.someAsyncOperation();

  //     const auth = client.handshake.auth as { token?: string };
  //     const headers = client.handshake.headers as { token?: string };

  //     const token = auth.token || headers.token;

  //     if (token) {
  //       // Simulate async operation
  //       await new Promise(resolve => setTimeout(resolve, 10));
  //       this.logger.debug(`Token received from client ${client.id}`);
  //     }

  //     this.connectedClients.set(client.id, client);
  //     this.logger.log(`Client connected: ${client.id}`);

  //     const welcomeMessage: WebSocketMessage = {
  //       message: 'Connected to Rental Motor WebSocket',
  //       clientId: client.id,
  //       timestamp: new Date().toISOString(),
  //     };

  //     client.emit('connected', welcomeMessage);
  //   } catch (error: unknown) {
  //     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //     this.logger.error(`Connection error: ${errorMessage}`);
  //     client.disconnect();
  //   }
  // }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(
      `Client disconnected: ${client.id}. Total: ${this.connectedClients.size}`,
    );

    // Notify all clients about disconnection (optional)
    this.broadcastToAll('client:disconnected', {
      clientId: client.id,
      totalClients: this.connectedClients.size,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get all connected clients
   */
  getConnectedClients(): Map<string, AuthenticatedSocket> {
    return new Map(this.connectedClients);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): AuthenticatedSocket | undefined {
    return this.connectedClients.get(clientId);
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastToAll(event: string, data: unknown): void {
    this.server.emit(event, data);
  }

  /**
   * Send to specific client
   */
  sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.connectedClients.get(clientId);
    if (client && client.connected) {
      client.emit(event, data);
      return true;
    }

    if (!client?.connected) {
      this.connectedClients.delete(clientId);
    }

    return false;
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(room: string, event: string, data: unknown): void {
    this.server.to(room).emit(event, data);
  }

  /**
   * Send to all clients in room except sender
   */
  broadcastToRoomExceptSender(
    room: string,
    event: string,
    data: unknown,
    senderId: string,
  ): void {
    this.server.to(room).except(senderId).emit(event, data);
  }

  // ========== MOTOR SPECIFIC EVENTS ==========

  @SubscribeMessage('motor:subscribe')
  async handleMotorSubscribe(
    client: AuthenticatedSocket,
    payload: MotorSubscriptionPayload,
  ): Promise<void> {
    const room = `motor:${payload.motorId}`;

    try {
      await client.join(room);

      this.logger.log(
        `Client ${client.id} subscribed to motor ${payload.motorId}`,
      );

      const response: MotorSubscribedResponse = {
        motorId: payload.motorId,
        room,
        timestamp: new Date().toISOString(),
      };

      client.emit('motor:subscribed', response);

      this.broadcastToRoomExceptSender(
        room,
        'motor:user:joined',
        {
          clientId: client.id,
          motorId: payload.motorId,
          timestamp: new Date().toISOString(),
        },
        client.id,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Motor subscribe error: ${errorMessage}`);
      client.emit('error', {
        message: 'Failed to subscribe to motor',
        code: 'SUBSCRIBE_ERROR',
      });
    }
  }

  @SubscribeMessage('motor:unsubscribe')
  async handleMotorUnsubscribe(
    client: AuthenticatedSocket,
    payload: MotorSubscriptionPayload,
  ): Promise<void> {
    const room = `motor:${payload.motorId}`;

    try {
      await client.leave(room);

      this.logger.log(
        `Client ${client.id} unsubscribed from motor ${payload.motorId}`,
      );

      this.broadcastToRoomExceptSender(
        room,
        'motor:user:left',
        {
          clientId: client.id,
          motorId: payload.motorId,
          timestamp: new Date().toISOString(),
        },
        client.id,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Motor unsubscribe error: ${errorMessage}`);
    }
  }

  @SubscribeMessage('motor:tracking:subscribe')
  async handleMotorTrackingSubscribe(
    client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      await client.join('motor:tracking');
      this.logger.log(`Client ${client.id} subscribed to motor tracking`);

      client.emit('motor:tracking:subscribed', {
        message: 'Subscribed to motor tracking',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Motor tracking subscribe error: ${errorMessage}`);
      client.emit('error', {
        message: 'Failed to subscribe to motor tracking',
        code: 'SUBSCRIBE_ERROR',
      });
    }
  }

  @SubscribeMessage('motor:tracking:unsubscribe')
  async handleMotorTrackingUnsubscribe(
    client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      await client.leave('motor:tracking');
      this.logger.log(`Client ${client.id} unsubscribed from motor tracking`);

      client.emit('motor:tracking:unsubscribed', {
        message: 'Unsubscribed from motor tracking',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Motor tracking unsubscribe error: ${errorMessage}`);
    }
  }

  @SubscribeMessage('motor:location:update')
  handleMotorLocationUpdate(
    client: AuthenticatedSocket,
    payload: { motorId: number; lat: number; lng: number; speed?: number },
  ): void {
    if (!payload.motorId || !payload.lat || !payload.lng) {
      client.emit('error', {
        message: 'Invalid location data',
        code: 'INVALID_LOCATION_DATA',
      });
      return;
    }

    const room = `motor:${payload.motorId}`;

    this.broadcastToRoom(room, 'motor:location:updated', {
      motorId: payload.motorId,
      location: {
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed || 0,
      },
      updatedBy: client.id,
      timestamp: new Date().toISOString(),
    });

    this.broadcastToRoom('motor:tracking', 'motor:tracking:update', {
      motorId: payload.motorId,
      location: {
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed || 0,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ========== HEALTH CHECK ==========

  @SubscribeMessage('ping')
  handlePing(client: AuthenticatedSocket): void {
    const response: PongResponse = {
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    };

    client.emit('pong', response);
  }

  @SubscribeMessage('health')
  handleHealthCheck(client: AuthenticatedSocket): void {
    const response: HealthResponse = {
      status: 'healthy',
      connectedClients: this.connectedClients.size,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    client.emit('health:response', response);
  }

  // ========== ADMIN SPECIFIC EVENTS ==========

  @SubscribeMessage('admin:subscribe')
  async handleAdminSubscribe(client: AuthenticatedSocket): Promise<void> {
    if (!client.adminId) {
      client.emit('error', {
        message: 'Unauthorized - Admin access required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    try {
      const room = `admin:${client.adminId}`;
      await client.join(room);
      await client.join('admin:all');

      this.logger.log(`Admin ${client.adminId} subscribed to admin events`);

      client.emit('admin:subscribed', {
        adminId: client.adminId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Admin subscribe error: ${errorMessage}`);
      client.emit('error', {
        message: 'Failed to subscribe to admin events',
        code: 'SUBSCRIBE_ERROR',
      });
    }
  }

  @SubscribeMessage('admin:notification')
  handleAdminNotification(
    client: AuthenticatedSocket,
    payload: { message: string; type: string; data?: unknown },
  ): void {
    if (!client.adminId) {
      client.emit('error', {
        message: 'Unauthorized - Admin access required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    this.broadcastToRoom('admin:all', 'admin:notification', {
      ...payload,
      fromAdminId: client.adminId,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== CLEANUP METHODS ==========

  /**
   * Cleanup disconnected clients
   */
  cleanupDisconnectedClients(): void {
    let cleanedCount = 0;

    for (const [clientId, client] of this.connectedClients.entries()) {
      if (!client.connected) {
        this.connectedClients.delete(clientId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} disconnected clients`);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): ConnectionStats {
    const rooms = Array.from(this.server.sockets.adapter.rooms.keys());

    const filteredRooms = rooms.filter(
      (room) => !this.connectedClients.has(room),
    );

    return {
      totalClients: this.connectedClients.size,
      connectedClients: Array.from(this.connectedClients.values()).filter(
        (client) => client.connected,
      ).length,
      rooms: filteredRooms,
    };
  }

  /**
   * Get server instance (untuk penggunaan external jika diperlukan)
   */
  getServer(): Server {
    return this.server;
  }
}
