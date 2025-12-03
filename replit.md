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

## Manual QA checklist

- Intake validation: أدخل قيمة خاطئة في أول سؤال، تأكد أن رسالة الخطأ من المساعد تظهر في الشات، ثم أعد تحميل الصفحة وتحقق أن نفس الرسالة تظهر فور التحميل بدون بدء تدفق جديد.