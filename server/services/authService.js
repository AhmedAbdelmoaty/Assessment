import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_MINUTES = 15;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token (32-48 bytes)
 */
export function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Hash a token using SHA256 for storage
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new user account (unverified)
 */
export async function createUser(email, profileJson) {
  const username = profileJson?.name_full || null;
  
  const result = await sql`
    INSERT INTO users (email, username, profile_json, email_verified_at)
    VALUES (${email}, ${username}, ${JSON.stringify(profileJson)}, NULL)
    RETURNING *
  `;
  
  return result[0] || null;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email) {
  const result = await sql`
    SELECT * FROM users WHERE email = ${email} LIMIT 1
  `;
  return result[0] || null;
}

/**
 * Find user by ID
 */
export async function findUserById(userId) {
  const result = await sql`
    SELECT * FROM users WHERE id = ${userId} LIMIT 1
  `;
  return result[0] || null;
}

/**
 * Create an email verification or reset token
 */
export async function createEmailToken(userId, type) {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  
  await sql`
    INSERT INTO email_tokens (user_id, token_hash, type, expires_at)
    VALUES (${userId}, ${tokenHash}, ${type}, ${expiresAt})
  `;
  
  return rawToken;
}

/**
 * Verify and consume a token
 */
export async function verifyAndConsumeToken(rawToken, type) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  
  const result = await sql`
    SELECT * FROM email_tokens
    WHERE token_hash = ${tokenHash}
      AND type = ${type}
      AND expires_at > ${now}
      AND used_at IS NULL
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const token = result[0];
  
  // Mark token as used
  await sql`
    UPDATE email_tokens
    SET used_at = ${now}
    WHERE id = ${token.id}
  `;
  
  return token;
}

/**
 * Mark user email as verified
 */
export async function markEmailVerified(userId) {
  await sql`
    UPDATE users
    SET email_verified_at = ${new Date()}
    WHERE id = ${userId}
  `;
}

/**
 * Set user password
 */
export async function setUserPassword(userId, password) {
  const passHash = await hashPassword(password);
  await sql`
    UPDATE users
    SET pass_hash = ${passHash}
    WHERE id = ${userId}
  `;
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, profileJson) {
  const username = profileJson?.name_full || null;
  await sql`
    UPDATE users
    SET profile_json = ${JSON.stringify(profileJson)},
        username = ${username}
    WHERE id = ${userId}
  `;
}

/**
 * Get or create active attempt for user
 */
export async function getOrCreateAttempt(userId, difficultyTier = 'normal') {
  // Check for existing incomplete attempt
  const existing = await sql`
    SELECT * FROM attempts
    WHERE user_id = ${userId}
      AND finished_at IS NULL
    LIMIT 1
  `;
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Create new attempt
  const assessmentState = {
    currentLevel: 'L1',
    attempts: 0,
    evidence: [],
    askedClusters: { L1: [], L2: [], L3: [] },
    currentQuestionCount: 0
  };
  
  const result = await sql`
    INSERT INTO attempts (
      user_id, 
      difficulty_tier, 
      current_level, 
      current_step, 
      intake_step_index,
      assessment_state
    )
    VALUES (
      ${userId}, 
      ${difficultyTier}, 
      'L1', 
      'intake', 
      0,
      ${JSON.stringify(assessmentState)}
    )
    RETURNING *
  `;
  
  return result[0];
}

/**
 * Update attempt progress
 */
export async function updateAttempt(attemptId, updates) {
  const setClauses = [];
  const values = [];
  
  Object.keys(updates).forEach(key => {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    setClauses.push(`${snakeKey} = $${setClauses.length + 1}`);
    
    // JSON stringify for JSONB columns
    if (snakeKey === 'assessment_state' || snakeKey === 'report_data') {
      values.push(JSON.stringify(updates[key]));
    } else {
      values.push(updates[key]);
    }
  });
  
  if (setClauses.length === 0) return;
  
  const query = `UPDATE attempts SET ${setClauses.join(', ')} WHERE id = $${setClauses.length + 1}`;
  values.push(attemptId);
  
  await sql(query, values);
}

/**
 * Get user's attempts
 */
export async function getUserAttempts(userId) {
  return await sql`
    SELECT * FROM attempts
    WHERE user_id = ${userId}
    ORDER BY started_at DESC
  `;
}

/**
 * Get attempt by ID
 */
export async function getAttemptById(attemptId) {
  const result = await sql`
    SELECT * FROM attempts
    WHERE id = ${attemptId}
    LIMIT 1
  `;
  return result[0] || null;
}
