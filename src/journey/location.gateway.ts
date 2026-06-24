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
} from "@nestjs/common";
import { JourneyService } from "./journey.service";
import { UsersService } from "src/users/users.service";
import { AuthGuard } from "src/auth/auth.guard";

interface LocationPayload {
  lat: number;
  lng: number;
  offlineSince?: Date;
}

@Controller("location")
@UseGuards(AuthGuard)
export class LocationGateway {
  private readonly logger = new Logger(LocationGateway.name);

  constructor(
    private readonly journeyService: JourneyService,
    private readonly usersService: UsersService,
  ) {}

  // POST endpoint for creating a new location ping
  @Post()
  async createLocation(@Req() req: any, @Body() payload: LocationPayload) {
    const userId = req.user.id;
    const { lat, lng, offlineSince } = payload;

    // Resolve projectId directly from the user without a query parameter
    const projectId = await this.usersService.resolveProjectIdFromUser(userId);

    try {
      const result = await this.journeyService.upsertPromoterLocation({
        userId,
        lat,
        lng,
        offlineSince: offlineSince || null,
        projectId,
      });

      return {
        success: true,
        message: "Location created successfully",
        data: result,
      };
    } catch (err) {
      this.logger.error(`Create location error: ${err.message}`);
      throw err;
    }
  }

  // GET endpoint for fetching paginated all location logs (filtered by requesting user's project ID)
  @Get()
  async getLocations(
    @Req()              req:        any,
    @Query("fromDate")  fromDate?:  string,
    @Query("toDate")    toDate?:    string,
    @Query("fromTime")  fromTime?:  string, // e.g. "10:45"
    @Query("toTime")    toTime?:    string, // e.g. "23:22"
    @Query("page")      page?:      string,
    @Query("limit")     limit?:     string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;

    // Resolve projectId directly from the requesting user
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);

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
  async getUserLocations(
    @Param("userId")    userId:     string,
    @Query("fromDate")  fromDate?:  string,
    @Query("toDate")    toDate?:    string,
    @Query("fromTime")  fromTime?:  string,
    @Query("toTime")    toTime?:    string,
    @Query("page")      page?:      string,
    @Query("limit")     limit?:     string,
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
  async updateLocation(
    @Param("userId") userIdParam: string,
    @Body() payload: LocationPayload,
  ) {
    const { lat, lng, offlineSince } = payload;

    // Resolve projectId directly from the target user
    const projectId = await this.usersService.resolveProjectIdFromUser(userIdParam);

    try {
      const result = await this.journeyService.upsertPromoterLocation({
        userId: userIdParam,
        lat,
        lng,
        offlineSince: offlineSince || null,
        projectId,
      });

      return {
        success: true,
        message: "Location updated successfully",
        data: result,
      };
    } catch (err) {
      this.logger.error(`Update location error: ${err.message}`);
      throw err;
    }
  }

  // DELETE endpoint for removing a location
  @Delete(":userId")
  async deleteLocation(@Param("userId") userId: string) {
    try {
      await this.journeyService.locationRepo.delete({ userId });
      return {
        success: true,
        message: "Location deleted successfully",
      };
    } catch (err) {
      this.logger.error(`Delete location error: ${err.message}`);
      throw err;
    }
  }
}
