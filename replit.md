# Overview

This is a swimming class scheduling management system called "五泳池課表整合系統" (Five Swimming Pool Schedule Integration System). The application is designed to manage swimming lesson schedules across multiple venues with different user roles (admin, coach, student). It provides comprehensive scheduling capabilities including conflict detection, statistics tracking, and role-based access control.

The system is built as a full-stack web application with a React frontend and Express backend, using PostgreSQL for data persistence and Replit Auth for authentication.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and bundling
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with PostgreSQL session store
- **Authentication**: Replit Auth with OpenID Connect integration
- **API Design**: RESTful endpoints with role-based access control

## Database Design
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Key Tables**:
  - `users` - User accounts with role-based permissions (admin/coach/student)
  - `venues` - Swimming pool locations with color coding (8 venues including 清江國小, 松山國小)
  - `timeSlots` - Available time periods for scheduling
  - `schedules` - Class bookings linking coaches to venues and time slots (coachCount: 1-2, coachName2 for second coach)
  - `coachUsers` - LINE-based coach registration (lineId, name, phone, email, employeeId, status, linkedCoachName)
  - `coach_availability` - Coach weekly availability slots (coachName, weekStart, dayOfWeek 1-7, timeSlotOrder 1-7)
  - `coach_venue_preferences` - Coach venue preferences (coachName, venueName, unique constraint)
  - `sessions` - Authentication session storage (required for Replit Auth)

## Authentication & Authorization
- **Provider**: Replit Auth with OIDC integration
- **Session Storage**: PostgreSQL-backed sessions with connect-pg-simple
- **Role System**: Three-tier access control (admin, coach, student)
- **Security**: HTTP-only cookies with secure flags in production

## Key Features & Business Logic
- **Two-Phase Scheduling (3.0)**:
  - Phase 1 "學校課表編輯": Admin fills in className (class names) only, then locks the venue+week
  - Phase 2 "教練指派": After locking, admin assigns coaches via dropdown selectors
  - `isClassLocked` boolean field on schedules controls lock state per-row
  - Lock/unlock operates on venue+week batch basis
