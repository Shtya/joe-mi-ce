import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import * as FormData from 'form-data';
import * as fs from 'fs';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendReportEmail(
    attachmentPath: string, 
    filename: string,
    toEmail?: string,
    subject?: string,
    text?: string
  ): Promise<boolean> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL') || `Reports <reports@${domain}>`;
    const defaultToEmail = this.configService.get<string>('MANAGER_EMAIL') || 'manager@company.com';

    if (!apiKey || !domain) {
      this.logger.warn('Mailgun API key or domain is not configured. Email will not be sent.');
      return false;
    }

    try {
      const url = `https://api.mailgun.net/v3/${domain}/messages`;
      
      const formData = new FormData();
      formData.append('from', fromEmail);
      formData.append('to', toEmail || defaultToEmail);
      formData.append('subject', subject || 'Daily Team Report');
      formData.append('text', text || 'Attached is the updated report.');
      
      if (fs.existsSync(attachmentPath)) {
        formData.append('attachment', fs.createReadStream(attachmentPath), {
          filename: filename,
        });
      } else {
        this.logger.error(`Attachment file not found at path: ${attachmentPath}`);
        return false;
      }

      const auth = Buffer.from(`api:${apiKey}`).toString('base64');

      const response = await lastValueFrom(
        this.httpService.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Basic ${auth}`,
          },
        })
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

  async sendTestEmail(toEmail: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL') || `Reports <reports@${domain}>`;

    if (!apiKey || !domain) {
      this.logger.warn('Mailgun API key or domain is not configured. Email will not be sent.');
      return false;
    }

    try {
      const url = `https://api.mailgun.net/v3/${domain}/messages`;
      
      const formData = new FormData();
      formData.append('from', fromEmail);
      formData.append('to', toEmail);
      formData.append('subject', 'Test Email from System');
      formData.append('text', 'This is a test email sent from the CE API.');

      const auth = Buffer.from(`api:${apiKey}`).toString('base64');

      const response = await lastValueFrom(
        this.httpService.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Basic ${auth}`,
          },
        })
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
