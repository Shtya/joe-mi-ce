import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as admin from "firebase-admin";

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  onModuleInit() {
    if (admin.apps.length > 0) {
      // Already initialised (e.g. in tests)
      return;
    }

    try {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      if (!serviceAccountJson) {
        this.logger.warn(
          "FIREBASE_SERVICE_ACCOUNT_JSON is not set. Push notifications will be disabled.",
        );
        return;
      }

      const serviceAccount = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.logger.log("Firebase Admin SDK initialised successfully.");
    } catch (err) {
      this.logger.error(
        "Failed to initialise Firebase Admin SDK",
        err?.message,
      );
    }
  }

  /**
   * Send a push notification to a single device via FCM.
   * Returns silently on error so it never breaks the main flow.
   */
  async sendPushNotification(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!fcmToken) {
      return;
    }

    if (admin.apps.length === 0) {
      this.logger.warn(
        "Firebase is not initialised; skipping push notification.",
      );
      return;
    }

    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Push sent successfully: ${response}`);
    } catch (err) {
      this.logger.error(`Failed to send push notification: ${err?.message}`);
    }
  }

  /**
   * Send a push notification to multiple devices (multicast).
   * Returns silently on error.
   */
  async sendMulticastPushNotification(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!fcmTokens || fcmTokens.length === 0) {
      return;
    }

    if (admin.apps.length === 0) {
      this.logger.warn(
        "Firebase is not initialised; skipping multicast push notification.",
      );
      return;
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      this.logger.log(
        `Multicast push: ${response.successCount} sent, ${response.failureCount} failed.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send multicast push notification: ${err?.message}`,
      );
    }
  }
}
