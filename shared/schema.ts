import { z } from "zod";

// Session data structure
export const sessionSchema = z.object({
  sessionId: z.string(),
  lang: z.enum(["en", "ar"]),
  currentStep: z.enum(["intake", "assessment", "report", "completed"]),
  
  // Intake data
  intake: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    ageBand: z.string().optional(),
    country: z.string().optional(),
    jobNature: z.string().optional(),
    experienceYears: z.string().optional(),
    jobTitle: z.string().optional(),
    sector: z.string().optional(),
    learningReason: z.string().optional(),
  }).optional(),
  
  // Assessment data
  assessment: z.object({
    currentLevel: z.enum(["L1", "L2", "L3"]),
    attempts: z.number().default(0),
    evidence: z.array(z.object({
      level: z.enum(["L1", "L2", "L3"]),
      cluster: z.string(),
      correct: z.boolean(),
      questionId: z.string().optional(),
      userAnswer: z.string().optional(),
    })),
    askedClusters: z.record(z.array(z.string())), // level -> clusters asked
    currentQuestionCount: z.number().default(0),
  }).optional(),
  
  // Report data
  report: z.object({
    message: z.string(),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    statsLevel: z.enum(["Beginner", "Intermediate", "Advanced"]),
  }).optional(),
  
  finished: z.boolean().default(false),
}).strict();

export type Session = z.infer<typeof sessionSchema>;

// MCQ structure
export const mcqSchema = z.object({
  kind: z.literal("question"),
  level: z.enum(["L1", "L2", "L3"]),
  cluster: z.string(),
  type: z.literal("mcq"),
  prompt: z.string(),
  choices: z.array(z.string()),
  correct_answer: z.string(),
  rationale: z.string(),
}).strict();

export type MCQ = z.infer<typeof mcqSchema>;

// Final report structure
export const finalReportSchema = z.object({
  kind: z.literal("final_report"),
  message: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  stats_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
}).strict();

export type FinalReport = z.infer<typeof finalReportSchema>;
