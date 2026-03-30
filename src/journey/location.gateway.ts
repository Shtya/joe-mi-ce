// src/journey/location.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import { JourneyService } from "./journey.service";

interface LocationPayload {
  lat: number;
  lng: number;
  journeyId?: string;
  recordedAt?: string; // ISO string — provided by app when syncing offline pings
  isOffline?: boolean;
}

@WebSocketGateway({
  namespace: "/location",
  cors: { origin: "*", credentials: true },
})
export class LocationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(LocationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly journeyService: JourneyService,
  ) {}

  // ─── Connection lifecycle ────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string) ||
        "";
      const token = raw.replace(/^Bearer\s+/i, "");

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      // Attach user info to the socket for later use
      (client as any).userId = payload.sub;
      (client as any).projectId = payload.projectId ?? null;

      this.logger.log(`WS connected: userId=${payload.sub}`);
    } catch {
      this.logger.warn("WS auth failed — disconnecting client");
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS disconnected: socketId=${client.id}`);
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  /**
   * Promoter (mobile app) emits this event with their current GPS coordinates.
   * Supports offline pings: set isOffline=true and recordedAt=<original timestamp>.
   *
   * Emits back: { isOutside: boolean }
   */
  @SubscribeMessage("location.update")
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationPayload,
  ) {
    const userId: string = (client as any).userId;
    if (!userId) return;

    const { lat, lng, journeyId, recordedAt, isOffline } = payload;

    try {
      const result = await this.journeyService.upsertPromoterLocation({
        userId,
        lat,
        lng,
        journeyId,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        isOffline: !!isOffline,
      });

      // Broadcast to any admin watching this project room
      if (result.projectId) {
        this.server
          .to(`project:${result.projectId}`)
          .emit("location.broadcast", {
            userId,
            name: result.name,
            avatar_url: result.avatar_url,
            lat: result.lat,
            lng: result.lng,
            isOutside: result.isOutside,
            updatedAt: result.updatedAt,
          });
      }

      return { isOutside: result.isOutside };
    } catch (err) {
      this.logger.error(
        `location.update error for userId=${userId}: ${err.message}`,
      );
    }
  }
}
