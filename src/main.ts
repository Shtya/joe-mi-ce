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

// ✅ Create raw Express server (Vercel will call this)
const server = express();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );

  const configService = app.get(ConfigService);

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
