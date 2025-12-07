// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { Logger, ValidationPipe } from '@nestjs/common';
// import { join } from 'path';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import { LoggingValidationPipe } from 'common/translationPipe';
// import { ConfigService } from '@nestjs/config';
// import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
// import { LoggingInterceptor } from 'common/http-logging.interceptor';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule);
//   const port = process.env.PORT || 3030;

//   app.useGlobalFilters(app.get(QueryFailedErrorFilter));
//   app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), { prefix: '/uploads/' });
//   // app.useGlobalInterceptors(new LoggingInterceptor());

//   app.enableCors({
//     origin: true,
//     credentials: true,
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
//     allowedHeaders: 'Content-Type, Authorization, Accept',
//   });
  
//   app.setGlobalPrefix('api/v1');

//   const loggingValidationPipe = app.get(LoggingValidationPipe);
//   app.useGlobalPipes(loggingValidationPipe);
//   app.useGlobalPipes(new ValidationPipe({ disableErrorMessages: false, transform: true, forbidNonWhitelisted: true, whitelist: true }));

//   Logger.log(`🚀 server is running on port ${port}`);
//   await app.listen(port);
// }
// bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express';
import { LoggingValidationPipe } from 'common/translationPipe';
import { ConfigService } from '@nestjs/config';
import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
import * as express from 'express';
import { LoggingInterceptor } from 'common/http-logging.interceptor';
import * as qs from 'qs';

// ✅ Create raw Express server (Vercel will call this)
const server = express();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );

  const configService = app.get(ConfigService);
  
  // ✅ Configure qs parser for nested query parameters
  // This is CRITICAL for parsing filters[role][name]=value format
  const qsParser = qs.parse;
  (app.getHttpAdapter().getInstance() as express.Express).set(
    'query parser',
    (str: string) => {
      try {
        return qsParser(str, {
          depth: 10, // Allow nested objects up to 10 levels
          arrayLimit: 100, // Allow arrays up to 100 items
          parseArrays: true, // Parse arrays in query strings
          allowDots: false, // Don't convert dots to nested objects (we want brackets)
          allowPrototypes: true,
          parameterLimit: 1000, // Maximum number of parameters
        });
      } catch (error) {
        console.error('Query parsing error:', error);
        return {};
      }
    },
  );

  // ✅ Also add middleware to ensure query parsing happens
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    // If query is not parsed properly (might be empty object), parse it manually
    if (req.url.includes('?') && (!req.query || Object.keys(req.query).length === 0)) {
      const queryString = req.url.split('?')[1];
      try {
        req.query = qs.parse(queryString, {
          depth: 10,
          arrayLimit: 100,
          parseArrays: true,
          allowDots: false,
        });
      } catch (error) {
        console.warn('Failed to parse query string:', error);
      }
    }
    next();
  });

  // Global filters
  app.useGlobalFilters(app.get(QueryFailedErrorFilter));

  // Static uploads (note: Vercel FS is read-only for runtime writes)
  app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), {
    prefix: '/uploads/',
  });
  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // Custom logging validation pipe
  const loggingValidationPipe = app.get(LoggingValidationPipe);
  app.useGlobalPipes(loggingValidationPipe);

  // Standard validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      disableErrorMessages: false,
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true,
      transformOptions: {
        enableImplicitConversion: true, // Enable type conversion
      },
    }),
  );

  await app.init();

  Logger.log(`🚀 Nest app initialized (Vercel/Express mode)`);

  return app;
}

const appPromise = bootstrap();

export default async (req: express.Request, res: express.Response) => {
  const app = await appPromise;
  const expressInstance = app.getHttpAdapter().getInstance();
  return expressInstance(req, res);
};