import { pgTable, uuid, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username"),
  passHash: text("pass_hash"),
  profileJson: jsonb("profile_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

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

// User progress (intake + assessment state)
export const userProgress = pgTable("user_progress", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  intake: jsonb("intake"),
  flowState: text("flow_state").notNull().default("intake"),
  assessmentState: jsonb("assessment_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull(),
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({ id: true, createdAt: true, updatedAt: true });

// Assessment history
export const userAssessments = pgTable("user_assessments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  difficulty: text("difficulty").notNull().default("normal"),
  scorePercent: integer("score_percent"),
  evidence: jsonb("evidence"),
});

export const insertUserAssessmentSchema = createInsertSchema(userAssessments).omit({ id: true });

// Session table (for connect-pg-simple)
export const sessionTable = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});
