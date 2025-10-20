import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import { db } from "./db.js";
import { users, authOtps, userProgress } from "../shared/schema.js";
import { eq, and, gt } from "drizzle-orm";

const SALT_ROUNDS = 10;

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password with bcrypt
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create or get user by email
export async function upsertUser(email: string, name: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (existing.length > 0) {
    // Update name if changed
    await db.update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id));
    return existing[0];
  }
  
  // Create new user
  const newUsers = await db.insert(users)
    .values({ email, name })
    .returning();
  return newUsers[0];
}

// Create OTP for user
export async function createOTP(userId: string): Promise<string> {
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
export async function verifyOTP(email: string, code: string): Promise<{ success: boolean; userId?: string }> {
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user.length) {
    return { success: false };
  }
  
  const userId = user[0].id;
  const now = new Date();
  
  // Find valid, unconsumed OTP
  const otpRecords = await db.select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.userId, userId),
        eq(authOtps.code, code),
        gt(authOtps.expiresAt, now),
        eq(authOtps.consumedAt, null as any)
      )
    )
    .limit(1);
  
  if (!otpRecords.length) {
    return { success: false };
  }
  
  // Mark as consumed
  await db.update(authOtps)
    .set({ consumedAt: now })
    .where(eq(authOtps.id, otpRecords[0].id));
  
  // Mark email as verified
  await db.update(users)
    .set({ emailVerifiedAt: now })
    .where(eq(users.id, userId));
  
  return { success: true, userId };
}

// Send OTP via email (or log in DEV mode)
export async function sendOTP(email: string, code: string, lang: string = "en"): Promise<{ sent: boolean; devMode: boolean }> {
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS;
  
  if (!hasSmtp) {
    // DEV mode - log to console
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return { sent: false, devMode: true };
  }
  
  try {
    const transporter = nodemailer.createTransporter({
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
