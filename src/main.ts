/**
 * main.ts
 * Auto mode selection:
 *
 * 🧪 DEVELOPMENT:
 *   - NODE_ENV = development
 *   - Runs normal NestJS server (app.listen)
 *
 * 🚀 PRODUCTION (DEFAULT):
 *   - Any other NODE_ENV (or undefined)
 *   - Uses serverless handler (for Vercel)
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
import * as cors from 'cors';

const isDev = process.env.NODE_ENV === 'development';

// --------------------------------------------
// SHARED CONFIG
// --------------------------------------------
async function configureApp(app: NestExpressApplication) {
  app.useGlobalFilters(app.get(QueryFailedErrorFilter));
  app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), { prefix: '/uploads/' });
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({ origin: true, credentials: true });
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
// 🧪 DEVELOPMENT MODE (app.listen)
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
// 🚀 PRODUCTION MODE (default handler)
// --------------------------------------------
let cachedApp: NestExpressApplication;

async function bootstrapServerless() {
  if (!cachedApp) {
    const server = express();

    // ✅ Dynamic origin: allow localhost:30012 + any other origin
    const corsOptions = {
      origin: (origin: string | undefined, callback: Function) => {
        if (!origin || origin === 'http://localhost:30012') {
          // allow requests with no origin (like Postman) or localhost:30012
          callback(null, true);
        } else {
          // allow all origins dynamically
          callback(null, true);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };

    // ✅ Apply CORS middleware early (handles preflight)
    server.use(cors(corsOptions));
    server.options('*', cors(corsOptions)); // explicit OPTIONS handler

    // ✅ Create Nest app
    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
    );

    // ✅ Nest-level CORS (still needed for non-preflight requests)
    app.enableCors(corsOptions);

    await configureApp(app);
    await app.init();

    cachedApp = app;
  }

  return cachedApp;
}
// --------------------------------------------
// ⭐ THIS MUST BE TOP-LEVEL (VALID TS)
// --------------------------------------------
export default async function handler(req: any, res: any) {
  // In dev mode → DO NOT use serverless handler
  if (isDev) {
    res.status(400).send('Use the development server instead.');
    return;
  }

  const app = await bootstrapServerless();
  const expressInstance = app.getHttpAdapter().getInstance();
  return expressInstance(req, res);
}
