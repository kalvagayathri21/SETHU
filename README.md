# SETHU — Local services, made simple

SETHU is a responsive React + Vite service marketplace with an Express API and PostgreSQL schema. The frontend keeps sample data available for preview; authenticated changes use the API and database.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL 14+ with permission to enable the `btree_gist` extension

## Run locally

1. Install dependencies with `npm install`.
2. Create a PostgreSQL database named `sethu`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` and a unique `JWT_SECRET` of at least 32 characters.
4. Initialize the schema and sample service categories with `npm run db:setup`.
5. Add repeatable sample listings with `npm run db:seed:samples`.
6. Start the API in one terminal with `npm run dev:api`.
7. Start the frontend in another terminal with `npm run dev`.
8. Open the Vite URL at `http://localhost:5173`. Dashboard routes also work when entered directly:
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

The Vite development server uses port `5173` with strict port enforcement and proxies `/api` and `/uploads` to `http://localhost:3001`. The API allows browser origins `http://localhost:5173` and `http://127.0.0.1:5173`. For a different deployment, set `VITE_API_BASE` at build time and configure cookie security and upload paths for that environment. Do not use the example secrets in production.

## API areas

- Authentication and session: `/api/auth`
- Public categories, provider search and appointment slots: `/api/categories`, `/api/search`, `/api/providers/:id/slots`
- Account profile, services, requests, availability, bookings and reviews: `/api`
- Administrator operations: `/api/admin`

The PostgreSQL schema and exclusion constraints are in `backend/schema.sql`. Running the API or database setup requires an available PostgreSQL service; frontend build and validation tests do not.
