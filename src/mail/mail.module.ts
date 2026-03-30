import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { MailService } from "./mail.service";

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
