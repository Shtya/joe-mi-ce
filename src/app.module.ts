import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { join } from 'path';
import { LoggingValidationPipe } from 'common/translationPipe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ApiController } from './app.controller';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { QueryFailedErrorFilter } from 'common/QueryFailedErrorFilter';
import { AssetModule } from './asset/asset.module';
import { ProjectModule } from './project/project.module';
import { LocationsModule } from './locations/locations.module';
import { BranchModule } from './branch/branch.module';
import { CategoryModule } from './category/category.module';
import { BrandModule } from './brand/brand.module';
import { ProductModule } from './product/product.module';
import { StockModule } from './stock/stock.module';
import { ShiftModule } from './shift/shift.module';
import { JourneyModule } from './journey/journey.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CompetitorModule } from './competitor/competitor.module';
import { VacationModule } from './vacation/vacation.module';
import { AuditsModule } from './audit/audit.module';
import { SurveyModule } from './survey/survey.module';
import { SaleModule } from './sale/sale.module';
import { ExportModule } from './export/export.module';
import { UsersModule } from './users/users.module';
import { CheckoutsModule } from './checkout/checkout.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ProjectStatsModule } from './stats/stats.module';
import { NotificationModule } from './notification/notification.module';
import { SalesTargetModule } from './sales-target/sales-target.module';
import { StaticPagesModule } from './static-pages/static-pages.module';
import { ContactUs } from 'entities/contact-us.entity';
import { ContactUsModule } from './contact-us/contact-us.module';
 @Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT, 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      autoLoadEntities: true,
      synchronize: true,
      cache: true,
        extra: {
    poolSize: 20, // Increase pool size
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  }
    }),

    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRE },
    }),

    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(__dirname, '/../i18n/'),
        watch: true,
      },
      resolvers: [{ use: QueryResolver, options: ['lang'] }, new HeaderResolver(['x-lang'])],
    }),

    AuthModule,
    RolesModule,
    PermissionsModule,
    AssetModule,
    ProjectModule,
    LocationsModule,
    BranchModule,
    CategoryModule,
    BrandModule,
    ProductModule,
    StockModule,
    ShiftModule,
    JourneyModule,
    CompetitorModule,
    VacationModule,
    AuditsModule,
    SurveyModule,
    SaleModule,
    ExportModule,
    UsersModule,
    CheckoutsModule,
    FeedbackModule,
    ProjectStatsModule,
    NotificationModule,
    SalesTargetModule,
    StaticPagesModule,
    ContactUsModule
  ],
  controllers: [ApiController],
  providers: [LoggingValidationPipe, QueryFailedErrorFilter],
  exports: [LoggingValidationPipe],
})
export class AppModule {}
