import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  async sendOTPEmail(to: string, otp: string, actionType: string) {
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .email-container {
          font-family: Arial, sans-serif;
          color: #333;
          background-color: #f9f9f9;
          padding: 20px;
          max-width: 600px;
          margin: auto;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        .logo {
          text-align: center;
          margin-bottom: 20px;
        }
        .logo img {
          max-width: 150px;
        }
        .content {
          text-align: center;
          line-height: 1.6;
        }
        .otp-code {
          display: inline-block;
          margin: 20px auto;
          padding: 10px 20px;
          color: #007BFF;
          background-color: #e9f5ff;
          font-size: 24px;
          font-weight: bold;
          border-radius: 5px;
          border: 1px solid #007BFF;
        }
        .copy-button {
          margin-top: 20px;
          padding: 10px 20px;
          color: #fff;
          background-color: #007BFF;
          font-size: 16px;
          border-radius: 5px;
          border: none;
          cursor: pointer;
          text-decoration: none;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          font-size: 12px;
          color: #888;
        }
      </style>
    </head>
    <body>
  <div class="email-container">
    <div class="content">
      <h2>Your OTP Code</h2>
      <p>We received a request to ${actionType}. Use the OTP code below to proceed:</p>
      <div>
        <div class="otp-code">${otp}</div>
      </div>
      <p>This OTP code is valid for 5 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Your Project Name. All rights reserved.</p>
    </div>
  </div>
</body>
    </html>
    `;

    await this.transporter.sendMail({
      from: `"${process.env.PROJECT_NAME}" <${process.env.EMAIL_USER}>`,
      to,
      subject: actionType,
      html: htmlContent,
    });
  }
  async sendLetters(to: string, title: string, message: string) {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    .email-container {
      font-family: Arial, sans-serif;
      color: #333;
      background-color: #f9f9f9;
      padding: 20px;
      max-width: 600px;
      margin: auto;
      border-radius: 10px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    .logo {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo img {
      max-width: 150px;
    }
    .content {
      text-align: center;
      line-height: 1.6;
    }
    .title {
      font-size: 28px;
      color: #007BFF;
      margin-bottom: 10px;
    }
    .message {
      font-size: 18px;
      margin: 20px 0;
    }
    .username {
      font-weight: bold;
      margin-top: 20px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="content">
      <h2 class="title">${title}</h2>
      <p class="message">${message}</p>
      <p class="username">Sent to: ${to}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Your Project Name. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    await this.transporter.sendMail({
      from: `"${process.env.PROJECT_NAME}" <${process.env.EMAIL_USER}>`,
      to,
      subject: title,
      html: htmlContent,
    });
  }

  // mail.service.ts
  async sendReservationNotification(
    ownerEmail: string,
    data: {
      reservationId: number;
      venueName: string;
      dates: string;
      userName: string;
      totalPrice: number;
    }
  ) {
    const subject = 'New Reservation Request for Your Venue';

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e328b;">New Reservation Request</h2>
      <p>Dear Venue Owner,</p>
      
      <p>You have received a new reservation request for <strong>${data.venueName['en']}</strong>:</p>
      
      <div style="background: #f5f7fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Reservation ID:</strong> ${data.reservationId}</p>
        <p><strong>Requested Dates:</strong> ${data.dates}</p>
        <p><strong>Total Amount:</strong> SAR ${data.totalPrice.toFixed(2)}</p>
      </div>
      
      <p>Please log in to your vendor dashboard to review and approve this reservation.</p>

    </div>
  `;
 await this.transporter.sendMail({
      to: ownerEmail,
      subject,
      html: htmlContent,
    });
  }
}
