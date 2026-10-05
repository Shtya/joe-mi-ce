# Mobile Location Tracking Guide

Use this guide together with [the Socket.IO contract](./location-socket.md). It is written for Android, iOS, Flutter, and React Native teams. The exact native APIs differ, but the rules below do not.

## Goal and data flow

The app must never lose a valid location merely because the phone has no signal or the socket is temporarily disconnected.

~~~text
Native GPS reading
  → validate accuracy and coordinate range
  → save a durable queue record
  → send the oldest queued record over Socket.IO
  → receive acknowledgement
  → delete that exact local record
~~~

Persist before sending. A memory-only queue is lost when the operating system kills the app.

## When tracking may run

Start tracking only after all conditions are true:

1. The user is logged in and has a valid access token.
2. The required location permission is granted.
3. The user is checked in, if the product tracks only during a shift.
4. The native GPS watcher and the queue manager have started.

Stop tracking on check-out, logout, or permission revocation. Stop both the native GPS watcher and the Socket.IO manager; stopping only the socket still collects data and consumes battery.

## Permissions and privacy

Request the minimum permission required.

| Platform | Recommended flow | Important handling |
| --- | --- | --- |
| Android | Request fine location first. Request background location only when tracking is explicitly required outside the app. | Handle approximate location, “don’t ask again”, and battery-optimization restrictions. |
| iOS | Request “When In Use” first. Request “Always” only when background tracking is approved. | Provide the required Info.plist usage descriptions; handle reduced accuracy and “Allow Once”. |
| All platforms | Permissions can change at any time. | Re-check them when returning to foreground and stop immediately when revoked. |

Before displaying the native permission prompt, explain the reason in plain language. Example: “Your work location is shared while you are checked in so supervisors can confirm branch attendance.” The wording must match the real collection policy and the company privacy policy.

## GPS collection policy

The backend accepts latitude and longitude, but the mobile app must filter invalid or noisy readings before queueing them.

| Situation | Safe starting policy |
| --- | --- |
| Foreground, checked in | High-accuracy reading every 30–60 seconds, or after movement of 25–50 meters. |
| Background, checked in | Use the platform-approved background service; prefer distance updates or a 1–5 minute interval. |
| Poor horizontal accuracy | Skip or retain for review when accuracy exceeds the product threshold, such as 100 meters. |
| Stationary user | Avoid repeatedly sending the same point; use a distance filter. |
| Stale reading | Do not treat a reading older than the freshness policy as live; send it only as an intentional offline point. |

These are product-policy suggestions, not server limits. Test battery use and geofence accuracy on real devices before setting final values.

Validate every device reading:

~~~ts
function canQueueLocation(location: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt: Date;
}): boolean {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return false;
  }

  if (location.latitude < -90 || location.latitude > 90) return false;
  if (location.longitude < -180 || location.longitude > 180) return false;
  if (location.accuracyMeters != null && location.accuracyMeters > 100) return false;

  return true;
}
~~~

## Durable offline queue

Use durable device storage: SQLite, Room, Core Data, MMKV, AsyncStorage with appropriate safeguards, or the platform equivalent.

Store at least:

~~~ts
type QueuedLocationPoint = {
  id: string;                 // Device-only UUID; prevents local duplicates.
  lat: number;
  lng: number;
  recordedAt: string;         // Original capture time, ISO-8601 with Z or offset.
  accuracyMeters?: number;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
};
~~~

The current backend does not accept an idempotency key; retain the point ID locally to ensure the app does not insert or delete the wrong point.

Queue behavior:

1. Validate the native reading.
2. Write it to durable storage with the original timestamp.
3. Send only the oldest eligible record, one at a time.
4. Delete it only after a successful location acknowledgement.
5. On a timeout or network failure, keep it and schedule a retry.
6. Send queue records in ascending capture-time order.

The server saves every accepted point in the audit history. Only a newer point can update the live location, so an old offline point must not move a promoter backward on the supervisor map.

## Timestamp rules

For a normal live point, the timestamp is optional. Omit it and the server generates the current time automatically.

For a delayed/offline point, include the original capture time:

~~~json
{
  "lat": 24.7136,
  "lng": 46.6753,
  "recordedAt": "2026-09-28T09:30:00.000Z"
}
~~~

The response returns the same instant in Saudi Arabia time:

~~~json
{
  "event": "location:updated",
  "data": {
    "recordedAt": "2026-09-28T12:30:00.000+03:00"
  }
}
~~~

Saudi Arabia is always Asia/Riyadh / UTC+03:00. Display the returned time directly. Do not add another three hours on the mobile client.

## One Socket.IO manager

Create one application-level manager, not one socket per GPS update. It owns the current token, one socket connection, the durable queue, the GPS watcher, retries, and app lifecycle handling.

