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

interface AuthenticatedSocket extends Socket {
  userId?: number;
  adminId?: number;
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
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly connectedClients: Map<string, AuthenticatedSocket> =
    new Map();

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate client (sesuaikan dengan auth system Anda)
      const token =
        client.handshake.auth.token || client.handshake.headers.token;

      if (token) {
        // Verifikasi token dan dapatkan user/admin info
        // const payload = await this.authService.verifyToken(token);
        // client.userId = payload.userId;
        // client.adminId = payload.adminId;
      }

      this.connectedClients.set(client.id, client);
      this.logger.log(`Client connected: ${client.id}`);

      // Send welcome message
      client.emit('connected', {
        message: 'Connected to Rental Motor WebSocket',
        clientId: client.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ========== UTILITY METHODS ==========

  /**
   * Get all connected clients
   */
  getConnectedClients(): Map<string, AuthenticatedSocket> {
    return this.connectedClients;
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): AuthenticatedSocket | undefined {
    return this.connectedClients.get(clientId);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastToAll(event: string, data: any): void {
    this.server.emit(event, data);
  }

  /**
   * Send to specific client
   */
  sendToClient(clientId: string, event: string, data: any): boolean {
    const client = this.connectedClients.get(clientId);
    if (client) {
      client.emit(event, data);
      return true;
    }
    return false;
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(room: string, event: string, data: any): void {
    this.server.to(room).emit(event, data);
  }

  // ========== MOTOR SPECIFIC EVENTS ==========

  @SubscribeMessage('motor:subscribe')
  handleMotorSubscribe(
    client: AuthenticatedSocket,
    payload: { motorId: number },
  ) {
    const room = `motor:${payload.motorId}`;
    client.join(room);
    this.logger.log(
      `Client ${client.id} subscribed to motor ${payload.motorId}`,
    );

    client.emit('motor:subscribed', {
      motorId: payload.motorId,
      room,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('motor:unsubscribe')
  handleMotorUnsubscribe(
    client: AuthenticatedSocket,
    payload: { motorId: number },
  ) {
    const room = `motor:${payload.motorId}`;
    client.leave(room);
    this.logger.log(
      `Client ${client.id} unsubscribed from motor ${payload.motorId}`,
    );
  }

  @SubscribeMessage('motor:tracking:subscribe')
  handleMotorTrackingSubscribe(client: AuthenticatedSocket) {
    client.join('motor:tracking');
    this.logger.log(`Client ${client.id} subscribed to motor tracking`);
  }

  @SubscribeMessage('motor:tracking:unsubscribe')
  handleMotorTrackingUnsubscribe(client: AuthenticatedSocket) {
    client.leave('motor:tracking');
    this.logger.log(`Client ${client.id} unsubscribed from motor tracking`);
  }

  // ========== HEALTH CHECK ==========

  @SubscribeMessage('ping')
  handlePing(client: AuthenticatedSocket): void {
    client.emit('pong', {
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    });
  }

  @SubscribeMessage('health')
  handleHealthCheck(client: AuthenticatedSocket): void {
    client.emit('health:response', {
      status: 'healthy',
      connectedClients: this.connectedClients.size,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }
}
