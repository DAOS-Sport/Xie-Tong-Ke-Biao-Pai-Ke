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
-   **Weekly LINE Push (pg-boss queue)** — Task #23: Stabilized weekly push pipeline backed by pg-boss with run/recipient persistence (`weeklyPushRuns`, `weeklyPushRecipients`), Healthchecks.io watchdog, CSV reports under `/tmp/weekly-push-reports/`, dry-run mode, idempotency on (pushType, week) for `queued|running|success`, and pg-boss native retries (`retryLimit:3, retryDelay:60, backoff`) for transient LINE failures. 5 admin endpoints under `/api/admin/weekly-push/*` all gated by `requireAdminPassword`. Three feature flags (`ENABLE_WEEKLY_PUSH_QUEUE`, `ENABLE_WEEKLY_PUSH_WORKER`, default OFF). Production cron only registers when `HEALTHCHECKS_WEEKLY_PUSH_URL` and `LINE_IT_GROUP_ID` are set; dev never auto-pushes. Legacy weekly node-cron is suppressed when the queue is enabled; daily 19:00 cron unchanged. Smoke: `npx tsx scripts/smoke-weekly-push.ts`.

## Security & Access Control
-   **Password Protection**: Admin functions are protected by an `ADMIN_PASSWORD` environment variable, with sensitive operations accessed via complex, password-protected URLs.
-   **Session Management**: Authorization stored in browser `sessionStorage`.
-   **Default Access**: Coach portal is the public default landing page.

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