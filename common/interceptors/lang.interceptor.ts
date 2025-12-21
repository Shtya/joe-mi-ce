// src/common/interceptors/lang.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class LangInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const lang = request.headers['lang'] || 'en'; // default to English
    request.lang = lang.toLowerCase();
    return next.handle().pipe(
      map((data) => {
        // Optionally transform messages according to lang
        // For now we just attach lang
        return { lang, ...data };
      }),
    );
  }
}
