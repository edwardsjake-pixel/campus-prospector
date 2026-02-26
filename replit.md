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
- **Key Features**: Voice dictation (Web Speech API), audio recording (MediaRecorder API), calendar-based visit planning, AI-powered schedule photo extraction (OpenAI GPT-5.2 vision)
- **Mobile Responsiveness**: All data-heavy pages (instructors, courses, availability, planner) use `overflow-x-auto` table wrappers, responsive column hiding (`hidden md:table-cell`), sticky instructor name columns on availability/planner grids, stacking filter bars on mobile, and minimum 44px touch targets
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js running on Node with TypeScript (via tsx)
- **API Pattern**: RESTful endpoints following the contract defined in `shared/routes.ts`
- **API Contract**: Centralized API definitions in `shared/routes.ts` using Zod schemas — both input validation and response types are defined here
- **Authentication**: Replit Auth via OpenID Connect (OIDC) with Passport.js, session-based auth stored in PostgreSQL via `connect-pg-simple`
- **Data Access**: All read endpoints (instructors, courses, deals, planned meetings, visits, availability) are open to all users without auth. Write operations (create visit, create meeting) require authentication to set the userId. This is intentional — data is shared across all users for now.
- **Auth files are in**: `server/replit_integrations/auth/` — these are critical and should not be deleted
- **Build**: Custom build script (`script/build.ts`) uses esbuild for server and Vite for client; outputs to `dist/`
- **SIGHUP handling**: The server ignores SIGHUP signals (`process.on("SIGHUP", () => {})`) to prevent the Replit environment's delayed SIGHUP from killing the process ~25s after startup
- **Lazy imports**: HubSpot (`./hubspot`) and schedule extractor (`./schedule-extractor`) modules are lazy-imported in route handlers to reduce startup memory usage

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with `drizzle-zod` for automatic Zod schema generation from table definitions
- **Schema Location**: `shared/schema.ts` (main tables) and `shared/models/auth.ts` (auth tables)
- **Schema Push**: `npm run db:push` uses drizzle-kit to push schema changes directly to the database

### Data Model Hierarchy

The data model follows a proper relational hierarchy:

```
Institutions → Departments → Instructors (via departmentId FK)
                           → Courses (via departmentId FK)
Instructors ↔ Courses (many-to-many via course_instructors join table)
Instructors → Office Hours (via instructorId FK)
Instructors → Deals (via instructorId FK, optional courseId FK)
Instructors → Planned Meetings (via instructorId FK)
```

### Database Tables
- `institutions` — R1/R2 Carnegie Classification universities: id, name (unique), city, state, control (Public/Private), classification (R1/R2), domain (.edu domain); seeded from `shared/data/institutions.json` on startup (326 entries)
- `departments` — id, name, institutionId (FK to institutions); represents academic departments within an institution
- `instructors` — id, name (unique), email, departmentId (FK to departments, nullable), officeLocation, bio, notes, targetPriority, createdAt
- `courses` — id, code, name, term, format, enrollment, departmentId (FK to departments, nullable), daysOfWeek, lectureStartTime, lectureEndTime, building, room
- `course_instructors` — id, courseId (FK to courses), instructorId (FK to instructors), role (default "primary"); many-to-many join table
- `office_hours` — Day of week, start/end time, location, virtual flag, linked to instructor via instructorId FK
- `visits` — Date, location, notes, linked to user (sales rep) via userId
- `visit_interactions` — Interactions during visits (linked to visits via visitId, and instructors via instructorId)
- `planned_meetings` — Date, start/end time, instructor, location, purpose, status, meetingType (scheduled/drop_in), notes, linked to user and instructor
- `deals` — HubSpot deal data: hubspotDealId, dealName, stage, amount, closeDate, pipeline, linked to instructor (instructorId FK) and optionally course (courseId FK); synced from HubSpot CRM
- `sessions` — Session storage for Replit Auth (mandatory, do not drop)
- `users` — User storage for Replit Auth (mandatory, do not drop)

### Key Types
- `InstructorWithDetails` — Returned by `getInstructors()`: includes `department: DepartmentWithInstitution | null` (where `DepartmentWithInstitution` has `institution: Institution`), `courses: Course[]`, `officeHours: OfficeHour[]`
- `DepartmentWithInstitution` — Department object with nested `institution: Institution`
- Frontend accesses institution name via `instructor.department?.institution?.name` and department name via `instructor.department?.name`

