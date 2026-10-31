CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'INDIVIDUAL_PROVIDER', 'BUSINESS_PROVIDER', 'ADMIN')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  pin_code CHAR(6) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS provider_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('INDIVIDUAL', 'BUSINESS')),
  description TEXT NOT NULL DEFAULT '',
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 80),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  verification_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  logo_path TEXT,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  pin_code CHAR(6) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS provider_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_categories (
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES service_categories(id),
  PRIMARY KEY (provider_id, category_id)
);

CREATE TABLE IF NOT EXISTS provider_service_areas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  locality TEXT NOT NULL,
  pin_code CHAR(6) NOT NULL CHECK (pin_code ~ '^[0-9]{6}$'),
  UNIQUE (provider_id, city, locality, pin_code)
);

CREATE TABLE IF NOT EXISTS services (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES service_categories(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT NOT NULL,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('FIXED', 'RANGE')),
  price_min NUMERIC(10,2) NOT NULL CHECK (price_min > 0),
  price_max NUMERIC(10,2),
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 1440),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((pricing_type = 'FIXED' AND price_max IS NULL) OR
         (pricing_type = 'RANGE' AND price_max IS NOT NULL AND price_max >= price_min))
);

CREATE TABLE IF NOT EXISTS service_areas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  locality TEXT NOT NULL,
  pin_code CHAR(6) NOT NULL CHECK (pin_code ~ '^[0-9]{6}$'),
  UNIQUE (service_id, city, locality, pin_code)
);

CREATE TABLE IF NOT EXISTS provider_availability (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  appointment_minutes INTEGER NOT NULL DEFAULT 60 CHECK (appointment_minutes BETWEEN 15 AND 480),
  CHECK (end_time > start_time),
  UNIQUE (provider_id, weekday)
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (provider_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);

CREATE TABLE IF NOT EXISTS service_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  city TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  pin_code CHAR(6) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('URGENT', 'SCHEDULED')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_key TEXT UNIQUE,
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (provider_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS'))
);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS sample_key TEXT UNIQUE;

UPDATE users AS u
SET is_sample = true
WHERE u.is_sample = false
  AND (
    (
      u.role IN ('INDIVIDUAL_PROVIDER', 'BUSINESS_PROVIDER')
      AND left(u.email, 7) = 'sample-'
      AND right(u.email, length('@demo.sethu.invalid')) = '@demo.sethu.invalid'
      AND EXISTS (
        SELECT 1
        FROM service_requests AS sr
        WHERE sr.provider_id = u.id
          AND sr.sample_key LIKE 'sample-provider-review:%'
      )
    )
    OR (
      u.role = 'CUSTOMER'
      AND u.email = 'sample-customer@demo.sethu.invalid'
      AND EXISTS (
        SELECT 1
        FROM service_requests AS sr
        WHERE sr.customer_id = u.id
          AND sr.sample_key LIKE 'sample-provider-review:%'
      )
    )
  );

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (provider_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('CONFIRMED', 'IN_PROGRESS'))
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  changed_by BIGINT NOT NULL REFERENCES users(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 2 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id BIGINT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  review_id BIGINT REFERENCES reviews(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  resolution TEXT,
  resolved_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  provider_id BIGINT NOT NULL REFERENCES provider_profiles(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_staff (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES business_profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, email)
);

CREATE INDEX IF NOT EXISTS services_provider_active_idx ON services(provider_id, active);
CREATE INDEX IF NOT EXISTS services_category_idx ON services(category_id) WHERE active;
CREATE INDEX IF NOT EXISTS service_areas_pin_idx ON service_areas(pin_code);
CREATE INDEX IF NOT EXISTS service_areas_location_idx ON service_areas(city, locality);
CREATE INDEX IF NOT EXISTS provider_areas_pin_idx ON provider_service_areas(pin_code);
CREATE INDEX IF NOT EXISTS requests_customer_created_idx ON service_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_provider_status_idx ON service_requests(provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_expiry_idx ON service_requests(expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings(customer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS bookings_provider_idx ON bookings(provider_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS provider_verification_idx ON provider_profiles(verification_status, created_at);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints(status, created_at DESC);

INSERT INTO service_categories (name, slug) VALUES
  ('Plumbing', 'plumbing'),
  ('Electrical', 'electrical'),
  ('Home Repairs', 'home-repairs'),
  ('Appliance Repair', 'appliance-repair'),
  ('AC Repair', 'ac-repair'),
  ('Cleaning', 'cleaning'),
  ('Home repairs', 'home-repairs-lowercase'),
  ('Electricians', 'electricians'),
  ('Vehicle care', 'vehicle-care'),
  ('AC services', 'ac-services'),
  ('Beauty & wellness', 'beauty-wellness'),
  ('Vehicle Services', 'vehicle-services'),
  ('Beauty and Personal Care', 'beauty-personal-care'),
  ('Painting', 'painting'),
  ('Carpentry', 'carpentry'),
  ('Pest Control', 'pest-control'),
  ('Other Local Services', 'other-local-services')
ON CONFLICT (slug) DO NOTHING;
