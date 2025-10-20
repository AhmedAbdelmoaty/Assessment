import { pgTable, uuid, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// OTP table for email verification
export const authOtps = pgTable("auth_otps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const insertAuthOtpSchema = createInsertSchema(authOtps).omit({ id: true, createdAt: true });
export type InsertAuthOtp = z.infer<typeof insertAuthOtpSchema>;
export type AuthOtp = typeof authOtps.$inferSelect;

// User progress (intake + assessment state)
export const userProgress = pgTable("user_progress", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  intake: jsonb("intake").$type<Record<string, any>>(),
  flowState: text("flow_state").notNull().default("intake"), // 'intake' | 'otp_pending' | 'set_password' | 'assessment' | 'report' | 'teaching'
  assessmentState: jsonb("assessment_state").$type<{
    currentLevel?: string;
    attempts?: number;
    evidence?: Array<{
      level: string;
      cluster: string;
      correct: boolean;
      userAnswer: string;
    }>;
    askedClusters?: Record<string, string[]>;
    currentQuestionCount?: number;
    difficulty?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UserProgress = typeof userProgress.$inferSelect;

// Assessment history
export const userAssessments = pgTable("user_assessments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  difficulty: text("difficulty").notNull().default("normal"), // 'normal' | 'harder'
  scorePercent: integer("score_percent"),
  evidence: jsonb("evidence").$type<Array<{
    level: string;
    cluster: string;
    correct: boolean;
    userAnswer: string;
  }>>(),
});

export const insertUserAssessmentSchema = createInsertSchema(userAssessments).omit({ id: true });
export type InsertUserAssessment = z.infer<typeof insertUserAssessmentSchema>;
export type UserAssessment = typeof userAssessments.$inferSelect;

// Session table (for connect-pg-simple)
export const sessionTable = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});
