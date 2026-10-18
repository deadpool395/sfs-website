-- All objects are schema-qualified with "website" so nothing lands in "public".

CREATE TABLE website.admin_users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE website.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE website.quick_links (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  url text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE website.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('image', 'pdf')),
  mime text NOT NULL,
  data bytea NOT NULL,
  thumb bytea,
  width int,
  height int,
  bytes int NOT NULL,
  original_bytes int,
  original_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE website.hero_videos (
  id serial PRIMARY KEY,
  youtube_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  is_background boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE website.slides (
  id serial PRIMARY KEY,
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  link_url text,
  visible boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE website.gallery_images (
  id serial PRIMARY KEY,
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  caption text NOT NULL DEFAULT '',
  album text NOT NULL DEFAULT 'General',
  visible boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE website.notifications (
  id serial PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  link_url text,
  link_label text,
  pinned boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE website.calendars (
  id serial PRIMARY KEY,
  title text NOT NULL,
  academic_year text NOT NULL DEFAULT '',
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE website.principals (
  id serial PRIMARY KEY,
  name text NOT NULL,
  designation text NOT NULL DEFAULT 'Principal',
  tenure_from text NOT NULL DEFAULT '',
  tenure_to text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE website.staff (
  id serial PRIMARY KEY,
  name text NOT NULL,
  designation text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT 'General',
  qualification text NOT NULL DEFAULT '',
  media_id uuid REFERENCES website.media(id) ON DELETE SET NULL,
  visible boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE website.session (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX website_session_expire_idx ON website.session (expire);

-- Seed data
INSERT INTO website.settings (key, value) VALUES
  ('school_name', '"St. Francis School, Vadakkencherry"'),
  ('tagline', '"Peace · Love · Service"'),
  ('hero', '{"heading": "Where young minds grow in peace, love and service", "subheading": "A nurturing community committed to academic excellence and strong values since our founding."}'),
  ('hiring', '{"visible": false, "text": "We are hiring! Applications are invited for teaching posts.", "link_url": "", "link_label": "Apply now"}'),
  ('contact', '{"address": "St. Francis School, Vadakkencherry, Palakkad, Kerala", "phones": "", "emails": "", "hours": "Mon – Fri, 9:00 AM – 4:00 PM", "map_embed": "", "facebook": "", "instagram": "", "youtube": ""}'),
  ('principal_message', '{"heading": "From the Principal''s desk", "body": ""}'),
  ('storage', '{"limit_mb": null}');

INSERT INTO website.quick_links (key, label, url, visible, sort) VALUES
  ('parent_login', 'Parent Sign in', 'https://sfsvdy.edisapp.net/Portal/Login?ReturnUrl=https%3A%2F%2Fsfsvdy.edisapp.net%2Fportal', true, 1),
  ('staff_login', 'Staff Sign in', 'https://sfsvdy.edisapp.net/Account/Login?ReturnUrl=https%3A%2F%2Fsfsvdy.edisapp.net%2F', true, 2),
  ('fee_payment', 'Pay Fees', 'https://feebook.southindianbank.bank.in/FeeBookUser/org?id=646', true, 3),
  ('academic_calendar', 'Academic Calendar', '/academic-calendar', true, 4);
