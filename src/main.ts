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
import * as cors from 'cors';

const isDev = process.env.NODE_ENV === 'development';

// --------------------------------------------
// SHARED CONFIG
// --------------------------------------------
async function configureApp(app: NestExpressApplication) {
  app.useGlobalFilters(app.get(QueryFailedErrorFilter));
  app.useStaticAssets(join(__dirname, '..', '..', '/uploads'), { prefix: '/uploads/' });
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ✅ FIXED: Explicit CORS configuration
  const corsOptions = {
    origin: isDev
      ? ['http://localhost:30012', 'http://localhost:3000']  // Development origins
      : (origin: string | undefined, callback: Function) => { // Production - dynamic
          // Allow all origins in production (or customize as needed)
          // You might want to restrict this to specific domains
          callback(null, true);
        },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    preflightContinue: false,
    optionsSuccessStatus: 200
  };

  // ✅ Apply CORS with proper configuration
  app.enableCors(corsOptions);

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

    // ✅ Fixed CORS configuration for serverless
    const corsOptions = {
      origin: (origin: string | undefined, callback: Function) => {
        // Allow all origins in serverless/production
        // You can add specific domain checks here if needed
        callback(null, origin || true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      preflightContinue: false,
      optionsSuccessStatus: 200
    };

    // ✅ Apply CORS middleware
    server.use(cors(corsOptions));

    // ✅ Explicitly handle OPTIONS requests
    server.options('*', cors(corsOptions));

    const app = await NestFactory.create<NestExpressApplication>(
      AppModule,
      new ExpressAdapter(server),
    );

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
  if (isDev) {
    res.status(400).send('Use the development server instead.');
    return;
  }

  const app = await bootstrapServerless();
  const expressInstance = app.getHttpAdapter().getInstance();
  return expressInstance(req, res);
}