import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { 
  pgTable, 
  uuid, 
  text, 
  boolean, 
  timestamp, 
  integer,
  jsonb,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

// Users table (existing structure + additions)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').unique().notNull(),
  username: text('username').unique(),
  passHash: text('pass_hash'),
  profileJson: jsonb('profile_json'), // Contains: name, phone, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  emailVerifiedAt: timestamp('email_verified_at')
});

// Auth OTPs table (existing)
export const authOtps = pgTable('auth_otps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// User assessments table (existing)
export const userAssessments = pgTable('user_assessments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  difficultyTier: text('difficulty_tier'),
  totalQuestions: integer('total_questions'),
  correctAnswers: integer('correct_answers'),
  scorePercent: integer('score_percent'),
  currentLevel: text('current_level'),
  currentStep: text('current_step'),
  intakeStepIndex: integer('intake_step_index'),
  assessmentState: jsonb('assessment_state'),
  reportData: jsonb('report_data')
});

// Attempts table (existing)
export const attempts = pgTable('attempts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  difficulty: text('difficulty'),
  scorePercent: integer('score_percent'),
  evidence: jsonb('evidence')
});

// Teaching notes table (existing)
export const teachingNotes = pgTable('teaching_notes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  topicDisplay: text('topic_display'),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Session table (for express-session with connect-pg-simple)
export const sessionTable = pgTable('session', {
  sid: varchar('sid').primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire').notNull()
});
