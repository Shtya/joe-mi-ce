import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

export interface LatestLocationCacheItem {
  userId: string;
  projectId: string | null;
  journeyId: string | null;
  checkInId: string | null;
  lat: number;
  lng: number;
  recordedAt: string;
  distanceMeters: number | null;
  locationStatus: "inside" | "outside" | "too_far";
  isOutside: boolean;
  message: string;
  name?: string | null;
  avatar_url?: string | null;
  updatedAt?: string | null;
}

export interface LocationContextCacheItem {
  userId: string;
  name: string | null;
  avatar_url: string | null;
  projectId: string | null;
  journeyId: string | null;
  checkInId: string | null;
  branchGeo: string | null;
  branchRadiusMeters: number | null;
  branchChainName: string | null;
}

@Injectable()
export class LocationCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(LocationCacheService.name);
  private readonly contextTtlSeconds = Number(
    process.env.LOCATION_CONTEXT_CACHE_TTL_SECONDS || 60,
  );
  private readonly redis?: Redis;

  constructor() {
    if (!process.env.REDIS_HOST) {
      return;
    }

    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.redis.on("error", (error) => {
      this.logger.warn(`Redis location cache error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async setLatestLocation(item: LatestLocationCacheItem) {
    if (!this.redis) return;

    try {
      const value = JSON.stringify(item);
      const pipeline = this.redis.pipeline().set(this.userKey(item.userId), value);
      if (item.projectId) {
        pipeline.hset(this.projectUsersKey(item.projectId), item.userId, value);
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`Failed to write latest location cache: ${error.message}`);
    }
  }

  async getLatestLocation(userId: string): Promise<LatestLocationCacheItem | null> {
    if (!this.redis) return null;

    try {
      const value = await this.redis.get(this.userKey(userId));
      return this.parse(value);
    } catch (error) {
      this.logger.warn(`Failed to read user location cache: ${error.message}`);
      return null;
    }
  }

  async getProjectLocations(projectId: string): Promise<LatestLocationCacheItem[]> {
    if (!this.redis) return [];

    try {
      const values = await this.redis.hvals(this.projectUsersKey(projectId));
      return values
        .map((value) => this.parse(value))
        .filter((item): item is LatestLocationCacheItem => !!item);
    } catch (error) {
      this.logger.warn(`Failed to read project location cache: ${error.message}`);
      return [];
    }
  }

  async deleteLatestLocation(userId: string, projectId?: string | null) {
    if (!this.redis) return;

    try {
      await this.redis.del(this.userKey(userId));
      if (projectId) {
        await this.redis.hdel(this.projectUsersKey(projectId), userId);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete location cache: ${error.message}`);
    }
  }

  async getLocationContext(
    userId: string,
  ): Promise<LocationContextCacheItem | null> {
    if (!this.redis) return null;

    try {
      return this.parse<LocationContextCacheItem>(
        await this.redis.get(this.contextKey(userId)),
      );
    } catch (error) {
      this.logger.warn(`Failed to read location context cache: ${error.message}`);
      return null;
    }
  }

  async setLocationContext(item: LocationContextCacheItem) {
    if (!this.redis) return;

    try {
      await this.redis.set(
        this.contextKey(item.userId),
        JSON.stringify(item),
        "EX",
        this.contextTtlSeconds,
      );
    } catch (error) {
      this.logger.warn(`Failed to write location context cache: ${error.message}`);
    }
  }

  async deleteLocationContext(userId: string) {
    if (!this.redis) return;

    try {
      await this.redis.del(this.contextKey(userId));
    } catch (error) {
      this.logger.warn(`Failed to delete location context cache: ${error.message}`);
    }
  }

  private userKey(userId: string) {
    return `location:user:${userId}:latest`;
  }

  private projectUsersKey(projectId: string) {
    return `location:project:${projectId}:users`;
  }

  private contextKey(userId: string) {
    return `location:user:${userId}:context`;
  }

  private parse<T = LatestLocationCacheItem>(value?: string | null): T | null {
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
