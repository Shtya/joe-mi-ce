import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Req,
  Param,
  UseGuards,
  Query,
  Logger,
  Headers,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { JourneyService } from "./journey.service";
import { UsersService } from "src/users/users.service";
import { AuthGuard } from "src/auth/auth.guard";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "entities/user.entity";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Namespace, Server, Socket } from "socket.io";
import { UpdatePromoterLocationDto } from "dto/journey.dto";
import { LocationCacheService } from "./location-cache.service";

@WebSocketGateway({
  namespace: "/location",
  cors: { origin: "*" },
})
@Controller("location")
export class LocationGateway implements OnGatewayConnection, OnGatewayInit {
  private readonly logger = new Logger(LocationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly journeyService: JourneyService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly locationCacheService: LocationCacheService,
  ) {}

  afterInit(server: Namespace) {
    server.use(async (client, next) => {
      this.logger.log(`Tracking socket connection attempt socket=${client.id}`);
      try {
        client.data.user = await this.authenticateSocketClient(client);
        this.logger.log(
          `Tracking socket authenticated user=${client.data.user.id} socket=${client.id}`,
        );
        next();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.logger.warn(`Socket location auth failed: ${message}`);
        next(new Error("Unauthorized"));
      }
    });
  }

  handleConnection(client: Socket) {
    const userId = client.data.user?.id ?? "unknown";
    this.logger.log(`Tracking socket connected user=${userId}`);
    client.on("location:update", async (payload, ack) => {
      try {
        await this.handleLocationUpdate(client, payload, ack);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.logger.error(
          `Tracking ping failed user=${userId} source=socket reason=${message}`,
        );
        if (typeof ack === "function") {
          ack({
            event: "location:updated",
            data: { success: false, message },
          });
        }
      }
    });
    client.on("disconnect", (reason) => {
      this.logger.log(
        `Tracking socket disconnected user=${userId} socket=${client.id} reason=${reason}`,
      );
    });
  }

  // POST endpoint for creating a new location ping
  @Post()
  @UseGuards(AuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async createLocation(
    @Req() req: any,
    @Body() payload: UpdatePromoterLocationDto,
    @Headers("lang") langHeader?: string,
    @Headers("x-lang") xLangHeader?: string,
  ) {
    const userId = req.user.id;
    const { lat, lng } = payload;

    // Resolve projectId directly from the user without a query parameter
    const projectId = await this.usersService.resolveProjectIdFromUser(userId);

    try {
      const result = await this.journeyService.upsertPromoterLocation({
        userId,
        lat,
        lng,
        recordedAt: payload.recordedAt || null,
        lang: this.resolveLang(langHeader, xLangHeader),
        projectId,
      });

      return result;
    } catch (err) {
      this.logger.error(`Create location error: ${err.message}`);
      throw err;
    }
  }

  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UpdatePromoterLocationDto,
    ack?: (response: { event: string; data: unknown }) => void,
  ) {
    const user = client.data.user;
    if (!user?.id) {
      throw new UnauthorizedException("Unauthorized");
    }

    this.logger.log(
      `Tracking ping received user=${user.id} source=socket lat=${payload.lat} lng=${payload.lng}`,
    );

    const projectId = await this.usersService.resolveProjectIdFromUser(user.id);

    const result = await this.journeyService.upsertPromoterLocation({
      userId: user.id,
      lat: payload.lat,
      lng: payload.lng,
      recordedAt: payload.recordedAt || null,
      lang: this.resolveLang(
        client.handshake.auth?.lang,
        client.handshake.headers["lang"],
        client.handshake.headers["x-lang"],
      ),
      projectId,
    });

    this.logger.log(
      `Tracking ping completed user=${user.id} source=socket saved=${result.saved !== false}`,
    );

    if (typeof ack === "function") {
      ack({
        event: "location:updated",
        data: result,
      });
      this.logger.log(
        `Tracking ping acknowledged user=${user.id} source=socket`,
      );
    }
  }

