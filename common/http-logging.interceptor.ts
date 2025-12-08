import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const { method, originalUrl } = req;
    const body = req.body;
    const files = req.files || req.file || null;
    const query = req.query;

    console.log('🔵 ----- Incoming Request -----');
    console.log('➡️ Endpoint:', method, originalUrl);
    console.log('🧩 Query:', query);

    if (files) {
      console.log('📁 Uploaded Files:', files);
    }

    console.log('------------------------------');

    return next.handle().pipe(
      tap((data) => {
        // console.log('🟢 Response:', data);
        // console.log('==================================');
      }),
    );
  }
}


/* 
📁 Uploaded Files: {
  fieldname: 'file',
  originalname: 'timeline-icon-white-0bdaf26b0421b533.png',
  encoding: '7bit',
  mimetype: 'image/png',
  destination: 'E:\\.env\\joe_me_ce\\uploads\\checkins',
  filename: 'timeline-icon-white-0bdaf26b0421b533-8849a14e0911dd9b.png',
  path: 'E:\\.env\\joe_me_ce\\uploads\\checkins\\timeline-icon-white-0bdaf26b0421b533-8849a14e0911dd9b.png',    
  size: 5383
*/