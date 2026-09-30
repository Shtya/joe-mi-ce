CREATE TYPE tracking_event_type AS ENUM (
  'tracking_started',
  'left_geofence',
  'returned_to_geofence',
  'tracking_went_offline',
  'tracking_returned_online',
  'tracking_closed'
);

CREATE TABLE tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "userId" uuid NOT NULL,
  "projectId" uuid,
  "journeyId" uuid,
  "checkInId" uuid,
  "branchId" uuid,
  type tracking_event_type NOT NULL,
  "occurredAt" timestamptz NOT NULL,
  lat decimal(9,6),
  lng decimal(9,6),
  "distanceMeters" integer,
  "previousStatus" varchar,
  "currentStatus" varchar,
  "offlineSince" timestamptz,
  "offlineDurationMinutes" integer
);

CREATE INDEX tracking_events_user_occurred_at_idx ON tracking_events ("userId", "occurredAt");
CREATE INDEX tracking_events_checkin_occurred_at_idx ON tracking_events ("checkInId", "occurredAt");
