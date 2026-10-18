-- Principals table becomes the school's leadership: manager, principal(s), vice principals.
ALTER TABLE website.principals
  ADD COLUMN role text NOT NULL DEFAULT 'principal'
    CHECK (role IN ('manager', 'principal', 'vice_principal')),
  ADD COLUMN message text NOT NULL DEFAULT '',
  ADD COLUMN visible boolean NOT NULL DEFAULT true,
  ADD COLUMN show_on_home boolean NOT NULL DEFAULT true;
