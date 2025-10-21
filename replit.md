# Learning Advisor Assessment Platform

## Overview

This is a bilingual (English/Arabic) learning assessment platform designed to evaluate users' data analysis knowledge through adaptive multiple-choice questions. The system conducts a conversational intake process, administers personalized MCQ assessments across three proficiency levels, and generates customized learning reports with actionable recommendations.

The platform uses an adaptive assessment engine that dynamically adjusts question difficulty based on user performance, covering descriptive statistics topics from foundational concepts to professional-level skills.

**New Feature (October 2025)**: Admin-only interactive data dashboard for user distribution analysis with role-based access control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Single-Page Application (SPA) Pattern**
- React-based UI using TypeScript and Vite as the build tool
- Wouter for lightweight client-side routing
- TanStack Query for server state management and data fetching
- Shadcn/ui component library built on Radix UI primitives for accessible, customizable components

**Styling & Theming**
- Tailwind CSS for utility-first styling with custom design tokens
- CSS variables for theme customization (colors, spacing, shadows)
- Support for RTL (Right-to-Left) layouts for Arabic language
- Inter font for English, Noto Sans Arabic for Arabic text
- Responsive design with mobile-first approach

**State Management Strategy**
- React Query handles all server state with configured query client
- Local component state using React hooks
- No global state management library needed due to server-driven architecture

### Backend Architecture

**Dual Server Implementation**
- **Development Server**: Express.js with TypeScript (server/index.ts) using Vite middleware for HMR
- **Production Server**: Vanilla JavaScript Express server (server/index.js) with static file serving
- Session-based architecture using in-memory Map storage for user data
- RESTful API design with `/api` prefix for all endpoints

**Assessment Engine Logic**
- Three-level proficiency system (L1: Foundations, L2: Core Applied, L3: Professional)
- Each level contains three knowledge clusters (9 total clusters)
- Adaptive questioning algorithm that adjusts difficulty based on performance
- Session tracking for multi-step conversational intake and assessment flow

**OpenAI Integration**
- Chat Completions API for dynamic MCQ generation based on user profile
- Context-aware question generation using user's sector, job nature, and experience
- Report generation using evidence-based assessment results
- Centralized system prompts in `server/prompts/system.js`

### Data Storage Solutions

**In-Memory Session Storage**
- Map-based session store keyed by session ID
- No persistent database - stateless session design
- Session data includes: intake information, assessment progress, evidence trail, and final report

**Session Data Structure**
- `sessionId`: Unique identifier
- `lang`: Language preference (en/ar)
- `currentStep`: Workflow state (intake/assessment/report/completed)
- `intake`: User profile data (name, email, country, job details, learning goals)
- `assessment`: Progress tracking (level, attempts, evidence array, asked clusters)
- `report`: Final assessment results (message, strengths, gaps, proficiency level)

**Database Configuration**
- Drizzle ORM configured with PostgreSQL dialect
- Neon serverless PostgreSQL driver for production
- Migration system via drizzle-kit (use `npm run db:push --force`)
- Users table includes role-based access control (user/admin roles)

**Database Schema**
- `users` table: id, email, username, pass_hash, role, profile_json, created_at, email_verified_at
- `auth_otps` table: OTP verification for email
- `user_assessments` table: Assessment progress and results
- `attempts` table: Historical attempt records
- `teaching_notes` table: User learning notes
- `session` table: Express session storage

### External Dependencies

**Third-Party Services**
- **OpenAI API**: GPT-5 model for MCQ generation and personalized report creation
- **Neon Database**: Serverless PostgreSQL (configured but not actively used)

**UI Component Libraries**
- Radix UI: Headless accessible component primitives
- Shadcn/ui: Pre-styled component system
- Lucide React: Icon library
- Embla Carousel: Carousel functionality

**Development Tools**
- Vite: Build tool and dev server
- Replit-specific plugins: Cartographer, dev banner, runtime error overlay
- TypeScript: Type safety across frontend and shared modules
- ESBuild: Production bundling for backend

**Form & Validation**
- React Hook Form: Form state management
- Zod: Schema validation for forms and API data
- Drizzle-Zod: Database schema to Zod validation bridge

**Utilities**
- date-fns: Date manipulation
- clsx + tailwind-merge: Conditional className composition
- cmdk: Command palette functionality
- nanoid: Unique ID generation

## Admin Dashboard

### Overview
Admin-only interactive data dashboard for analyzing user distribution across demographic and professional categories. Provides real-time insights without exposing individual user PII.

### Features
- **Role-Based Access**: Only users with `role = 'admin'` can access `/admin.html` and `/api/admin/*` endpoints
- **Key Metrics**: Total users count and top country by user count
- **Interactive Drilldown**: 4-level hierarchical analysis (Country → Age Band → Sector → Job Nature)
- **Client-Side Interaction**: Expand/collapse nodes with keyboard support (Enter/Space/ESC)
- **Real-Time Refresh**: Reload data without page reload
- **Bilingual Support**: Full English/Arabic language support with RTL layout
- **Responsive Design**: Mobile-friendly with breakpoint at 768px

### Security
- Admin middleware (`server/middleware/admin.js`) validates user role on every request
- Regular users receive 403 (API) or redirect to `/dashboard.html` (HTML)
- Admins are redirected from regular user pages to `/admin.html`
- Protected routes mounted before static file serving (prevents SPA fallback exposure)
- Rate limiting: 100 requests per 15 minutes for admin endpoints
- No PII exposed - only aggregated counts displayed

### Data Source
Dashboard queries `profile_json.intake` fields from the `users` table:
- `country`: User's country
- `age_band`: Age range (18-24, 25-34, 35-44, 45-54, 55+)
- `sector`: Industry sector (Technology, Finance, Healthcare, etc.)
- `job_nature`: Job function (IT/Data, Accounting/Finance, Marketing, etc.)

### API Endpoints
- `GET /api/admin/counters`: Returns total users and top country with count
- `GET /api/admin/drilldown`: Returns flat array of aggregated counts for all combinations

### Files
- `server/middleware/admin.js`: Role-based access control middleware
- `server/routes/admin.js`: Admin API endpoints
- `public/admin.html`: Admin dashboard UI
- `public/js/admin.js`: Interactive drilldown logic with tree building
- `public/css/admin.css`: Minimal, responsive, RTL-friendly styling

### Admin User Setup
To create an admin user:
```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

**Test Admin Account**:
- Email: admin@example.com
- Password: admin123
- Role: admin