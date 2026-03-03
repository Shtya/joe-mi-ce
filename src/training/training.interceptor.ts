import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TrainingTranslationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const lang = request.headers['lang']?.toLowerCase() || 'en';

    return next.handle().pipe(
      map((data) => {
        if (!data) return data;

        if (Array.isArray(data)) {
          return data.map((item) => this.translateItem(item, lang));
        }

        if (data.data && Array.isArray(data.data)) {
            data.data = data.data.map((item) => this.translateItem(item, lang));
            return data;
        }

        if (data.data) {
            data.data = this.translateItem(data.data, lang);
            return data;
        }

        return this.translateItem(data, lang);
      }),
    );
  }

  private translateItem(item: any, lang: string) {
    if (typeof item !== 'object' || item === null) return item;

    const result = { ...item };

    if (lang === 'ar') {
      result.title = item.title_ar || item.title_en;
      result.description = item.description_ar || item.description_en;
    } else {
      result.title = item.title_en || item.title_ar;
      result.description = item.description_en || item.description_ar;
    }

    // Clean up internal fields if desired, or keep them
    // delete result.title_ar;
    // delete result.title_en;
    // delete result.description_ar;
    // delete result.description_en;

    return result;
  }
}
