# CampusAlly - EdTech Sales OS

## Overview

CampusAlly is a full-stack web application designed as a sales operations tool for EdTech professionals. It helps sales reps manage campus territories by tracking instructors, courses, campus visits, and office hours. The app provides a dashboard with analytics, instructor/course management, visit logging with voice dictation and audio recording, and a visit planner with calendar integration.

The project follows a monorepo structure with a React frontend (`client/`), Express backend (`server/`), and shared types/schemas (`shared/`).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Directory Structure
- `client/` — React SPA (Vite-powered)
- `server/` — Express API server
- `server/scraper/` — Python-based web scraper (Crawl4AI)
- `shared/` — Shared schemas, types, and API contract definitions
- `migrations/` — Drizzle-generated database migrations
- `script/` — Build scripts

### Frontend Architecture
- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state; no global client state library
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support), custom fonts (Plus Jakarta Sans for display, Inter for body)
- **Forms**: React Hook Form with Zod resolvers for validation
- **Key Features**: Voice dictation (Web Speech API), audio recording (MediaRecorder API), calendar-based visit planning
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js running on Node with TypeScript (via tsx)
- **API Pattern**: RESTful endpoints following the contract defined in `shared/routes.ts`
- **API Contract**: Centralized API definitions in `shared/routes.ts` using Zod schemas — both input validation and response types are defined here
- **Authentication**: Replit Auth via OpenID Connect (OIDC) with Passport.js, session-based auth stored in PostgreSQL via `connect-pg-simple`
- **Auth files are in**: `server/replit_integrations/auth/` — these are critical and should not be deleted
- **Build**: Custom build script (`script/build.ts`) uses esbuild for server and Vite for client; outputs to `dist/`

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with `drizzle-zod` for automatic Zod schema generation from table definitions
- **Schema Location**: `shared/schema.ts` (main tables) and `shared/models/auth.ts` (auth tables)
- **Schema Push**: `npm run db:push` uses drizzle-kit to push schema changes directly to the database

### Database Tables
- `instructors` — Name, email, department, institution, office location, bio, notes, target priority
- `courses` — Code, name, term, format, enrollment, linked to instructor; also stores lecture schedule (daysOfWeek, lectureStartTime, lectureEndTime, building, room)
- `office_hours` — Day of week, start/end time, location, virtual flag, linked to instructor
- `visits` — Date, location, notes, linked to user (sales rep)
- `visit_interactions` — Interactions during visits (linked to visits)
- `planned_meetings` — Date, start/end time, instructor, location, purpose, status, meetingType (scheduled/drop_in), notes, linked to user
- `deals` — HubSpot deal data: hubspotDealId, dealName, stage, amount, closeDate, pipeline, linked to instructor; synced from HubSpot CRM
- `sessions` — Session storage for Replit Auth (mandatory, do not drop)
- `users` — User storage for Replit Auth (mandatory, do not drop)

### Key Components
- `client/src/components/csv-import.tsx` — Reusable CSV import dialog (parses CSV, column mapping, preview, bulk upload)
- `client/src/components/voice-dictation.tsx` — Voice dictation using Web Speech API
- `client/src/components/audio-recorder.tsx` — Audio recording using MediaRecorder API

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface and `DatabaseStorage` implementation
- All database operations go through the storage layer, making it easy to swap implementations

### Key Development Commands
- `npm run dev` — Start development server with HMR
- `npm run build` — Build for production
- `npm run start` — Run production build
- `npm run db:push` — Push schema changes to database
- `npm run check` — TypeScript type checking

## External Dependencies

### Database
- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable
- **Drizzle ORM** — Query builder and schema management
- **connect-pg-simple** — PostgreSQL session store for Express sessions

### Authentication
- **Replit Auth** — OpenID Connect authentication via Replit's OIDC provider
- **Passport.js** — Authentication middleware with OIDC strategy
- **express-session** — Session management
- Required env vars: `DATABASE_URL`, `SESSION_SECRET`, `ISSUER_URL` (defaults to Replit OIDC), `REPL_ID`

### Frontend Libraries
- **@tanstack/react-query** — Server state management and caching
- **shadcn/ui + Radix UI** — Full component library (accordion, dialog, select, tabs, toast, etc.)
- **Tailwind CSS** — Utility-first CSS framework
- **react-hook-form + @hookform/resolvers** — Form management with Zod validation
- **wouter** — Client-side routing
- **date-fns** — Date formatting
- **react-day-picker** — Calendar component
- **recharts** — Dashboard charts
- **lucide-react** — Icon library
- **vaul** — Drawer component
- **embla-carousel-react** — Carousel component
- **cmdk** — Command palette

### HubSpot CRM Integration
- **Service file**: `server/hubspot.ts` — HubSpot API client for syncing contacts and deals
- **Integration**: Connected via Replit native HubSpot connector (OAuth-based, auto-refreshing tokens)
- **Sync scope**: Purdue and Indiana University Bloomington companies
- **Contact matching**: By email address — matches HubSpot contacts to existing instructors, creates new instructors for unmatched contacts
- **Institution override**: HubSpot company name overrides the instructor's institution field on sync
- **Deal import**: Fetches deals associated with matched contacts, stores in `deals` table linked to instructors
- **API endpoints**: `POST /api/hubspot/sync`, `GET /api/deals`, `GET /api/hubspot/deal-stages`
- **UI**: "Sync HubSpot" button on Faculty & Courses page, deal pipeline card on Dashboard, deal badges on instructor rows and planner meetings

### Packback Web Scraper (Crawl4AI)
- **Scraper file**: `server/scraper/packback_scraper.py` — Python script using Crawl4AI to find faculty who use Packback
- **Runtime**: Python 3.11 with crawl4ai pip package and Playwright/Chromium for headless browsing
- **How it works**: The Node.js backend spawns the Python script via `child_process.execFile`, passes CLI args for URLs and institution filter, and parses the JSON output
- **Default targets**: Packback.co case studies and resources pages; custom URLs can be provided via the UI
- **API endpoint**: `POST /api/scrape/packback` — accepts `{ urls?: string[], institution?: string }`, returns `{ created, updated, existing, total_found, urls_scraped }`
- **Import flow**: Scraped faculty are fed through the existing `bulkCreateInstructors` upsert logic (same as CSV import — fills empty fields, avoids duplicates by name)
- **Institution filter**: Can filter results by "purdue", "indiana", or "all" (default)
- **UI**: "Scrape Packback" button on Faculty & Courses page opens a dialog with institution filter and optional custom URLs
- **Timeout**: 2 minutes max for the scraping subprocess

### Build Tools
- **Vite** — Frontend bundler with React plugin and HMR
- **esbuild** — Server-side bundling for production
- **tsx** — TypeScript execution for development
- **@replit/vite-plugin-runtime-error-modal** — Error overlay for development