  // GET endpoint for fetching paginated all location logs (filtered by requesting user's project ID)
  @Get()
  @UseGuards(AuthGuard)
  async getLocations(
    @Req() req: any,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("fromTime") fromTime?: string, // e.g. "10:45"
    @Query("toTime") toTime?: string, // e.g. "23:22"
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("minutes") minutes?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;

    // Resolve projectId directly from the requesting user
    const projectId = await this.usersService.resolveProjectIdFromUser(
      req.user.id,
    );

    if (!fromDate && !toDate && !fromTime && !toTime) {
      const activeMinutes = minutes ? Number(minutes) : 30;
      const items = await this.journeyService.getActivePromoterLocations(
        projectId,
        activeMinutes,
      );

      return {
        success: true,
        items,
        total: items.length,
        projectId,
      };
    }

    const result = await this.journeyService.getLocationLog({
      projectId,
      fromDate,
      toDate,
      fromTime,
      toTime,
      page: pageNum,
      limit: limitNum,
    });

    return { success: true, ...result };
  }

  // GET endpoint for fetching paginated user location logs (filtered by target user's project ID)
  @Get("user/:userId")
  @UseGuards(AuthGuard)
  async getUserLocations(
    @Param("userId") userId: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("fromTime") fromTime?: string,
    @Query("toTime") toTime?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;

    // Resolve projectId directly from the target user
    const projectId = await this.usersService.resolveProjectIdFromUser(userId);

    const result = await this.journeyService.getLocationLog({
      userId,
      projectId,
      fromDate,
      toDate,
      fromTime,
      toTime,
      page: pageNum,
      limit: limitNum,
    });

    return { success: true, ...result };
  }

  // PUT endpoint for updating an existing location
  @Put(":userId")
  @UseGuards(AuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateLocation(
    @Param("userId") userIdParam: string,
    @Body() payload: UpdatePromoterLocationDto,
    @Headers("lang") langHeader?: string,
    @Headers("x-lang") xLangHeader?: string,
  ) {
    const { lat, lng } = payload;

    // Resolve projectId directly from the target user
    const projectId =
      await this.usersService.resolveProjectIdFromUser(userIdParam);

    try {
      const result = await this.journeyService.upsertPromoterLocation({
        userId: userIdParam,
        lat,
        lng,
        recordedAt: payload.recordedAt || null,
        lang: this.resolveLang(langHeader, xLangHeader),
        projectId,
      });

      return result;
    } catch (err) {
      this.logger.error(`Update location error: ${err.message}`);
      throw err;
    }
  }

  // DELETE endpoint for removing a location
  @Delete(":userId")
  @UseGuards(AuthGuard)
  async deleteLocation(@Param("userId") userId: string) {
    try {
      const current = await this.journeyService.locationRepo.findOne({
        where: { userId },
      });
      await this.journeyService.locationRepo.delete({ userId });
      await this.locationCacheService.deleteLatestLocation(
        userId,
        current?.projectId,
      );
      return {
        success: true,
        message: "Location deleted successfully",
      };
    } catch (err) {
      this.logger.error(`Delete location error: ${err.message}`);
      throw err;
    }
  }

  private resolveLang(...values: any[]): "en" | "ar" {
    const candidate = values
      .flat()
      .find((value) => typeof value === "string" && value.length > 0);

    return candidate === "ar" ? "ar" : "en";
  }

  private async authenticateSocketClient(client: Socket): Promise<User> {
    const authHeader = client.handshake.headers.authorization;
    const authToken = client.handshake.auth?.token;
    const rawToken =
      typeof authToken === "string" && authToken.length > 0
        ? authToken
        : authHeader;
    const token =
      typeof rawToken === "string" ? rawToken.replace(/^Bearer\s+/i, "") : null;

    if (!token) {
      throw new UnauthorizedException("Missing token");
    }

    const payload = await this.jwtService.verifyAsync(token, {
      secret: process.env.JWT_SECRET,
    });
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ["role", "project"],
    });

    if (!user?.is_active) {
      throw new UnauthorizedException("User not found or inactive");
    }

    return user;
  }
}
