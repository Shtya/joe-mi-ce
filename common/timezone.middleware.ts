import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext } from './request-context';
import axios from 'axios';

@Injectable()
export class TimezoneMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    let offsetMinutes: number | undefined;

    // 1. Try Header (Fastest/Most Reliable if provided)
    const headerOffset = req.headers['x-timezone-offset'];
    if (headerOffset) {
      offsetMinutes = parseInt(headerOffset as string, 10);
    }

    // 2. Try IP Geolocation (if no header)
    if (offsetMinutes === undefined) {
      try {
        const xfwd = (req.headers['x-forwarded-for'] as string) || req.ip || '';
        const ip = (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(',')[0].trim();
        
        // Skip local IPs
        if (ip && ip !== '::1' && ip !== '127.0.0.1' && !ip.startsWith('192.168.')) {
          // Fields: 520 (offset), 256 (timezone) -> Sum is bits. 
          // Just request specific fields in query
          const response = await axios.get(`http://ip-api.com/json/${ip}?fields=offset`, { timeout: 1000 });
          if (response.data && typeof response.data.offset === 'number') {
            offsetMinutes = response.data.offset / 60;
          }
        }
      } catch (error) {
        // Silently fail, fall back to default
      }
    }

    // 3. Fallback (If UTC server, default to Egypt +2 as requested by user)
    if (offsetMinutes === undefined) {
      const serverOffset = -new Date().getTimezoneOffset();
      if (serverOffset === 0) {
        offsetMinutes = 120; // Default to Egypt +02:00
      } else {
        offsetMinutes = serverOffset;
      }
    }

    RequestContext.run({ timezoneOffsetMinutes: offsetMinutes }, () => next());
  }
}
