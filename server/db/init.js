// server/db/init.js
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureUuidFunction(client) {
  // جرّب pgcrypto أولاً
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await client.query(`SELECT gen_random_uuid();`);
    return "gen_random_uuid()";
  } catch {
    // لو pgcrypto غير متاح، جرّب uuid-ossp
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`SELECT uuid_generate_v4();`);
    return "uuid_generate_v4()";
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected. Initializing schema...");
    const uuidFn = await ensureUuidFunction(client);

    // سكريبتك نفسه، مع استبدال gen_random_uuid() بالدالة المتاحة تلقائياً
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        name TEXT NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        password_hash TEXT NOT NULL,
        locale VARCHAR(5) NOT NULL DEFAULT 'en',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(12) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS intake_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        country_code VARCHAR(8),
        sector_code VARCHAR(64),
        role_code VARCHAR(64),
        learning_goal_code VARCHAR(64),
        job_title VARCHAR(200),
        age INT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- status: assessment | report | teaching | ended
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        intake_done BOOLEAN NOT NULL DEFAULT FALSE,
        assessment_state JSONB,
        report_state JSONB,
        teaching_state JSONB,
        session_state JSONB,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

      -- sender: user | assistant | system
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sender VARCHAR(10) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(chat_session_id, created_at);

      CREATE TABLE IF NOT EXISTS assessments (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        correct_count INT NOT NULL,
        percent INT NOT NULL,
        levels_summary JSONB NOT NULL,
        finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_assessments_session ON assessments(chat_session_id);

      CREATE TABLE IF NOT EXISTS idempotency_ops (
        id UUID PRIMARY KEY DEFAULT ${uuidFn},
        chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        kind VARCHAR(20) NOT NULL,
        key VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL,
        result_ref JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (chat_session_id, kind, key)
      );
    `);

    // (اختياري) لو هنستخدم connect-pg-simple للكوكي سيشن:
    // await client.query(`
    //   CREATE TABLE IF NOT EXISTS "session" (
    //     sid varchar PRIMARY KEY,
    //     sess json NOT NULL,
    //     expire timestamp(6) NOT NULL
    //   );
    //   CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    // `);

    console.log("✅ DB init OK");
  } catch (e) {
    console.error("❌ DB init failed:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
