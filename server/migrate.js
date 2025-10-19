/**
 * Database migration script - creates all tables
 */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  try {
    console.log('Starting database migration...');
    
    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        username TEXT,
        pass_hash TEXT,
        profile_json JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        email_verified_at TIMESTAMP
      )
    `;
    console.log('✓ Users table created');
    
    // Email tokens table
    await sql`
      CREATE TABLE IF NOT EXISTS email_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP
      )
    `;
    console.log('✓ Email tokens table created');
    
    // Attempts table
    await sql`
      CREATE TABLE IF NOT EXISTS attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        finished_at TIMESTAMP,
        difficulty_tier TEXT NOT NULL DEFAULT 'normal',
        total_questions INTEGER NOT NULL DEFAULT 0,
        correct_answers INTEGER NOT NULL DEFAULT 0,
        score_percent INTEGER NOT NULL DEFAULT 0,
        current_level TEXT DEFAULT 'L1',
        current_step TEXT DEFAULT 'intake',
        intake_step_index INTEGER DEFAULT 0,
        assessment_state JSONB,
        report_data JSONB
      )
    `;
    console.log('✓ Attempts table created');
    
    // Attempt items table
    await sql`
      CREATE TABLE IF NOT EXISTS attempt_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        level TEXT NOT NULL,
        cluster TEXT NOT NULL,
        correct BOOLEAN NOT NULL,
        prompt_excerpt TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    console.log('✓ Attempt items table created');
    
    // Teaching notes table
    await sql`
      CREATE TABLE IF NOT EXISTS teaching_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic_display TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    console.log('✓ Teaching notes table created');
    
    // Session table (for connect-pg-simple)
    await sql`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire)
    `;
    console.log('✓ Session table created');
    
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
