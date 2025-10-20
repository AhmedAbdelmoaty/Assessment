# Learning Advisor Assessment Platform

## Overview

This is a bilingual (English/Arabic) learning assessment platform designed to evaluate users' data analysis knowledge through adaptive multiple-choice questions. The system conducts a conversational intake process, administers personalized MCQ assessments across three proficiency levels, and generates customized learning reports with actionable recommendations.

The platform uses an adaptive assessment engine that dynamically adjusts question difficulty based on user performance, covering descriptive statistics topics from foundational concepts to professional-level skills.

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

**Server Implementation**
- Express.js server (server/index.js) with persistent session management
- PostgreSQL database integration via Drizzle ORM
- Session middleware: express-session + connect-pg-simple for persistent sessions
- Security: helmet middleware, bcrypt password hashing, rate limiting for OTP requests
- RESTful API design with `/api` prefix for all endpoints

**Authentication System**
- OTP-based email verification flow (with SMTP or DEV mode console logging)
- Password-based authentication with bcrypt hashing
- Session regeneration on login/OTP verify to prevent fixation attacks
- Email verification tracking with emailVerifiedAt timestamp
- Auth routes: /api/auth/otp/request, /api/auth/otp/verify, /api/auth/set-password, /api/auth/login, /api/auth/me, /api/auth/logout

**Dashboard & User Management**
- User dashboard at /dashboard with 4 sections: My Info, Past Assessments, Tutorials, Videos
- Profile management: GET/POST /api/user/profile
- Assessment history: GET /api/user/assessments
- Tutorial library: GET /api/user/tutorials
- Retake functionality: POST /api/assess/retake for harder difficulty assessments

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

**PostgreSQL Database (Primary Storage)**
- Neon serverless PostgreSQL with Drizzle ORM
- Schema defined in `shared/schema.ts` and `shared/schema.js`
- Tables: users, auth_otps, user_progress, user_assessments, session
- All primary keys use UUID with `gen_random_uuid()` default
- Database schema synchronization via `npm run db:push`

**Database Tables**
- `users`: User accounts with email, name, password hash, email verification timestamp
- `auth_otps`: One-time passwords for email verification (15-minute expiry, consumed_at tracking)
- `user_progress`: User intake data, flow state, assessment state (JSONB)
- `user_assessments`: Assessment history with difficulty, score percentage, evidence
- `session`: Persistent session storage via connect-pg-simple

**Hybrid Session Architecture**
- Persistent sessions: PostgreSQL-backed via connect-pg-simple for authenticated users
- In-memory sessions: Map-based storage for backward compatibility with existing assessment code
- Session regeneration on authentication to prevent fixation attacks

**Session Data in Database**
- Session ID, session data (JSONB), expiration timestamp
- 30-day cookie maxAge for persistent login
- HTTP-only, SameSite=lax cookies for security

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