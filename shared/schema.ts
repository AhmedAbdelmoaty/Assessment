import { pgTable, text, serial, timestamp, integer, jsonb, boolean, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username"),
  passHash: text("pass_hash"),
  profileJson: jsonb("profile_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
  emailTokens: many(emailTokens),
  attempts: many(attempts),
  teachingNotes: many(teachingNotes),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Email tokens for verification and password reset
export const emailTokens = pgTable("email_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  type: text("type").notNull(), // 'verify' or 'reset'
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const emailTokensRelations = relations(emailTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailTokens.userId],
    references: [users.id],
  }),
}));

export const insertEmailTokenSchema = createInsertSchema(emailTokens).omit({ id: true });
export type InsertEmailToken = z.infer<typeof insertEmailTokenSchema>;
export type EmailToken = typeof emailTokens.$inferSelect;

// Assessment attempts
export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  difficultyTier: text("difficulty_tier").notNull().default("normal"), // 'normal' or 'advanced'
  totalQuestions: integer("total_questions").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  scorePercent: integer("score_percent").notNull().default(0),
  currentLevel: text("current_level").default("L1"),
  currentStep: text("current_step").default("intake"), // 'intake', 'assessment', 'report', 'teaching'
  intakeStepIndex: integer("intake_step_index").default(0),
  assessmentState: jsonb("assessment_state"), // Store current assessment progress
  reportData: jsonb("report_data"), // Store final report
});

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  user: one(users, {
    fields: [attempts.userId],
    references: [users.id],
  }),
  attemptItems: many(attemptItems),
}));

export const insertAttemptSchema = createInsertSchema(attempts).omit({ id: true, startedAt: true });
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Attempt = typeof attempts.$inferSelect;

// Individual attempt items (each MCQ question)
export const attemptItems = pgTable("attempt_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  level: text("level").notNull(), // 'L1', 'L2', 'L3'
  cluster: text("cluster").notNull(),
  correct: boolean("correct").notNull(),
  promptExcerpt: text("prompt_excerpt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attemptItemsRelations = relations(attemptItems, ({ one }) => ({
  attempt: one(attempts, {
    fields: [attemptItems.attemptId],
    references: [attempts.id],
  }),
}));

export const insertAttemptItemSchema = createInsertSchema(attemptItems).omit({ id: true, createdAt: true });
export type InsertAttemptItem = z.infer<typeof insertAttemptItemSchema>;
export type AttemptItem = typeof attemptItems.$inferSelect;

// Teaching notes
export const teachingNotes = pgTable("teaching_notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  topicDisplay: text("topic_display").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teachingNotesRelations = relations(teachingNotes, ({ one }) => ({
  user: one(users, {
    fields: [teachingNotes.userId],
    references: [users.id],
  }),
}));

export const insertTeachingNoteSchema = createInsertSchema(teachingNotes).omit({ id: true, createdAt: true });
export type InsertTeachingNote = z.infer<typeof insertTeachingNoteSchema>;
export type TeachingNote = typeof teachingNotes.$inferSelect;
