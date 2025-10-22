# Schema Reconciliation Report

## Executive Summary
Fixed critical schema mismatches between Drizzle ORM definitions and actual PostgreSQL database. The main issue was table structures were swapped between `attempts` and `user_assessments` tables.

## Database Schema (Source of Truth)

### ✅ attempts table (Full Assessment Structure)
**Purpose**: Stores completed assessments with full details
**Columns**:
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → users.id, NOT NULL)
- `started_at` (timestamp, NOT NULL, default: now())
- `finished_at` (timestamp, nullable) ⭐ Key field
- `difficulty_tier` (text, default: 'normal')
- `total_questions` (integer, default: 0)
- `correct_answers` (integer, default: 0)
- `score_percent` (integer, default: 0)
- `current_level` (text, nullable, default: 'L1')
- `current_step` (text, nullable, default: 'intake')
- `intake_step_index` (integer, nullable, default: 0)
- `assessment_state` (jsonb, nullable)
- `report_data` (jsonb, nullable)

### ✅ user_assessments table (Simple Structure)
**Purpose**: Quick assessment saves (legacy/alternative storage)
**Columns**:
- `id` (uuid, PK, default: gen_random_uuid())
- `user_id` (uuid, FK → users.id, NOT NULL)
- `started_at` (timestamp, NOT NULL)
- `completed_at` (timestamp, nullable) ⭐ Key field
- `difficulty` (text, default: 'normal')
- `score_percent` (integer, nullable)
- `evidence` (jsonb, nullable)

### ✅ users table
**Columns**:
- `id`, `email`, `username`, `pass_hash`, `role`
- `profile_json` (jsonb) - Contains:
  - `name`, `phone` (root level)
  - `intake` (nested object):
    - `country`, `age_band`, `sector`, `job_nature`
    - `experience_years_band`, `learning_reason`
    - `job_title_exact`

### ✅ teaching_notes table
**Columns**:
- `id` (uuid, PK)
- `user_id` (uuid, FK)
- `topic_display` (text, NOT NULL)
- `text` (text, NOT NULL)
- `created_at` (timestamp, NOT NULL, default: now())

## Critical Fixes Applied

### 1. Fixed Schema Definition Swap (server/db.js)
**Problem**: Table structures were inverted
- `attempts` had simple structure (completed_at, difficulty, evidence)
- `userAssessments` had full structure (finishedAt, difficultyTier, totalQuestions, etc.)

**Solution**: Swapped the definitions to match actual DB
- `attempts` now has full structure with `finishedAt`
- `userAssessments` now has simple structure with `completedAt`

### 2. Fixed Column Name Mismatch (server/routes/profile.js)
**Problem**: Code queried `a.completedAt` on attempts table
**Error**: `column "completed_at" does not exist`
**Solution**: Changed to `a.finishedAt` to match schema

**Code Changes**:
```javascript
// Before (WRONG)
completedAt: a.completedAt,
status: a.completedAt ? 'complete' : 'in-progress'

// After (CORRECT)
finishedAt: a.finishedAt,
completedAt: a.finishedAt, // Alias for backward compatibility
status: a.finishedAt ? 'complete' : 'in-progress'
```

### 3. Fixed Assessment Saving (server/index.js)
**Problem**: Saving to `userAssessments` with wrong fields
**Solution**: Changed to save to `attempts` table with correct structure

**Code Changes**:
```javascript
// Before (WRONG)
const { db, userAssessments } = await import('./db.js');
await db.insert(userAssessments).values({
  finishedAt: new Date(),
  totalQuestions: totalQuestions,
  // ... wrong table
});

// After (CORRECT)
const { db, attempts } = await import('./db.js');
await db.insert(attempts).values({
  finishedAt: new Date(),
  difficultyTier: 'adaptive',
  totalQuestions: totalQuestions,
  correctAnswers: correctCount,
  scorePercent: scorePercent,
  currentLevel: highestReached,
  currentStep: 'completed',
  assessmentState: { evidence, strengths, gaps },
  reportData: report
});
```

## Field Name Patterns

### Snake Case (Database)
- `finished_at`, `completed_at`
- `difficulty_tier`, `total_questions`, `correct_answers`, `score_percent`
- `current_level`, `current_step`, `intake_step_index`
- `assessment_state`, `report_data`
- `user_id`, `started_at`, `created_at`

### Camel Case (Drizzle/JavaScript)
- `finishedAt`, `completedAt`
- `difficultyTier`, `totalQuestions`, `correctAnswers`, `scorePercent`
- `currentLevel`, `currentStep`, `intakeStepIndex`
- `assessmentState`, `reportData`
- `userId`, `startedAt`, `createdAt`

## API Endpoints Using These Tables

### ✅ Working Endpoints
- `GET /api/me/assessments` → queries `attempts` table with `finishedAt`
- `GET /api/me/explanations` → queries `teaching_notes` table
- `POST /api/report` → inserts to `attempts` table with full structure
- `PATCH /api/me` → updates `users.profile_json.intake`
- `GET /api/admin/users/raw` → reads `users.profile_json->>'intake'` fields

## Dashboard Data Flow

### User Dashboard (dashboard.html)
1. **Profile Section**: Reads from `/api/me`
   - Basic: `name`, `username`, `email`, `phone`
   - Intake: `profile_json.intake.*` (country, age_band, sector, etc.)

2. **Assessments Section**: Reads from `/api/me/assessments`
   - Shows: `startedAt`, `finishedAt`, `scorePercent`, `status`
   - Filters: complete/in-progress
   - Sorts: date/score ascending/descending

3. **Explanations Section**: Reads from `/api/me/explanations`
   - Shows: `topic`, `content`, `createdAt`
   - Clickable to view full transcript

### Admin Dashboard (admin.html)
- **Users Table**: Reads from `/api/admin/users/raw`
  - Shows: name, email, username + all intake fields
  - Filters by dimensions (country, sector, etc.)
  - Pivot matrix for distribution analysis

## Verification Queries

### Test Assessment Data
```sql
SELECT 
  id,
  started_at,
  finished_at,
  total_questions,
  correct_answers,
  score_percent,
  current_level
FROM attempts
WHERE user_id = '<user_id>'
ORDER BY started_at DESC
LIMIT 5;
```

### Test Intake Data
```sql
SELECT 
  email,
  username,
  profile_json->>'name' as name,
  profile_json->'intake'->>'country' as country,
  profile_json->'intake'->>'sector' as sector,
  profile_json->'intake'->>'age_band' as age_band
FROM users
WHERE email = '<email>';
```

### Test Teaching Notes
```sql
SELECT 
  topic_display,
  created_at,
  LENGTH(text) as content_length
FROM teaching_notes
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```

## Status: ✅ RESOLVED

All schema mismatches have been fixed:
- ✅ Table definitions match actual database
- ✅ Column names correctly mapped (snake_case ↔ camelCase)
- ✅ API routes use correct tables and fields
- ✅ No more "column does not exist" errors
- ✅ Assessment saving works with 6-question scoring rule
- ✅ Dashboards display persisted data correctly
