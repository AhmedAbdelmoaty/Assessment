import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { users, emailTokens, attempts } from '../../shared/schema.js';
import { eq, and, gt, isNull } from 'drizzle-orm';

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
  const [user] = await db.insert(users).values({
    email,
    username: profileJson.name_full || null,
    profileJson,
    emailVerifiedAt: null,
  }).returning();
  
  return user;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

/**
 * Find user by ID
 */
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

/**
 * Create an email verification or reset token
 */
export async function createEmailToken(userId, type) {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  
  await db.insert(emailTokens).values({
    userId,
    tokenHash,
    type,
    expiresAt,
  });
  
  return rawToken;
}

/**
 * Verify and consume a token
 */
export async function verifyAndConsumeToken(rawToken, type) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  
  const [token] = await db.select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.type, type),
        gt(emailTokens.expiresAt, now),
        isNull(emailTokens.usedAt)
      )
    )
    .limit(1);
  
  if (!token) {
    return null;
  }
  
  // Mark token as used
  await db.update(emailTokens)
    .set({ usedAt: now })
    .where(eq(emailTokens.id, token.id));
  
  return token;
}

/**
 * Mark user email as verified
 */
export async function markEmailVerified(userId) {
  await db.update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Set user password
 */
export async function setUserPassword(userId, password) {
  const passHash = await hashPassword(password);
  await db.update(users)
    .set({ passHash })
    .where(eq(users.id, userId));
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, profileJson) {
  await db.update(users)
    .set({ 
      profileJson,
      username: profileJson.name_full || null 
    })
    .where(eq(users.id, userId));
}

/**
 * Get or create active attempt for user
 */
export async function getOrCreateAttempt(userId, difficultyTier = 'normal') {
  // Check for existing incomplete attempt
  const [existingAttempt] = await db.select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        isNull(attempts.finishedAt)
      )
    )
    .limit(1);
  
  if (existingAttempt) {
    return existingAttempt;
  }
  
  // Create new attempt
  const [newAttempt] = await db.insert(attempts).values({
    userId,
    difficultyTier,
    currentLevel: 'L1',
    currentStep: 'intake',
    intakeStepIndex: 0,
    assessmentState: {
      currentLevel: 'L1',
      attempts: 0,
      evidence: [],
      askedClusters: { L1: [], L2: [], L3: [] },
      currentQuestionCount: 0
    }
  }).returning();
  
  return newAttempt;
}

/**
 * Update attempt progress
 */
export async function updateAttempt(attemptId, updates) {
  await db.update(attempts)
    .set(updates)
    .where(eq(attempts.id, attemptId));
}

/**
 * Get user's attempts
 */
export async function getUserAttempts(userId) {
  return await db.select()
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(attempts.startedAt);
}

/**
 * Get attempt by ID
 */
export async function getAttemptById(attemptId) {
  const [attempt] = await db.select()
    .from(attempts)
    .where(eq(attempts.id, attemptId))
    .limit(1);
  return attempt || null;
}
