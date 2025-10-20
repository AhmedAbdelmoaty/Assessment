import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import { db } from "./db.js";
import { users, authOtps, userProgress } from "../shared/schema.js";
import { eq, and, gt, isNull, desc } from "drizzle-orm";

const SALT_ROUNDS = 10;

// Generate 6-digit OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash password with bcrypt
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password with bcrypt
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Create or get user by email
export async function upsertUser(email, username) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (existing.length > 0) {
    // Update username if changed
    await db.update(users)
      .set({ username })
      .where(eq(users.id, existing[0].id));
    return existing[0];
  }
  
  // Create new user
  const newUsers = await db.insert(users)
    .values({ email, username })
    .returning();
  return newUsers[0];
}

// Create OTP for user
export async function createOTP(userId) {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  await db.insert(authOtps).values({
    userId,
    code,
    expiresAt,
  });
  
  return code;
}

// Verify OTP
export async function verifyOTP(email, inputCode) {
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user.length) {
    console.log("otp-verify debug: user not found for email", email);
    return { success: false };
  }
  
  const userId = user[0].id;
  const now = new Date();
  const codeStr = String(inputCode);
  
  // Find latest unconsumed OTP for this user
  const otpRecords = await db.select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.userId, userId),
        isNull(authOtps.consumedAt)
      )
    )
    .orderBy(desc(authOtps.createdAt))
    .limit(1);
  
  const row = otpRecords.length ? otpRecords[0] : null;
  
  // Debug logging
  console.log("otp-verify debug", {
    email,
    input: codeStr,
    found: !!row,
    codeLen: row?.code?.length,
    expiresAt: row?.expiresAt,
    nowUTC: now.toISOString(),
    expired: row ? now >= new Date(row.expiresAt) : null,
    codeMatch: row ? String(row.code) === codeStr : null
  });
  
  if (!row) {
    return { success: false };
  }
  
  // Check expiration (UTC)
  if (now >= new Date(row.expiresAt)) {
    console.log("otp-verify: code expired");
    return { success: false };
  }
  
  // Compare codes as strings
  if (String(row.code) !== codeStr) {
    console.log("otp-verify: code mismatch");
    return { success: false };
  }
  
  // Mark as consumed
  await db.update(authOtps)
    .set({ consumedAt: now })
    .where(eq(authOtps.id, row.id));
  
  // Mark email as verified
  await db.update(users)
    .set({ emailVerifiedAt: now })
    .where(eq(users.id, userId));
  
  return { success: true, userId };
}

// Send OTP via email (or log in DEV mode)
export async function sendOTP(email, code, lang = "en") {
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS;
  
  if (!hasSmtp) {
    // DEV mode - log to console
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return { sent: false, devMode: true };
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    
    const subject = lang === "ar" ? "رمز التحقق الخاص بك" : "Your Verification Code";
    const text = lang === "ar" 
      ? `رمز التحقق الخاص بك هو: ${code}\n\nصالح لمدة 15 دقيقة.`
      : `Your verification code is: ${code}\n\nValid for 15 minutes.`;
    
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject,
      text,
    });
    
    return { sent: true, devMode: false };
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return { sent: false, devMode: false };
  }
}
