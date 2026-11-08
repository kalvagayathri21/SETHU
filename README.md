# SETHU — Local services, made simple

SETHU is a responsive React + Vite service marketplace with an Express API and PostgreSQL schema. The frontend keeps sample data available for preview; authenticated changes use the API and database.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL 14+ with permission to enable the `btree_gist` extension

## Run locally

1. Install dependencies with `npm install`.
2. Create a PostgreSQL database named `sethu`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, a unique `JWT_SECRET` of at least 32 characters, and the four `EMAILJS_*` values from your EmailJS service and template. Keep the EmailJS private key only in the backend environment.
4. Initialize the schema and sample service categories with `npm run db:setup`.
5. Add repeatable sample listings with `npm run db:seed:samples`.
6. Start the API in one terminal with `npm run dev:api`.
7. Start the frontend in another terminal with `npm run dev`.
8. Open the Vite URL at `http://localhost:5175`. Dashboard routes also work when entered directly:
   - `/customer-dashboard`
   - `/provider-dashboard`
   - `/business-dashboard`
   - `/admin-dashboard`

Provider accounts require administrator approval before their listings appear publicly or can receive requests. To create the initial administrator, run `npm run admin:create`. The script interactively asks for any missing name, email, phone number and password; password typing is hidden. You can also provide the `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE` and `ADMIN_PASSWORD` environment variables for non-interactive setup. Passwords must be at least 12 characters. Existing email or phone registrations are rejected without changing that account.

## Features

- Responsive SETHU purple-and-white homepage, registration and login.
- Customer dashboard with account profile and request history, public provider search, and appointment requests.
- Explore Services includes clearly labelled sample individual and business providers across all eight customer-facing categories. Sample data is available in the frontend preview and can be seeded into PostgreSQL without modifying real accounts.
- Individual and business provider dashboards for profile, services, requests, availability, bookings and reviews.
- Business team management; staff are not assigned to bookings.
- Admin dashboard for provider verification, categories, users, requests/bookings and complaints.
- Cookie-based API sessions, CSRF protection, role checks and server-side validation.

Unauthenticated dashboard visits show sample data. Registration and login require the API and PostgreSQL to be running; no demo credentials are included.

Customer and provider registration sends a six-digit, five-minute email verification code through EmailJS. Registration data remains in an expiring pending-registration record, with the password bcrypt-hashed and OTP stored only as a keyed hash; the user account is created only when the code is verified. Existing customer and provider accounts continue to use email verification; admin and sample accounts remain exempt. Verification is limited to five attempts, and resends are limited to three per 15 minutes with a 30-second cooldown. The backend exposes `/api/auth/send-otp`, `/api/auth/resend-otp`, and `/api/auth/verify-otp`; registration sends the initial code automatically. Run `npm run db:setup` after updating to create the pending-registration table. Applying the schema does not delete or rewrite user records.

## Scripts

- `npm run dev` — Vite frontend.
- `npm run dev:api` — API with Node watch mode.
- `npm run build` — production frontend build.
- `npm run preview` — preview the production build.
- `npm run start:api` — start the API without watch mode.
- `npm run db:setup` — create database tables and seed service categories.
- `npm run db:seed:samples` — idempotently add sample provider listings, availability and sample review ratings; refuses account identity conflicts.
- `npm run admin:create` — create an admin account; prompts for missing values and never updates an existing account.
- `npm test` — run backend validation tests.

The Vite development server uses port `5175` with strict port enforcement and proxies `/api` and `/uploads` to `http://localhost:3001`.

## Deploy on Render with Neon

Create a Render Web Service for the API and a Render Static Site for the frontend. No `render.yaml` is required; configure each service in the Render dashboard.

1. In Neon, create a PostgreSQL database and copy its connection string. Set `DATABASE_URL` on the API to the connection string (use Neon SSL, typically `?sslmode=require`) and set `PGSSL=true`. For a one-time schema initialization, configure the same `DATABASE_URL` locally and run `npm run db:setup`. This executes `backend/schema.sql` and preserves existing user records.
2. Configure the API Web Service with build command `npm ci` and start command `npm run start:api`. Set `NODE_ENV=production`, `JWT_SECRET` (unique random value of at least 32 characters), `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `DATABASE_URL`, `PGSSL=true`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and `CORS_ORIGIN` to the exact deployed frontend origin (for example `https://your-frontend.onrender.com`, without a trailing slash). Render supplies `PORT`; the API listens on it and binds to `0.0.0.0`.
3. Configure the Static Site with build command `npm ci && npm run build` and publish directory `dist`. Add a rewrite rule from `/*` to `/index.html` with status `200` so client-side routes load directly. Set the build-time variable `VITE_API_BASE` to the API URL ending in `/api` (for example `https://your-api.onrender.com/api`). Rebuild the static site after changing it.
4. Do not place EmailJS private credentials in any `VITE_*` variable. Render Free local files are not durable storage; user/provider uploads can be lost when the service restarts or redeploys. Use durable object storage before relying on uploaded files in production.

For cookie-based sessions, configure the frontend and API on the same site (the default Render `onrender.com` hostnames are same-site) and keep `COOKIE_SECURE=true` in production. Set `CORS_ORIGIN` to the frontend origin, not the API URL.

## API areas

- Authentication and session: `/api/auth`
- Public categories, provider search and appointment slots: `/api/categories`, `/api/search`, `/api/providers/:id/slots`
- Account profile, services, requests, availability, bookings and reviews: `/api`
- Administrator operations: `/api/admin`

The PostgreSQL schema and exclusion constraints are in `backend/schema.sql`. Running the API or database setup requires an available PostgreSQL service; frontend build and validation tests do not.
