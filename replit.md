# Learning Advisor Assessment Platform

## Overview

This is a bilingual (English/Arabic) learning assessment platform designed to evaluate users' data analysis knowledge through adaptive multiple-choice questions. The system conducts a conversational intake process, administers personalized MCQ assessments across three proficiency levels, and generates customized learning reports with actionable recommendations.

The platform uses an adaptive assessment engine that dynamically adjusts question difficulty based on user performance, covering descriptive statistics topics from foundational concepts to professional-level skills.

## Recent Changes (October 19, 2025)

**✅ Complete Authentication & Persistence System - INTEGRATED & PRODUCTION-READY**

Successfully converted entire codebase to vanilla JavaScript and integrated full authentication system:

**Backend (Vanilla JavaScript):**
- ✅ Converted `shared/schema.ts` → `shared/schema.js` with pure SQL table definitions
- ✅ Created migration script (`server/migrate.js`) - successfully deployed 6 PostgreSQL tables
- ✅ Rewrote all services to use raw parameterized SQL queries (no Drizzle ORM):
  - `server/services/authService.js` - user creation, token management, password verification
  - `server/services/userService.js` - user state operations (attempts, teaching notes)
  - `server/services/emailService.js` - verification emails with Replit public domain links
- ✅ Configured PostgreSQL session storage with `connect-pg-simple`
- ✅ Mounted auth and user routes in `server/index.js` with rate limiting
- ✅ Security measures: bcrypt password hashing, helmet headers, rate limiting, httpOnly cookies

**Frontend (Vanilla HTML/CSS/JS):**
- ✅ `/login.html` - Email/password login form with validation
- ✅ `/register.html` - User registration with email verification flow
- ✅ `/verify.html` - Email verification with password setup
- ✅ `/dashboard.html` - User dashboard with assessment history and stats

**Database Tables (PostgreSQL):**
1. `users` - User accounts with bcrypt-hashed passwords
2. `email_tokens` - Magic link tokens for verification and password reset
3. `attempts` - User assessment attempt records with proficiency levels
4. `attempt_items` - Individual MCQ responses with evidence
5. `teaching_notes` - Teaching mode conversation history
6. `session` - Express session storage (managed by connect-pg-simple)

**Critical Fix:**
- Email verification links now correctly use `REPLIT_DOMAINS` environment variable
- Falls back to `REPL_SLUG` + `REPLIT_DEV_DOMAIN`, then localhost for development
- Production-ready: generates public URLs like `https://<workspace>.picard.replit.dev/verify?token=...`

**Testing Results:**
- ✅ Backend API fully tested with curl
- ✅ All data persists to PostgreSQL correctly
- ✅ Sessions survive server restarts
- ✅ Email verification flow works end-to-end
- ✅ Architect approved as production-ready

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

**Database Configuration (Future-Ready)**
- Drizzle ORM configured with PostgreSQL dialect
- Schema defined in `shared/schema.ts` with Zod validation
- Neon serverless PostgreSQL driver ready for integration
- Migration system in place via drizzle-kit

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