### Key Components
- `client/src/components/csv-import.tsx` — Reusable CSV import dialog (parses CSV, column mapping, preview, bulk upload)
- `client/src/components/voice-dictation.tsx` — Voice dictation using Web Speech API
- `client/src/components/audio-recorder.tsx` — Audio recording using MediaRecorder API
- `client/src/components/schedule-photo-capture.tsx` — Photo capture with AI schedule extraction (GPT-5.2 vision)
- `client/src/components/instructor-detail-popover.tsx` — Instructor detail toggle with optional HubSpot link

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface and `DatabaseStorage` implementation
- All database operations go through the storage layer, making it easy to swap implementations
- Key methods: `getDepartments()`, `findOrCreateDepartment()`, `getInstructors()` (returns InstructorWithDetails with department/institution joins), `bulkCreateInstructors()` (accepts `institutionName`/`departmentName` to auto-create hierarchy), `addCourseInstructor()`, `removeCourseInstructorsForInstructor()`

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
- **Sync scope**: Dynamic — syncs all institutions that have instructors in the database (via `GET /api/institutions/active`). Falls back to Purdue + IU Bloomington if no active institutions.
- **Contact matching**: By email address — matches HubSpot contacts to existing instructors, creates new instructors for unmatched contacts
- **Department/Institution handling**: HubSpot company name is used to find or create institution + department via `findOrCreateDepartment()`
- **Deal import**: Fetches deals associated with matched contacts, stores in `deals` table linked to instructors (and optionally courses via courseId)
- **API endpoints**: `POST /api/hubspot/sync` (accepts `companyNames: string[]`), `POST /api/hubspot/import-preview` (accepts `companyNames` or `school`), `POST /api/hubspot/search-contacts`, `GET /api/deals`, `GET /api/hubspot/deal-stages`, `GET /api/institutions/active`
- **UI**: "Sync HubSpot" button on Faculty & Courses page (syncs all active institutions), "Import from HubSpot" dialog with searchable multi-institution picker (all 326 R1/R2 universities), deal pipeline card on Dashboard, deal badges on instructor rows and planner meetings
- **HubSpot contact links**: Instructors with deals show a clickable HubSpot icon (SiHubspot from react-icons/si) that opens `https://app.hubspot.com/contacts/search?query={email}` in a new tab. Shown on instructors page, availability page, and planner page via InstructorDetailToggle component.

### AI Schedule Photo Extraction
- **Service file**: `server/schedule-extractor.ts` — OpenAI GPT-5.2 vision API client for extracting schedule data from photos
- **Integration**: Uses Replit AI Integrations (OpenAI) — `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` env vars
- **API endpoints**: `POST /api/schedule/extract-from-photo` (accepts `{ image: base64, instructorId? }`), `POST /api/schedule/save-extracted` (accepts `{ instructorId, entries[] }`)
- **UI**: "Scan Schedule" button on Availability page opens camera/file picker, sends photo to AI, shows editable confirmation dialog, saves as office hours
- **Component**: `client/src/components/schedule-photo-capture.tsx`

### Packback Web Scraper (Crawl4AI)
- **Scraper file**: `server/scraper/packback_scraper.py` — Python script using Crawl4AI to find faculty who use Packback
- **Runtime**: Python 3.11 with crawl4ai pip package and Playwright/Chromium for headless browsing
- **How it works**: Uses Google site-search (e.g., `site:purdue.edu packback syllabus`) to discover university pages (syllabi, course pages) that mention Packback. Extracts instructor names and course codes from URL paths (e.g., `~drkelly/KellySyllabusPHIL293SP25.pdf` → Kelly, PHIL 293) and page content. HTML pages are crawled; PDF URLs are parsed from their path structure.
- **Institution targeting**: Accepts any university domain from the institutions table (326 R1/R2 universities). Default: searches purdue.edu + indiana.edu. CLI: `--domain purdue.edu --institution-name "Purdue University"` or legacy `--institution purdue|indiana`
- **API endpoint**: `POST /api/scrape/packback` — accepts `{ urls?: string[], domain?: string, institutionName?: string }`, returns `{ created, updated, existing, total_found, urls_scraped }`
- **Institutions API**: `GET /api/institutions` — returns all 326 R1/R2 universities with filters: `?classification=R1&state=CA&search=stanford`
- **Institutions data**: `shared/data/institutions.json` — 326 R1/R2 Carnegie Classification universities (187 R1, 139 R2) with name, city, state, control, classification, domain
- **Import flow**: Scraped faculty are fed through the existing `bulkCreateInstructors` upsert logic (same as CSV import — uses `institutionName`/`departmentName` to auto-create institution/department hierarchy). Course info stored in bio field.
- **UI**: "Find Packback Users" button on Faculty & Courses page opens a dialog with searchable institution picker (all 326 universities) and optional custom URLs
- **Timeout**: 2 minutes max for the scraping subprocess

### Build Tools
- **Vite** — Frontend bundler with React plugin and HMR
- **esbuild** — Server-side bundling for production
- **tsx** — TypeScript execution for development
- **@replit/vite-plugin-runtime-error-modal** — Error overlay for development
