# Overview

This project is a swimming class scheduling management system, "五泳池課表整合系統" (Five Swimming Pool Schedule Integration System), designed to efficiently manage swimming lesson schedules across multiple venues. It supports various user roles (admin, coach, student) and offers features like conflict detection, statistics, and role-based access control. The system aims to streamline scheduling operations, improve coach and student management, and enhance overall operational efficiency for swimming class providers.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
-   **Framework**: React 18 with TypeScript
-   **Build Tool**: Vite
-   **UI Components**: shadcn/ui (Radix UI-based)
-   **Styling**: Tailwind CSS
-   **State Management**: TanStack Query
-   **Routing**: Wouter
-   **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
-   **Runtime**: Node.js with Express.js
-   **Language**: TypeScript (ES modules)
-   **Database ORM**: Drizzle ORM
-   **Session Management**: Express sessions with PostgreSQL store
-   **Authentication**: Replit Auth (OpenID Connect)
-   **API Design**: RESTful with role-based access control
-   **Module Structure**: Modular design separating routes, features, and shared utilities.

## Database Design
-   **Primary Database**: PostgreSQL (Neon serverless driver)
-   **Schema Management**: Drizzle Kit
-   **Key Tables**: `users`, `venues`, `timeSlots`, `schedules`, `coachUsers`, `coach_availability`, `coach_venue_preferences`, `sessions`.

## Authentication & Authorization
-   **Provider**: Replit Auth
-   **Session Storage**: PostgreSQL-backed sessions
-   **Role System**: Admin, Coach, Student
-   **Security**: HTTP-only cookies

## Key Features & Business Logic
-   **Two-Phase Scheduling**: Admin first fills class names and locks venue+week, then assigns coaches. Includes `isClassLocked` for control.
-   **Coach2 Teaching Flag**: Allows distinguishing between teaching and assisting coaches for statistics.
-   **Conflict Detection**: Prevents double-booking.
-   **Multi-Role Interface**: Tailored views and permissions.
-   **Statistics Dashboard**: Class count analytics.
-   **Coach Portal**: Coaches can view personal schedules, manage availability (7x7 matrix), set venue preferences, and access colleague/venue info.
-   **Coach Availability Matching**: Admin UI assists coach assignment based on availability and preferences, including auto-fill and conflict highlighting.
-   **Admin Coach Approval**: Dashboard for managing coach registrations, including LINE ID binding and approval status.
-   **Venue Management**: Admin UI for adding, deleting, and managing venue information, including public URLs and video links.
-   **Ragic Integration**: Automatic daily synchronization of department and coach data (including LINE IDs and employee IDs) from Ragic APIs, with specific exclusion rules and manual sync option.
-   **Weekly LINE Push (pg-boss queue)** — Task #23: Stabilized weekly push pipeline backed by pg-boss with run/recipient persistence (`weeklyPushRuns`, `weeklyPushRecipients`), Healthchecks.io watchdog, CSV reports persisted to Replit Object Storage at `${PRIVATE_OBJECT_DIR}/weekly-push-reports/<runId>.csv` (Task #27 — `report_path` stored as `objstore://...` URI; legacy `/tmp` paths still readable as a transition fallback; 90-day retention policy, cleanup is a manual/follow-up job), dry-run mode, idempotency on (pushType, week) for `queued|running|success`, and pg-boss native retries (`retryLimit:3, retryDelay:60, backoff`) for transient LINE failures. 5 admin endpoints under `/api/admin/weekly-push/*` all gated by `requireAdminPassword`. Three feature flags (`ENABLE_WEEKLY_PUSH_QUEUE`, `ENABLE_WEEKLY_PUSH_WORKER`, default OFF). Production cron only registers when `HEALTHCHECKS_WEEKLY_PUSH_URL` and `LINE_IT_GROUP_ID` are set; dev never auto-pushes. Legacy weekly node-cron is suppressed when the queue is enabled; daily 19:00 cron unchanged. Smoke: `npx tsx scripts/smoke-weekly-push.ts`.

