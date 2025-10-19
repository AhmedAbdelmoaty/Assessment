import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

/**
 * Get user's teaching notes
 */
export async function getUserTeachingNotes(userId) {
  return await sql`
    SELECT * FROM teaching_notes
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

/**
 * Create a teaching note
 */
export async function createTeachingNote(userId, topicDisplay, text) {
  const result = await sql`
    INSERT INTO teaching_notes (user_id, topic_display, text)
    VALUES (${userId}, ${topicDisplay}, ${text})
    RETURNING *
  `;
  return result[0];
}

/**
 * Get attempt items for a specific attempt
 */
export async function getAttemptItems(attemptId) {
  return await sql`
    SELECT * FROM attempt_items
    WHERE attempt_id = ${attemptId}
    ORDER BY created_at ASC
  `;
}

/**
 * Create an attempt item (MCQ record)
 */
export async function createAttemptItem(attemptId, level, cluster, correct, promptExcerpt = null) {
  const result = await sql`
    INSERT INTO attempt_items (attempt_id, level, cluster, correct, prompt_excerpt)
    VALUES (${attemptId}, ${level}, ${cluster}, ${correct}, ${promptExcerpt})
    RETURNING *
  `;
  return result[0];
}

/**
 * Get user statistics (total attempts, average score, etc.)
 */
export async function getUserStats(userId) {
  const result = await sql`
    SELECT 
      COUNT(*) as total_attempts,
      AVG(score_percent) as avg_score,
      MAX(score_percent) as best_score,
      COUNT(CASE WHEN finished_at IS NOT NULL THEN 1 END) as completed_attempts
    FROM attempts
    WHERE user_id = ${userId}
  `;
  return result[0] || {
    total_attempts: 0,
    avg_score: 0,
    best_score: 0,
    completed_attempts: 0
  };
}

/**
 * Get user's most recent attempt
 */
export async function getMostRecentAttempt(userId) {
  const result = await sql`
    SELECT * FROM attempts
    WHERE user_id = ${userId}
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return result[0] || null;
}
