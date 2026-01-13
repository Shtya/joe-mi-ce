/**
 * main.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express';
import { LoggingValidationPipe } from 'common/translationPipe';
import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
import { LoggingInterceptor } from 'common/http-logging.interceptor';
import * as express from 'express';
import * as qs from 'qs';
import * as dotenv from 'dotenv';
import helmet from 'helmet';

// Load environment variables
dotenv.config();

const isDev = process.env.NODE_ENV === 'development';

// --------------------------------------------
// SHARED CONFIG
// --------------------------------------------
async function configureApp(app: NestExpressApplication) {
  app.useGlobalFilters(app.get(QueryFailedErrorFilter));
  app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), {
    prefix: '/uploads/',
  });
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.use(helmet());

  // ✅ ACCEPT ALL ORIGINS (credentials-safe)
  app.enableCors({
    origin: (origin, callback) => {
      // allow all origins (browser + server-to-server)
      callback(null, origin || true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-lang'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(app.get(LoggingValidationPipe));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Query parser
  const instance = app.getHttpAdapter().getInstance() as express.Express;
  instance.set('query parser', (str: string) =>
    qs.parse(str, {
      depth: 10,
      parseArrays: true,
      arrayLimit: 100,
      allowDots: false,
      parameterLimit: 1000,
    }),
  );

  return app;
}

// --------------------------------------------
// 🧪 DEVELOPMENT MODE
// --------------------------------------------
if (isDev) {
  (async () => {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    await configureApp(app);

    const port = process.env.PORT || 3030;
    await app.listen(port);

    Logger.log(`🧪 Dev server running at http://localhost:${port}`);
  })();
}

// --------------------------------------------
// 🚀 PRODUCTION / SERVERLESS MODE
// --------------------------------------------
let cachedApp: NestExpressApplication;

async function bootstrapServerless() {
  if (!cachedApp) {
    const server = express();

    // ❌ NO EXPRESS CORS — Nest owns CORS
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
      {cors:false}

    );

    await configureApp(app);
    await app.init();

    cachedApp = app;
  }

  return cachedApp;
}

// --------------------------------------------
// ⭐ SERVERLESS HANDLER
// --------------------------------------------
export default async function handler(req: any, res: any) {
  if (isDev) {
    res.status(400).send('Use the development server instead.');
    return;
  }

  const app = await bootstrapServerless();
  const expressInstance = app.getHttpAdapter().getInstance();
  return expressInstance(req, res);
}
