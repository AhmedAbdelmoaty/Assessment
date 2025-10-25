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
  role: text('role').default('user').notNull(), // 'user' or 'admin'
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

// User assessments table - simple structure for quick saves
export const userAssessments = pgTable('user_assessments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  difficulty: text('difficulty'),
  scorePercent: integer('score_percent'),
  evidence: jsonb('evidence')
});

// Attempts table - full assessment structure with all details
export const attempts = pgTable('attempts', {
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

// Teaching notes table (enhanced for independent threads)
export const teachingNotes = pgTable('teaching_notes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).notNull(),
  assessmentId: uuid('assessment_id').references(() => attempts.id), // Links to specific assessment
  threadId: text('thread_id'), // OpenAI thread ID for this explanation
  inProgress: boolean('in_progress').default(false).notNull(), // Is this teaching session active?
  topicDisplay: text('topic_display').notNull(),
  text: text('text').notNull(), // Formatted transcript for display
  transcript: jsonb('transcript'), // Raw conversation array: [{from: 'user'|'assistant', text: '...'}]
  createdAt: timestamp('created_at').defaultNow().notNull()
});
// Chat messages table - stores all chat conversation history
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text('session_id').notNull(), // Links to in-memory session
  userId: uuid('user_id').references(() => users.id), // Optional - if user logged in
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(), // Message text
  messageType: text('message_type'), // 'mcq' | 'report' | 'teaching' | 'text' | 'intake'
  metadata: jsonb('metadata'), // Extra data like MCQ choices, correct answer, etc.
  createdAt: timestamp('created_at').defaultNow().notNull()
});
// Session table (for express-session with connect-pg-simple)
export const sessionTable = pgTable('session', {
  sid: varchar('sid').primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire').notNull()
});
