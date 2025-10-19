/**
 * Database schema definition in vanilla JavaScript
 * Contains SQL table creation statements and schema documentation
 */

// SQL table creation statements
export const CREATE_TABLES_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  pass_hash TEXT,
  profile_json JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  email_verified_at TIMESTAMP
);

-- Email tokens for verification and password reset
CREATE TABLE IF NOT EXISTS email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL, -- 'verify' or 'reset'
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP
);

-- Assessment attempts
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP,
  difficulty_tier TEXT NOT NULL DEFAULT 'normal', -- 'normal' or 'advanced'
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  score_percent INTEGER NOT NULL DEFAULT 0,
  current_level TEXT DEFAULT 'L1',
  current_step TEXT DEFAULT 'intake', -- 'intake', 'assessment', 'report', 'teaching'
  intake_step_index INTEGER DEFAULT 0,
  assessment_state JSONB, -- Store current assessment progress
  report_data JSONB -- Store final report
);

-- Individual attempt items (each MCQ question)
CREATE TABLE IF NOT EXISTS attempt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  level TEXT NOT NULL, -- 'L1', 'L2', 'L3'
  cluster TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  prompt_excerpt TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Teaching notes
CREATE TABLE IF NOT EXISTS teaching_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_display TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Session table (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
`;

// Schema documentation for reference
export const TABLES = {
  users: {
    name: 'users',
    columns: {
      id: 'UUID (primary key)',
      email: 'TEXT (unique, not null)',
      username: 'TEXT',
      pass_hash: 'TEXT',
      profile_json: 'JSONB',
      created_at: 'TIMESTAMP (default now)',
      email_verified_at: 'TIMESTAMP'
    }
  },
  email_tokens: {
    name: 'email_tokens',
    columns: {
      id: 'UUID (primary key)',
      user_id: 'UUID (foreign key to users)',
      token_hash: 'TEXT (not null)',
      type: 'TEXT (verify|reset)',
      expires_at: 'TIMESTAMP (not null)',
      used_at: 'TIMESTAMP'
    }
  },
  attempts: {
    name: 'attempts',
    columns: {
      id: 'UUID (primary key)',
      user_id: 'UUID (foreign key to users)',
      started_at: 'TIMESTAMP (default now)',
      finished_at: 'TIMESTAMP',
      difficulty_tier: 'TEXT (default normal)',
      total_questions: 'INTEGER (default 0)',
      correct_answers: 'INTEGER (default 0)',
      score_percent: 'INTEGER (default 0)',
      current_level: 'TEXT (default L1)',
      current_step: 'TEXT (default intake)',
      intake_step_index: 'INTEGER (default 0)',
      assessment_state: 'JSONB',
      report_data: 'JSONB'
    }
  },
  attempt_items: {
    name: 'attempt_items',
    columns: {
      id: 'UUID (primary key)',
      attempt_id: 'UUID (foreign key to attempts)',
      level: 'TEXT (not null)',
      cluster: 'TEXT (not null)',
      correct: 'BOOLEAN (not null)',
      prompt_excerpt: 'TEXT',
      created_at: 'TIMESTAMP (default now)'
    }
  },
  teaching_notes: {
    name: 'teaching_notes',
    columns: {
      id: 'UUID (primary key)',
      user_id: 'UUID (foreign key to users)',
      topic_display: 'TEXT (not null)',
      text: 'TEXT (not null)',
      created_at: 'TIMESTAMP (default now)'
    }
  },
  session: {
    name: 'session',
    columns: {
      sid: 'VARCHAR (primary key)',
      sess: 'JSON (not null)',
      expire: 'TIMESTAMP(6) (not null)'
    }
  }
};

// Validation helpers (simple JavaScript validation, no Zod)
export const validators = {
  isValidEmail: (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  
  isValidPassword: (password) => {
    return password && password.length >= 8;
  },
  
  isValidTokenType: (type) => {
    return type === 'verify' || type === 'reset';
  },
  
  isValidLevel: (level) => {
    return ['L1', 'L2', 'L3'].includes(level);
  },
  
  isValidStep: (step) => {
    return ['intake', 'assessment', 'report', 'teaching'].includes(step);
  }
};
