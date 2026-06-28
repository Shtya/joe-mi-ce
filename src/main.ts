/**
 * main.ts
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe } from "@nestjs/common";
import { join } from "path";
import { NestExpressApplication } from "@nestjs/platform-express";
import { LoggingValidationPipe } from "common/translationPipe";
import { QueryFailedErrorFilter } from "common/QueryFailedErrorFilter";
import { LoggingInterceptor } from "common/http-logging.interceptor";
import * as express from "express";
import * as qs from "qs";
import * as dotenv from "dotenv";
import helmet from "helmet";

dotenv.config();

async function configureApp(app: NestExpressApplication) {
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.useGlobalFilters(app.get(QueryFailedErrorFilter));

  app.useStaticAssets(join(__dirname, "..", "..", "uploads"), {
    prefix: "/uploads/",
  });

  app.useStaticAssets(join(__dirname, "..", "..", "tmp"), {
    prefix: "/tmp/",
  });

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.use(helmet());

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, origin || true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-lang", "lang"],
  });

  app.setGlobalPrefix("api/v1");

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

  const instance = app.getHttpAdapter().getInstance() as express.Express;

  instance.set("query parser", (str: string) =>
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  await configureApp(app);

  const port = Number(process.env.PORT) || 8081;

  await app.listen(port, "0.0.0.0");

  Logger.log(`🚀 Server running at http://0.0.0.0:${port}`);
}

bootstrap();