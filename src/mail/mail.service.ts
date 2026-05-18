import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { lastValueFrom } from "rxjs";
import * as FormData from "form-data";
import * as fs from "fs";

type MailAttachment = {
  filename: string;
  path?: string;
  content?: Buffer;
  contentType?: string;
};

type SendEmailOptions = {
  toEmail?: string;
  subject?: string;
  text?: string;
  html?: string;
  ccEmail?: string;
  attachments?: MailAttachment[];
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    const apiKey = this.configService.get<string>("MAILGUN_API_KEY");
    const domain = this.configService.get<string>("MAILGUN_DOMAIN");
    const fromEmail =
      this.configService.get<string>("MAILGUN_FROM_EMAIL") ||
      `Reports <reports@${domain}>`;
    const defaultToEmail =
      this.configService.get<string>("MANAGER_EMAIL") || "manager@company.com";

    if (!apiKey || !domain) {
      this.logger.warn(
        "Mailgun API key or domain is not configured. Email will not be sent.",
      );
      return false;
    }

    try {
      const url = `https://api.mailgun.net/v3/${domain}/messages`;

      const formData = new FormData();
      formData.append("from", fromEmail);
      formData.append("to", options.toEmail || defaultToEmail);
      if (options.ccEmail) {
        formData.append("cc", options.ccEmail);
      }
      formData.append("subject", options.subject || "Daily Team Report");

      if (options.text) formData.append("text", options.text);
      if (options.html) formData.append("html", options.html);
      if (!options.text && !options.html) {
        formData.append("text", "Attached is the updated report.");
      }

      for (const attachment of options.attachments || []) {
        if (attachment.path) {
          if (!fs.existsSync(attachment.path)) {
            this.logger.error(
              `Attachment file not found at path: ${attachment.path}`,
            );
            return false;
          }

          formData.append(
            "attachment",
            fs.createReadStream(attachment.path),
            {
              filename: attachment.filename,
              contentType: attachment.contentType,
            },
          );
          continue;
        }

        if (attachment.content) {
          formData.append("attachment", attachment.content, {
            filename: attachment.filename,
            contentType: attachment.contentType,
          });
        }
      }

      const auth = Buffer.from(`api:${apiKey}`).toString("base64");

      const response = await lastValueFrom(
        this.httpService.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Basic ${auth}`,
          },
        }),
      );

      this.logger.log(`Email sent successfully: ${response.data.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      if (error.response) {
        this.logger.error(JSON.stringify(error.response.data));
      }
      return false;
    }
  }

  async sendReportEmail(
    attachmentPath: string,
    filename: string,
    toEmail?: string,
    subject?: string,
    text?: string,
    html?: string,
    ccEmail?: string,
  ): Promise<boolean> {
    return this.sendEmail({
      toEmail,
      subject,
      text,
      html,
      ccEmail,
      attachments: [{ path: attachmentPath, filename }],
    });
  }

  async sendTestEmail(toEmail: string): Promise<boolean> {
    const apiKey = this.configService.get<string>("MAILGUN_API_KEY");
    const domain = this.configService.get<string>("MAILGUN_DOMAIN");
    const fromEmail =
      this.configService.get<string>("MAILGUN_FROM_EMAIL") ||
      `Reports <reports@${domain}>`;

    if (!apiKey || !domain) {
      this.logger.warn(
        "Mailgun API key or domain is not configured. Email will not be sent.",
      );
      return false;
    }

    try {
      const url = `https://api.mailgun.net/v3/${domain}/messages`;

      const formData = new FormData();
      formData.append("from", fromEmail);
      formData.append("to", toEmail);
      formData.append("subject", "Test Email from System");
      formData.append("text", "This is a test email sent from the CE API.");

      const auth = Buffer.from(`api:${apiKey}`).toString("base64");

      const response = await lastValueFrom(
        this.httpService.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Basic ${auth}`,
          },
        }),
      );

      this.logger.log(`Test email sent successfully: ${response.data.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send test email: ${error.message}`);
      if (error.response) {
        this.logger.error(JSON.stringify(error.response.data));
      }
      return false;
    }
  }
}