## Security & Access Control
-   **Password Protection**: Admin functions are protected by an `ADMIN_PASSWORD` environment variable, with sensitive operations accessed via complex, password-protected URLs. `apiRequest` / `getQueryFn` in `client/src/lib/queryClient.ts` auto-inject `x-admin-password` from `sessionStorage("admin-password")`.
-   **Session Management**: Authorization stored in browser `sessionStorage`.
-   **Default Access**: Coach portal is the public default landing page.
-   **Coach Portal Session Tokens (Task #30)**: `/api/coach-portal/me/:identifier` is gated by a 30-day in-memory session token (`server/shared/auth/coachPortalSession.ts`) issued on successful LINE OAuth / link / register; sent as `x-coach-token` header. 403 with `code:"session_expired"` triggers frontend re-login.
-   **Teacher Portal Token (Task #30)**: `/api/:schoolCode/feedbacks` (GET+POST) gated by `requireTeacherPortalAuth` — accepts admin password OR `TEACHER_PORTAL_TOKEN` env var (header `x-teacher-portal-token` or `?token=`). Dev: warn-and-pass when unset. Prod deployment: 503 if unset. Teachers receive tokenized URLs from admins.

# External Dependencies

## Core Framework Dependencies
-   **React Ecosystem**: React, React DOM, React Hook Form
-   **Build Tools**: Vite, TypeScript, esbuild
-   **Development**: tsx

## UI & Styling
-   **Component Library**: shadcn/ui (Radix UI)
-   **Styling**: Tailwind CSS, PostCSS
-   **Icons**: Lucide React, Font Awesome
-   **Fonts**: Google Fonts (Noto Sans TC, DM Sans, Fira Code, Geist Mono)

## Backend Infrastructure
-   **Database**: Persistent PostgreSQL Database (via Replit's integration)
-   **ORM**: Drizzle ORM
-   **Authentication**: Replit Auth with passport.js
-   **Session Management**: connect-pg-simple

## Data & State Management
-   **Server State**: TanStack React Query
-   **Validation**: Zod
-   **Date Handling**: date-fns
-   **Utilities**: clsx, tailwind-merge

## Development & Deployment
-   **Environment**: Replit hosting platform
-   **Code Quality**: TypeScript strict mode
-   **Dependency Hygiene (Task #31)**: Removed 10 unused packages (`@hookform/resolvers`, `google-auth-library`, `memorystore`, `passport-local`, `react-icons`, `sql`, `tw-animate-css`, `zod-validation-error`, `@jridgewell/trace-mapping`, `@types/passport-local`). `npm audit fix` (non-breaking) applied. Upgraded `drizzle-orm` 0.39 → 0.45.2 + `drizzle-kit` 0.31.10 to remediate **high-severity SQL injection advisory GHSA-gpj5-g38j-94v9** (kept `drizzle-zod` at 0.7.1 + `zod` at 3.24.2 because newer `drizzle-zod`/`zod 3.25` change `ZodObject` generics in a way the existing `z.infer` types in `shared/schema.ts` don't satisfy). Schema drift exposed by stricter drizzle 0.45 column projection fixed in `server/multi-school-db.ts` (added `coach_count` + `is_class_locked` to per-school `ALTER TABLE` migration block). Final `npm audit`: 14 advisories, 0 high other than xlsx. **Documented residual advisories**: (1) `xlsx` high (Prototype Pollution + ReDoS, no upstream fix; kept for coach-list export in `client/src/pages/coach-approval.tsx`, attack surface limited to admin-only internal data — see follow-up Task #36 to swap to `exceljs`); (2) `vite` / `@vitejs/plugin-react` / `esbuild` moderate (dev-server path traversal — dev-only, requires Vite 8 breaking upgrade; deferred); (3) `@google-cloud/storage` 7.x → `gaxios` → `uuid` moderate transitive (auto-fix wants to downgrade to 5.20.4 which loses features; see follow-up Task #37 for forward-upgrade path). `npx update-browserslist-db@latest` run.