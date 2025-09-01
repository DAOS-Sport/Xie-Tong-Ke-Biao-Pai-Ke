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
  - `venues` - Swimming pool locations with color coding
  - `timeSlots` - Available time periods for scheduling
  - `schedules` - Class bookings linking coaches to venues and time slots
  - `sessions` - Authentication session storage (required for Replit Auth)

## Authentication & Authorization
- **Provider**: Replit Auth with OIDC integration
- **Session Storage**: PostgreSQL-backed sessions with connect-pg-simple
- **Role System**: Three-tier access control (admin, coach, student)
- **Security**: HTTP-only cookies with secure flags in production

## Key Features & Business Logic
- **Schedule Management**: Create, update, and delete swimming class schedules
- **Conflict Detection**: Real-time validation to prevent double-booking coaches
- **Multi-Role Interface**: Different views and permissions for admins, coaches, and students
- **Statistics Dashboard**: Class count analytics with venue breakdowns
- **Coach Autocomplete**: Dynamic search functionality for coach assignment
- **Date Navigation**: Week and day-based schedule browsing

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
- **Password**: `dream28559983` (stored in component, session-based authentication)
- **Session Management**: Authorization stored in browser sessionStorage, cleared on browser close
- **User Experience**: "Return to Coach View" button available from password screens

## Default Access
- **Default Landing Page**: Coach view (public access)
- **Navigation**: Password-protected functions clearly separated from public coach view