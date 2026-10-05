# Location Socket.IO Integration Guide

This guide defines the production contract for real-time promoter location
tracking. Use it for mobile, web, and supervisor-map clients.

For mobile-specific permissions, background execution, GPS quality, durable
offline queues, retry behavior, and release testing, see the
[Mobile Location Tracking Guide](./mobile-location-tracking.md).

## At a glance

| Item | Value |
| --- | --- |
| Protocol | Socket.IO 4.x |
| Namespace | `/location` |
| Client event | `location:update` |
| Successful acknowledgement event | `location:updated` |
| Authentication | JWT at connection time |
| Server port | The application port (`PORT`, default `8081`) |
| HTTP API prefix | `/api/v1`; it does **not** apply to the Socket.IO namespace |
| Location timestamp timezone | Saudi Arabia, `Asia/Riyadh` (`UTC+03:00`) |

For example, when the API runs at `https://api.example.com`, connect to
`https://api.example.com/location`, not `https://api.example.com/api/v1/location`.

## Install and connect

Install a Socket.IO v4-compatible client:

```bash
npm install socket.io-client
```

Connect with the user JWT in `auth.token`. The token may include `Bearer `, but
sending only the raw JWT is preferred. Send `lang: "ar"` for Arabic geofence
messages; any other value, or no value, uses English.

```ts
import { io } from "socket.io-client";

const socket = io(`${API_ORIGIN}/location`, {
  auth: {
    token: accessToken,
    lang: "ar",
  },
  transports: ["websocket", "polling"],
  reconnection: true,
});

socket.on("connect", () => {
  console.log("Location socket connected", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("Location socket disconnected", reason);
});
```

The server also accepts the token from the `Authorization: Bearer <JWT>`
handshake header. Browser clients should normally use `auth.token`, because
custom WebSocket headers are not consistently supported by browsers.

### Authentication failure

The JWT must be valid and its user must be active. On failure, Socket.IO rejects
the namespace connection with `connect_error` before any location event handler
can run:

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

Handle it before attempting location updates:

```ts
socket.on("connect_error", (error) => {
  console.error(error.message);
  socket.disconnect();
  // Refresh/login again before making another socket connection.
});
```

## Send a location update

Emit `location:update` with numeric latitude and longitude. Use the Socket.IO
acknowledgement callback to receive the result.

```ts
socket.emit(
  "location:update",
  {
    lat: 24.7136,
    lng: 46.6753,
  },
  (response) => {
    console.log(response.event); // "location:updated"
    console.log(response.data.locationStatus); // "inside", "outside", or "too_far"
  },
);
```

### Request payload

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `lat` | number | Yes | GPS latitude in decimal degrees. |
| `lng` | number | Yes | GPS longitude in decimal degrees. |
| `recordedAt` | ISO-8601 datetime string | No | The original GPS capture time, used for an offline point that is uploaded later. |

`lat` and `lng` are validated as numbers. Send decimal degrees, not a string,
degrees/minutes/seconds, or a nested coordinate object.

### Timestamp rules

`recordedAt` is optional:

1. **Live update:** omit it. The server automatically records the current time
   and returns it in Saudi Arabia time (`Asia/Riyadh`, `+03:00`).
2. **Offline queued update:** send the original GPS capture time as a complete
   ISO-8601 timestamp with an offset or `Z`. The server preserves that instant,
   then returns its Saudi-time representation.

Examples for the same instant:

```json
{ "recordedAt": "2026-09-28T09:30:00.000Z" }
```

```json
{ "recordedAt": "2026-09-28T12:30:00.000+03:00" }
```

Both represent the same moment. A successful response always uses the Saudi
offset format, for example `2026-09-28T12:30:00.000+03:00`.

PostgreSQL persists `recordedAt` as `timestamptz`. That correctly stores the
absolute moment (typically displayed by database tools in UTC); it does not
lose the Saudi-time meaning or add three hours. The `+03:00` conversion is an
API/socket presentation rule. Never manually add three hours on the client.

Saudi Arabia has no daylight-saving-time adjustment, so `Asia/Riyadh` is always
UTC+03:00.

## Successful acknowledgement

The server returns this acknowledgement object for a successful update:

```json
{
  "event": "location:updated",
  "data": {
    "success": true,
    "userId": "d2e4b5d9-21d4-4c79-9479-9d4975c02341",
    "projectId": "7170e19c-12f5-4452-890d-953f0f6dd76d",
    "journeyId": "5c859b8e-78e8-41c7-aace-b506671e22e1",
    "checkInId": "2570b47f-1a6d-4413-a469-c0525952ff91",
    "lat": 24.7136,
    "lng": 46.6753,
    "recordedAt": "2026-09-28T12:30:00.000+03:00",
    "distanceMeters": 42,
    "locationStatus": "inside",
    "isOutside": false,
    "message": "User is inside the branch geofence",
    "name": "Promoter Name",
    "avatar_url": "https://cdn.example.com/avatar.jpg"
  }
}
```

