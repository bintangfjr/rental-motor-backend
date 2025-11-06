import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { MotorEventsService } from './services/motor-events.service';

@Module({
  providers: [WebsocketGateway, MotorEventsService],
  exports: [WebsocketGateway, MotorEventsService],
})
export class WebsocketModule {}
