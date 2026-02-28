# CampusAlly - EdTech Sales OS

## Overview

CampusAlly is a full-stack web application designed as a sales operations tool for EdTech professionals. It enables sales representatives to efficiently manage campus territories by tracking instructors, courses, campus visits, and office hours. The application provides a comprehensive dashboard with analytics, tools for instructor and course management, visit logging capabilities including voice dictation and audio recording, and a visit planner with calendar integration. The project aims to streamline sales workflows and enhance productivity for EdTech sales teams.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

CampusAlly is structured as a monorepo, separating the React frontend (`client/`), Express backend (`server/`), and shared definitions (`shared/`).

### Frontend
- **Framework**: React with TypeScript and Vite.
- **Routing**: Wouter for client-side navigation.
- **State Management**: TanStack React Query handles server state; no global client state library.
- **UI/UX**: `shadcn/ui` (new-york style) built on Radix UI and styled with Tailwind CSS, utilizing CSS variables for theming (light/dark mode). Custom fonts (Plus Jakarta Sans, Inter) are used.
- **Forms**: React Hook Form with Zod for validation.
- **Key Features**: Voice dictation (Web Speech API), audio recording (MediaRecorder API), calendar-based visit planning, and AI-powered schedule extraction from photos (OpenAI GPT-4o vision).
- **Responsiveness**: Data-heavy pages are designed with responsive tables, sticky elements, stacking filter bars, and minimum 44px touch targets.

### Backend
- **Framework**: Express.js with Node.js and TypeScript (via tsx).
- **API**: RESTful endpoints defined by Zod schemas in `shared/routes.ts` for both input validation and response types.
- **Authentication**: Replit Auth via OpenID Connect (OIDC) with Passport.js and session-based storage in PostgreSQL.
- **Data Access**: Read operations are generally open, while write operations require user authentication.
- **Build**: Custom esbuild script for the server, Vite for the client.

### Data Storage
- **Database**: PostgreSQL.
- **ORM**: Drizzle ORM with `drizzle-zod` for schema generation.
- **Schema**: Defined in `shared/schema.ts` (main tables) and `shared/models/auth.ts` (auth tables).
- **Data Model**: Follows a relational hierarchy: Institutions → Departments → Instructors/Courses, with many-to-many relationships and associated data like Office Hours, Deals, and Planned Meetings.
- **Key Tables**: `institutions`, `departments`, `instructors`, `courses`, `course_instructors`, `office_hours`, `visits`, `visit_interactions`, `planned_meetings`, `deals`, `organizations`, `sessions`, `users`.

## External Dependencies

### Database & ORM
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: For database interactions and schema management.
- **connect-pg-simple**: PostgreSQL session store.

### Authentication
- **Replit Auth**: OpenID Connect provider.
- **Passport.js**: Authentication middleware.
- **express-session**: Session management.

### Frontend Libraries
- **@tanstack/react-query**: Server state management.
- **shadcn/ui + Radix UI**: UI component library.
- **Tailwind CSS**: Styling framework.
- **react-hook-form + @hookform/resolvers**: Form management.
- **wouter**: Client-side routing.

### HubSpot CRM Integration
- **Service**: `server/hubspot.ts` for HubSpot API client.
- **Integration**: Replit native HubSpot connector (OAuth).
- **Functionality**: Syncs contacts and deals, matches HubSpot contacts to instructors, creates new instructors, and imports deal data.
- **API Endpoints**: `/api/hubspot/sync`, `/api/hubspot/import-preview`, `/api/hubspot/search-contacts`, `/api/deals`, `/api/hubspot/deal-stages`, `/api/institutions/active`.

### AI Schedule Photo Extraction
- **Service**: `server/schedule-extractor.ts` using OpenAI GPT-4o vision API.
- **Integration**: Replit AI Integrations (OpenAI).
- **Functionality**: Extracts schedule data from photos and saves it as office hours.
- **API Endpoints**: `/api/schedule/extract-from-photo`, `/api/schedule/save-extracted`.

### Packback Web Scraper
- **Scraper**: `server/scraper/packback_scraper.py` using Crawl4AI.
- **Functionality**: Finds faculty using Packback by scraping university websites, extracting instructor names and course codes.
- **API Endpoint**: `/api/scrape/packback`.

### Build Tools
- **Vite**: Frontend bundler.
- **esbuild**: Server-side bundling.
- **tsx**: TypeScript execution.