- **Conflict Detection**: Real-time validation to prevent double-booking coaches
- **Multi-Role Interface**: Different views and permissions for admins, coaches, and students
- **Statistics Dashboard**: Class count analytics with venue breakdowns
- **Coach Autocomplete**: Dynamic search functionality for coach assignment
- **Date Navigation**: Week and day-based schedule browsing
- **Coach Portal (2.0)**: Coach selection and personal schedule viewing
  - Select from approved coaches list
  - Personal weekly schedule view (only shows coach's own classes)
  - Today's same-venue colleague info with emergency phone contacts
  - Coach rules display (admin-editable)
  - Venue info with video links
  - Google Calendar export (.ics download + per-event links)
  - Weekly availability matrix (7x7 checkbox grid: Mon-Sun, periods 1-7) with week navigation
  - Assigned slots locked (blue 🔒): cannot uncheck if coach is scheduled for that slot
  - Venue preferences: coaches select which venues they can work at (checkbox grid)
- **Coach Availability Matching**: Availability-aware coach assignment system
  - Coaches fill weekly availability via 7x7 matrix in coach portal
  - Admin coach assignment UI shows available coaches with ✅ markers, grouped separately
  - Missing coach highlighting (red for no coach1, amber for missing coach2)
  - Auto-fill button: assigns coaches based on availability + load balancing (least-assigned-first)
  - Sidebar panel: shows available/assigned coaches for selected time slot with weekly stats
  - Weekly stats: assigned count vs available count per coach
- **Admin Coach Approval (2.0)**: Dashboard for managing coach registrations
  - Approve/reject coach accounts
  - Coach rules editor
  - **Venue management**: Admin can add/delete venues dynamically through UI (no hardcoding)
  - New venues automatically get public URLs (/school/:venueName) and editable info sections
  - Venue info management (video links, descriptions, Google Maps navigation)
  - Password-protected API endpoints (server-side validation)
  - Delete venue cascades: removes related schedules and venue info records
- **Ragic Integration**: Auto-sync department data from Ragic
  - API: `https://ap7.ragic.com/xinsheng/ragicforms4/7` (部門表)
  - API: `https://ap7.ragic.com/xinsheng/general-information/23` (教練表)
  - API: `https://ap7.ragic.com/xinsheng/ragicforms4/20004` (員工表，含個人LINE ID)
  - Auto-sync daily at 03:00 Asia/Taipei + on app startup
  - Syncs: 部門名稱 → venue name, google map → venueInfos.mapUrl
  - **LINE ID sync**: 從員工表單(ragicforms4/20004)的「個人LINE ID」欄位(field 1003633)同步教練 LINE ID，用於推播通知
  - **Employee ID sync**: 從員工表單(ragicforms4/20004)的「員工編號」欄位同步員工編號到 coachUsers.employeeId（僅在欄位為空時補填）
  - Syncs: 教練姓名/手機/Email/員工編號 → coachUsers (only 在職 + 應徵職務含「教練」, auto-approved)
  - Excluded names: "(測試帳號)教練"
  - Only additive: adds new venues, fills empty mapUrl; never deletes or overwrites
  - Coach list sorted: 陳柏榮 always first, then alphabetical
  - Manual sync button in admin dashboard
  - Endpoints: `GET /api/admin/ragic-status`, `POST /api/admin/ragic-sync`
  - File: `server/ragic.ts`

# External Dependencies

## Core Framework Dependencies
- **React Ecosystem**: React 18, React DOM, React Hook Form
- **Build Tools**: Vite, TypeScript, esbuild for production builds
- **Development**: tsx for TypeScript execution, Replit-specific plugins

## UI & Styling
- **Component Library**: Comprehensive shadcn/ui components built on Radix UI
- **Styling**: Tailwind CSS with PostCSS processing
- **Icons**: Lucide React icons, Font Awesome via CDN
- **Fonts**: Google Fonts (Noto Sans TC, DM Sans, Fira Code, Geist Mono)

## Backend Infrastructure
- **Database**: **Persistent PostgreSQL Database** - Dedicated production-ready database instance
  - **Data Persistence**: All data is permanently stored and survives application updates/modifications
  - **Connection**: Managed via Replit's PostgreSQL integration with automatic connection pooling
  - **Security**: Environment variables (DATABASE_URL, PGUSER, PGPASSWORD, etc.) handled securely
- **ORM**: Drizzle ORM with Zod schema validation
- **Authentication**: Replit Auth with passport.js integration
- **Session Management**: connect-pg-simple for PostgreSQL session storage

## Data & State Management
- **Server State**: TanStack React Query for caching and synchronization
- **Validation**: Zod for runtime type checking and schema validation
- **Date Handling**: date-fns for date manipulation and formatting
- **Utilities**: clsx and tailwind-merge for conditional styling

## Development & Deployment
- **Environment**: Replit hosting platform with integrated development tools
- **Error Handling**: Runtime error overlay for development debugging
- **Code Quality**: TypeScript strict mode with comprehensive type checking

# Security & Access Control

## Password Protection
- **Admin Functions**: Course schedule editing and statistics require password authentication
- **Password**: `dream0935314711` (stored in component, session-based authentication)
- **Admin URL Prefix**: `/mgt-x9k7p2/` (complex prefix to prevent URL guessing)
  - Schedule: `/mgt-x9k7p2/schedule`
  - Class Edit (Phase 1): `/mgt-x9k7p2/class-edit`
  - Coach Assignment (Phase 2): `/mgt-x9k7p2/assign`
  - Statistics: `/mgt-x9k7p2/stats`
  - Coach Approval: `/mgt-x9k7p2/approval`
- **Session Management**: Authorization stored in browser sessionStorage, cleared on browser close
- **User Experience**: "Return to Coach View" button available from password screens

## Default Access
- **Default Landing Page**: Coach portal (public access, LINE login)
- **Navigation**: Password-protected functions use complex URLs, separated from public coach view