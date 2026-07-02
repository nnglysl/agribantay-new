# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgriBantay is an IoT-based poultry manure/environmental monitoring system for the LGU of San Jose, Batangas. It tracks sensor readings (ammonia, temperature, humidity, moisture) for layer-chicken farms and coordinates inspections, service requests, and vaccinations. The repo is split into two independent apps:

- `backend/` — Laravel 12 REST API (PHP 8.2), token auth via Sanctum, MySQL.
- `frontend/` — React 19 SPA (Vite 8, React Router 7, plain axios). Tailwind is *not* wired into the frontend app despite being a backend dev dependency.

The two apps run as separate dev servers; the frontend proxies `/api` and `/sanctum` to the backend (see `frontend/vite.config.js`).

## Commands

Run these from the respective subdirectory.

### backend/
- `composer run dev` — runs server + queue + logs (pail) + a (backend-local) vite concurrently. The API server alone: `php artisan serve` (serves on `http://127.0.0.1:8000`).
- `composer run test` or `php artisan test` — runs the PHPUnit suite (clears config first).
- Run a single test: `php artisan test --filter=SomeTestName` or `php artisan test tests/Feature/ExampleTest.php`.
- `php artisan migrate` / `php artisan migrate:fresh --seed` — build/reset schema and load demo data.
- `php artisan db:seed` — seeds users, farms, sensor readings, service requests, inspections.
- `./vendor/bin/pint` — format PHP (Laravel Pint).
- First-time setup: `composer run setup`.

### frontend/
- `npm run dev` — Vite dev server (default `http://localhost:5173`).
- `npm run build` / `npm run preview`.
- `npm run lint` — ESLint (flat config in `eslint.config.js`).

There is no combined root-level command; start both `backend` (`php artisan serve`) and `frontend` (`npm run dev`) separately during development.

## Architecture

### Authentication & roles
- Login is `POST /api/login` → returns a Sanctum plainText bearer token + user object. All other routes sit behind `auth:sanctum` (`backend/routes/api.php`).
- Three roles live on `users.role`: `admin`, `farm_owner`, `vet`. `users.status` (`active`/`inactive`) gates login.
- Frontend stores `token`, `user`, and `role` in `localStorage` (`frontend/src/utils/auth.js`); `frontend/src/api/axios.js` injects the bearer token on every request. `ProtectedRoute` in `frontend/src/routes/AppRouter.jsx` guards routes by role.
- **The frontend is early-stage**: only `Login` is real; the `/admin`, `/farmowner`, `/vet` dashboards are placeholder "Coming soon" stubs. The backend API is considerably more built out than the UI. See `UI.pdf` (referenced in the initial task) for the intended screens per role.

### Backend API surface
Admin endpoints are namespaced under `/api/admin/*` and map to `app/Http/Controllers/Admin/*`: Dashboard, Farm (CRUD + activate/deactivate), Inspection (list/store/cancel), ServiceRequest (list/cancel), ActivityLog (list), Report. Farm-owner and vet API endpoints are not yet defined in `routes/api.php` even though seed data and the UI mockups cover them — expect to add them.

### Data model (Eloquent, `app/Models/`)
- `User` hasMany implicit via `Farm.user_id`. `full_name` is a computed accessor.
- `Farm` belongsTo `User`; hasMany `PoultryHouse`, `SensorReading`, `ServiceRequest`, `Inspection`.
- `SensorReading` holds the four metrics, each with a paired `*_status` enum (`Normal`/`Warning`/`Critical`), plus `is_mock` (defaults true — readings are currently mocked/seeded, no real hardware ingestion yet).
- `ActivityLog` is written manually inside controllers (e.g. `FarmController` logs Account/Farm actions) with `user_id`, `role`, `action`, `details`, `type`. There is no observer/event layer — if you add a mutating action, write the matching log entry yourself to keep the Activity Logs view complete.
- Auto-provisioning: creating a farm (`FarmController@store`) also creates the owner `User` with a derived email (`first.last@agribantay.gov.ph`) and temp password `'password'`.

### Status field casing gotcha
Status enums are inconsistent between tables. `farms.status` uses title-case (`Active`/`Deactivated`) while `users.status` uses lowercase (`active`/`inactive`), and sensor `*_status` uses title-case. Match the existing casing per model when querying/writing.

### Known landmine — relationship name mismatch
`Farm` (and `PoultryHouse`) define the sensor relationship as `sensorReading()` (singular), but `FarmController` eager-loads/reads `sensorReadings` (plural) in `index()`/`show()`. These will not resolve as written. When touching farm+sensor code, reconcile the relationship name (rename the model method to `sensorReadings()` is the likely fix) rather than assuming the controller works.

## Environment

Backend uses MySQL (`db_agribantay`) via XAMPP by default (`DB_USERNAME=root`, empty password). `SANCTUM_STATEFUL_DOMAINS=localhost:5173` matches the Vite dev origin. Seeded demo accounts all use password `password` (admin `admin@agribantay.gov.ph`, farm owner `ramon@agribantay.gov.ph`, vet `andreareyes@agribantay.gov.ph`).