~~~ts
class LocationSocketManager {
  private socket?: Socket;
  private isFlushing = false;

  connect(accessToken: string, language: "en" | "ar") {
    this.socket = io("[API_ORIGIN]/location", {
      auth: { token: accessToken, lang: language },
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    this.socket.on("connect", () => void this.flushQueue());
    this.socket.on("connect_error", (error) => this.handleAuthFailure(error));
    this.socket.on("disconnect", (reason) => this.logDisconnect(reason));
  }

  async onNativeLocation(location: NativeLocation) {
    if (!canQueueLocation(location)) return;

    await queue.insert({
      id: createUuid(),
      lat: location.latitude,
      lng: location.longitude,
      recordedAt: location.capturedAt.toISOString(),
      accuracyMeters: location.accuracyMeters,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: null,
    });

    await this.flushQueue();
  }

  async flushQueue() {
    if (this.isFlushing || !this.socket?.connected) return;
    this.isFlushing = true;

    try {
      while (this.socket.connected) {
        const point = await queue.getOldestEligible();
        if (!point) return;

        const response = await this.emitWithAcknowledgement(point);
        if (response?.data?.success) {
          await queue.remove(point.id);
        } else {
          await queue.scheduleRetry(point.id);
          return;
        }
      }
    } catch {
      // Keep the record; retry it through the bounded retry policy.
    } finally {
      this.isFlushing = false;
    }
  }

  private emitWithAcknowledgement(point: QueuedLocationPoint) {
    return new Promise<LocationUpdateResponse>((resolve, reject) => {
      this.socket?.timeout(10_000).emit(
        "location:update",
        { lat: point.lat, lng: point.lng, recordedAt: point.recordedAt },
        (error: Error | null, response: LocationUpdateResponse) => {
          if (error) reject(error);
          else resolve(response);
        },
      );
    });
  }
}
~~~

The manager must keep queue flushing sequential. Parallel sends can acknowledge out of order and make debugging difficult.

## Retry and reconnection

Retry transient failures only: no network, socket timeout, temporary server error, or disconnection. Do not retry invalid coordinates as though they were a network problem.

Use bounded exponential backoff with random jitter:

~~~text
first retry: immediately once connected
second retry: around 2 seconds
third retry: around 5 seconds
fourth retry: around 15 seconds
later retries: no more often than every 60 seconds, with jitter
~~~

After several fast retries, leave the point queued and retry when connectivity returns or when the app is active again. Never use a tight infinite retry loop.

If the server emits Unauthorized, stop flushing, refresh the token through the normal login flow, recreate the socket with the new token, and resume. Do not delete queued points because a token expired.

## Foreground, background, and termination

| Application state | Required behavior |
| --- | --- |
| Foreground | Run the watcher when tracking is allowed; reconnect and flush the queue. |
| Background | Use the platform-approved background mechanism. The OS may suspend sockets, so persist every point before sending. |
| Returns to foreground | Re-check location permission and token, reconnect, then flush in order. |
| Force-closed/terminated | The socket ends. Only an OS-permitted native background mechanism can collect; retain records for the next launch. |
| Airplane mode/no signal | Keep valid points queued; never display them as sent. |
| Permission revoked | Stop GPS and socket tracking, tell the user how to re-enable access, and follow the privacy policy for queued data. |

iOS background execution is system controlled. Android devices may apply manufacturer-specific battery optimization. Do not promise continuous tracking until the chosen native approach has been verified on supported devices.

## Geofence and UI meaning

The acknowledgement contains:

- inside: within the branch radius.
- outside: beyond the radius but no more than twice it.
- too_far: more than twice the radius away.
- isOutside: true for outside and too_far.
- distanceMeters: distance from branch center, or null if no geofence applies.

Use the server result as the authority. Do not reproduce geofence calculations on the mobile client.

The socket acknowledges only the sender; it does not broadcast location updates to supervisor devices. Supervisor maps must use the HTTP location-read flow until a server-to-supervisor subscription event exists.

## Mobile QA release checklist

- [ ] Login, permission grant, live point, and Saudi (+03:00) response timestamp.
- [ ] Permission denial and later permission revocation.
- [ ] Foreground-to-background-to-foreground with no duplicate managers.
- [ ] Offline queue survives app restart and flushes points once, in order.
- [ ] Expired JWT retains queued records and resumes only after reauthentication.
- [ ] Poor GPS accuracy follows the selected filtering policy.
- [ ] Inside, outside, and too-far geofence states display correctly.
- [ ] UTC offline timestamp (Z) returns the same instant with Saudi +03:00.
- [ ] Check-out/logout stops both native GPS and the socket.
