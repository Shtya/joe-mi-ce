INSERT INTO permissions (name, description)
VALUES
  (
    'LOCATION_TRACKING_READ_USER',
    'View another user''s tracking history in the same project'
  ),
  (
    'LOCATION_TRACKING_READ_PROJECT',
    'View all tracking history in the current project'
  )
ON CONFLICT (name) DO NOTHING;