| Response field | Type | Notes |
| --- | --- | --- |
| `success` | `true` | Present for every successful location result. |
| `userId` | UUID | Taken from the authenticated token; clients cannot choose it. |
| `projectId` | UUID or `null` | Resolved from the authenticated user. |
| `journeyId` | UUID or `null` | The active journey, when one exists. |
| `checkInId` | UUID or `null` | The active check-in, when one exists. |
| `lat`, `lng` | number | The accepted coordinates. |
| `recordedAt` | ISO-8601 string | Always represented in Saudi Arabia time with `+03:00`. |
| `distanceMeters` | number or `null` | Distance from the branch geofence center; `null` when no applicable geofence exists. |
| `locationStatus` | `inside` \| `outside` \| `too_far` | Geofence assessment. |
| `isOutside` | boolean | `true` for `outside` and `too_far`. |
| `message` | string | English by default, Arabic when `lang` is `ar`. |
| `name`, `avatar_url` | string or `null` | Current promoter identity data for a live map. |

## Geofence behavior

For ordinary branches, the server calculates the distance from the branch
coordinates and applies the configured radius:

| Result | Rule | `isOutside` |
| --- | --- | --- |
| `inside` | Distance is less than or equal to the branch radius. | `false` |
| `outside` | Distance is greater than the radius and no greater than twice the radius. | `true` |
| `too_far` | Distance is greater than twice the radius. | `true` |

Branches whose chain name includes `roaming` do not receive a geofence
assessment. Their result remains `inside` with `distanceMeters: null`.

## Offline, retry, and ordering behavior

- Queue unsent locations locally while the device is offline.
- Preserve the original capture time in `recordedAt` for every queued point.
- Send queued points in capture order after reconnecting.
- Use acknowledgements before removing a queued point; retry transient network
  failures with bounded exponential backoff.
- Each accepted ping creates an append-only audit-log record.
- The current/live-location record and Redis cache update only when the point is
  newer than the currently known location. An older offline point is retained
  in history but cannot move the person backward on the live map.
- If a checked-in user has a gap of more than 20 minutes since the previous
  recorded ping, the server marks the new log with the prior timestamp as its
  `offlineSince` value. This field is internal and is not returned by the
  socket acknowledgement.

Recommended acknowledgement timeout pattern:

```ts
socket.timeout(10_000).emit(
  "location:update",
  { lat, lng, recordedAt },
  (error, response) => {
    if (error) {
      // Keep this point in the offline queue and retry later.
      return;
    }

    // Remove the point only after response.data.success is true.
    console.log(response.data.recordedAt);
  },
);
```

## Important limitations

- The location gateway does **not** broadcast updates to other socket clients.
  A sender receives its own acknowledgement only. Supervisor maps must use the
  existing HTTP location endpoints until a broadcast/subscription event is
  implemented.
- Do not trust a client-side user or project ID: neither is accepted in this
  socket payload. The server derives identity and project scope from the JWT.
- CORS is currently configured to allow all origins for this gateway. Production
  deployments should restrict it to approved client origins.
- Client-side GPS permissions, accuracy, and battery policy remain the client
  application's responsibility. Send only after user consent and follow the
  applicable privacy policy.

## HTTP fallback

When Socket.IO is unavailable, authenticated clients can use:

```text
POST /api/v1/location
Content-Type: application/json
Authorization: Bearer <JWT>
```

with the same `lat`, `lng`, and optional `recordedAt` body. It follows the same
location-processing, timestamp, audit-log, and geofence rules.

## Server configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `PORT` | Application and Socket.IO port | `8081` |
| `JWT_SECRET` | Required to validate socket JWTs | No safe default |
| `REDIS_HOST` | Enables latest-location/cache storage | Cache disabled when absent |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | Unset |
| `REDIS_DB` | Redis database index | `0` |
| `LOCATION_CONTEXT_CACHE_TTL_SECONDS` | Location context cache lifetime | `60` seconds |

## Contract checklist for client teams

- [ ] Connect to `${API_ORIGIN}/location` with the current JWT in `auth.token`.
- [ ] Listen for `connect_error`, then reauthenticate before reconnecting.
- [ ] Emit `location:update` with numeric `lat` and `lng`.
- [ ] Omit `recordedAt` for live pings; include the original ISO-8601 timestamp
      only for delayed/offline pings.
- [ ] Process the `location:updated` acknowledgement before marking a point sent.
- [ ] Display `recordedAt` directly; it is already Saudi time (`+03:00`).
- [ ] Do not expect location broadcasts to supervisor clients from this socket.
