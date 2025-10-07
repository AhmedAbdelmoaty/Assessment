import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { getSystemPrompt } from "./prompts/system.js";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));

// In-memory session store
const sessions = new Map();

// OpenAI client - the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

// Canonical intake model
const INTAKE_ORDER = [
  "name_full",
  "email",
  "phone_number",
  "country",
  "age_band",
  "job_nature",
  "experience_years_band",
  "job_title_exact",
  "sector",
  "learning_reason",
];

const INTAKE_CATALOG = {
  name_full: {
    type: "text",
    prompt: {
      en: "Hello! Let's start by getting to know you. What is your full name?",
      ar: "مرحبًا! لنبدأ بالتعرف عليك. ما هو اسمك الكامل؟",
    },
    validation_error: {
      en: "Please enter your full name (at least first and last name)",
      ar: "يرجى إدخال الاسم الكامل (الاسم الأول والأخير على الأقل)",
    },
  },
  email: {
    type: "text",
    prompt: {
      en: "What is your email address?",
      ar: "ما هو عنوان بريدك الإلكتروني؟",
    },
    validation_error: {
      en: "Please enter a valid email address",
      ar: "يرجى إدخال عنوان بريد إلكتروني صحيح",
    },
  },
  phone_number: {
    type: "text",
    prompt: {
      en: "What is your mobile phone number?",
      ar: "ما هو رقم هاتفك المحمول؟",
    },
    validation_error: {
      en: "Please enter a valid phone number (digits only, 7–15 digits; country code optional).",
      ar: "يرجى إدخال رقم هاتف صحيح (أرقام فقط، من 7 إلى 15 رقم؛ كود الدولة اختياري).",
    },
  },

  age_band: {
    type: "chips",
    prompt: {
      en: "What is your age range?",
      ar: "ما هي فئتك العمرية؟",
    },
    options: {
      en: ["18–24", "25–34", "35–44", "45–54", "55+"],
      ar: ["18–24", "25–34", "35–44", "45–54", "55+"],
    },
  },
  country: {
    type: "country",
    prompt: {
      en: "Which country do you live in?",
      ar: "في أي دولة تقيم؟",
    },
    options: {
      en: [
        "Afghanistan",
        "Albania",
        "Algeria",
        "Argentina",
        "Armenia",
        "Australia",
        "Austria",
        "Azerbaijan",
        "Bahrain",
        "Bangladesh",
        "Belarus",
        "Belgium",
        "Bolivia",
        "Brazil",
        "Bulgaria",
        "Cambodia",
        "Canada",
        "Chile",
        "China",
        "Colombia",
        "Costa Rica",
        "Croatia",
        "Cyprus",
        "Czech Republic",
        "Denmark",
        "Ecuador",
        "Egypt",
        "Estonia",
        "Finland",
        "France",
        "Georgia",
        "Germany",
        "Ghana",
        "Greece",
        "Hungary",
        "Iceland",
        "India",
        "Indonesia",
        "Iran",
        "Iraq",
        "Ireland",
        "Italy",
        "Japan",
        "Jordan",
        "Kazakhstan",
        "Kenya",
        "Kuwait",
        "Latvia",
        "Lebanon",
        "Lithuania",
        "Luxembourg",
        "Malaysia",
        "Mexico",
        "Morocco",
        "Netherlands",
        "New Zealand",
        "Nigeria",
        "Norway",
        "Oman",
        "Pakistan",
        "Palestine",
        "Peru",
        "Philippines",
        "Poland",
        "Portugal",
        "Qatar",
        "Romania",
        "Russia",
        "Saudi Arabia",
        "Singapore",
        "Slovakia",
        "Slovenia",
        "South Africa",
        "South Korea",
        "Spain",
        "Sri Lanka",
        "Sudan",
        "Sweden",
        "Switzerland",
        "Syria",
        "Thailand",
        "Tunisia",
        "Turkey",
        "Ukraine",
        "United Arab Emirates",
        "United Kingdom",
        "United States",
        "Uruguay",
        "Venezuela",
        "Vietnam",
        "Yemen",
      ],
      ar: [
        "أفغانستان",
        "ألبانيا",
        "الجزائر",
        "الأرجنتين",
        "أرمينيا",
        "أستراليا",
        "النمسا",
        "أذربيجان",
        "البحرين",
        "بنغلاديش",
        "بيلاروسيا",
        "بلجيكا",
        "بوليفيا",
        "البرازيل",
        "بلغاريا",
        "كمبوديا",
        "كندا",
        "تشيلي",
        "الصين",
        "كولومبيا",
        "كوستاريكا",
        "كرواتيا",
        "قبرص",
        "التشيك",
        "الدنمارك",
        "الإكوادور",
        "مصر",
        "إستونيا",
        "فنلندا",
        "فرنسا",
        "جورجيا",
        "ألمانيا",
        "غانا",
        "اليونان",
        "المجر",
        "آيسلندا",
        "الهند",
        "إندونيسيا",
        "إيران",
        "العراق",
        "أيرلندا",
        "إيطاليا",
        "اليابان",
        "الأردن",
        "كازاخستان",
        "كينيا",
        "الكويت",
        "لاتفيا",
        "لبنان",
        "ليتوانيا",
        "لوكسمبورغ",
        "ماليزيا",
        "المكسيك",
        "المغرب",
        "هولندا",
        "نيوزيلندا",
        "نيجيريا",
        "النرويج",
        "عُمان",
        "باكستان",
        "فلسطين",
        "بيرو",
        "الفلبين",
        "بولندا",
        "البرتغال",
        "قطر",
        "رومانيا",
        "روسيا",
        "السعودية",
        "سنغافورة",
        "سلوفاكيا",
        "سلوفينيا",
        "جنوب أفريقيا",
        "كوريا الجنوبية",
        "إسبانيا",
        "سريلانكا",
        "السودان",
        "السويد",
        "سويسرا",
        "سوريا",
        "تايلاند",
        "تونس",
        "تركيا",
        "أوكرانيا",
        "الإمارات",
        "بريطانيا",
        "الولايات المتحدة",
        "الأوروغواي",
        "فنزويلا",
        "فيتنام",
        "اليمن",
      ],
    },
  },
  job_nature: {
    type: "chips",
    prompt: {
      en: "What is the nature of your work or department?",
      ar: "ما هو طبيعة عملك أو قسمك؟",
    },
    options: {
      en: [
        "Accounting/Finance",
        "Sales",
        "Marketing",
        "Operations",
        "HR",
        "IT/Data",
        "Customer Support",
        "Product/Engineering",
        "Supply Chain/Logistics",
        "Healthcare",
        "Education",
        "Real Estate",
        "Manufacturing",
        "Government/Public",
        "Freelance/Consulting",
        "Other",
      ],
      ar: [
        "المالية/المحاسبة",
        "المبيعات",
        "التسويق",
        "العمليات",
        "الموارد البشرية",
        "تقنية المعلومات/البيانات",
        "خدمة العملاء",
        "المنتج/الهندسة",
        "سلسلة الإمداد/اللوجستيات",
        "الرعاية الصحية",
        "التعليم",
        "العقارات",
        "التصنيع",
        "القطاع الحكومي/العام",
        "عمل حر/استشارات",
        "أخرى",
      ],
    },
  },
  experience_years_band: {
    type: "chips",
    prompt: {
      en: "How many years of experience do you have?",
      ar: "كم سنة من الخبرة لديك؟",
    },
    options: {
      en: ["<1y", "1–2y", "3–5y", "6–9y", "10–14y", "15y+"],
      ar: [
        "أقل من سنة",
        "1–2 سنوات",
        "3–5 سنوات",
        "6–9 سنوات",
        "10–14 سنة",
        "15+ سنة",
      ],
    },
  },
  job_title_exact: {
    type: "text",
    prompt: {
      en: "What is your exact job title?",
      ar: "ما هو مسماك الوظيفي بالضبط؟",
    },
  },
  sector: {
    type: "chips",
    prompt: {
      en: "Which sector or industry do you work in?",
      ar: "في أي قطاع أو صناعة تعمل؟",
    },
    options: {
      en: [
        "Real Estate",
        "Retail/E-commerce",
        "Banking/Finance",
        "Telecom",
        "FMCG",
        "Healthcare",
        "Education",
        "Manufacturing",
        "Media/Advertising",
        "Travel/Hospitality",
        "Government/Public",
        "Technology/Software",
        "Other",
      ],
      ar: [
        "العقارات",
        "التجزئة/التجارة الإلكترونية",
        "البنوك/المالية",
        "الاتصالات",
        "السلع الاستهلاكية السريعة",
        "الرعاية الصحية",
        "التعليم",
        "التصنيع",
        "الإعلام/الإعلان",
        "السفر/الضيافة",
        "الحكومي/العام",
        "التقنية/البرمجيات",
        "أخرى",
      ],
    },
  },
  learning_reason: {
    type: "chips",
    prompt: {
      en: "What is your reason for wanting to learn data analysis?",
      ar: "ما هو سبب رغبتك في تعلم تحليل البيانات؟",
    },
    options: {
      en: [
        "Career shift",
        "Promotion",
        "Project need",
        "Skill refresh",
        "Academic",
      ],
      ar: ["تغيير مسار", "ترقية", "احتياج مشروع", "تحديث مهارة", "أكاديمي"],
    },
  },
};

// Level and cluster definitions
const LEVELS = {
  L1: {
    clusters: [
      "measurement_scales_data_types",
      "central_tendency_basics",
      "basic_spread_distribution_shape",
    ],
  },
  L2: {
    clusters: [
      "quantiles_iqr_boxplots",
      "standard_deviation_variability",
      "grouped_summaries",
    ],
  },
  L3: {
    clusters: [
      "z_scores_standardization",
      "skewness_kurtosis_diagnostics",
      "correlation_vs_covariance",
    ],
  },
};

// Initialize or get session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      lang: "en",
      currentStep: "intake",
      intakeStepIndex: 0,
      intake: {},
      assessment: {
        currentLevel: "L1",
        attempts: 0,
        evidence: [],
        askedClusters: { L1: [], L2: [], L3: [] },
        currentQuestionCount: 0,
      },
      finished: false,
    });
  }
  return sessions.get(sessionId);
}

// Validate intake input
function validateIntakeInput(stepKey, value) {
  if (stepKey === "name_full") {
    const words = value.trim().split(/\s+/);
    return words.length >= 2;
  }

  if (stepKey === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }
  if (stepKey === "phone_number") {
    if (!value) return false;
    // إزالة المسافات والشرطات والأقواس
    const cleaned = value.toString().replace(/[\s\-()]/g, "");
    // مسموح + في الأول اختيارياً ثم أرقام فقط بطول 7–15
    if (!/^\+?\d{7,15}$/.test(cleaned)) return false;
    return true;
  }

  return value && value.trim().length > 0;
}

// POST /api/intake/next - Handle intake flow
app.post("/api/intake/next", async (req, res) => {
  try {
    const { sessionId = randomUUID(), lang = "en", answer } = req.body;
    const session = getSession(sessionId);
    session.lang = lang;

    console.log(
      `[INTAKE] Session: ${sessionId}, Step: ${session.intakeStepIndex}, Answer: ${answer}`,
    );

    // If answer provided, validate and store
    if (answer !== undefined && answer !== null) {
      const currentStepKey = INTAKE_ORDER[session.intakeStepIndex];
      const stepConfig = INTAKE_CATALOG[currentStepKey];

      if (!validateIntakeInput(currentStepKey, answer)) {
        // Validation failed
        const errorMessage =
          stepConfig.validation_error?.[lang] ||
          (lang === "ar"
            ? "يرجى إدخال إجابة صحيحة"
            : "Please enter a valid answer");

        console.log(`[INTAKE] Validation failed for ${currentStepKey}`);
        return res.json({
          error: true,
          message: errorMessage,
        });
      }

      // Store valid answer
      session.intake[currentStepKey] = answer;
      session.intakeStepIndex++;

      console.log(
        `[INTAKE] Answer stored for ${currentStepKey}, moving to step ${session.intakeStepIndex}`,
      );
    }

    // Check if intake is complete
    if (session.intakeStepIndex >= INTAKE_ORDER.length) {
      session.currentStep = "assessment";
      console.log("[INTAKE] Complete - moving to assessment");
      return res.json({
        done: true,
        message:
          lang === "ar"
            ? "شكرًا — خصصت التقييم وفق بياناتك. لنبدأ."
            : "Thanks — I've tailored your assessment based on your profile. Let's begin.",
      });
    }

    // Get next step
    const nextStepKey = INTAKE_ORDER[session.intakeStepIndex];
    const nextStep = INTAKE_CATALOG[nextStepKey];

    const payload = {
      sessionId,
      stepKey: nextStepKey,
      type: nextStep.type,
      prompt: nextStep.prompt[lang],
      options: nextStep.options?.[lang] || null,
      lang,
    };

    console.log(
      `[INTAKE] Returning next step: ${nextStepKey}, type: ${nextStep.type}`,
    );
    res.json(payload);
  } catch (error) {
    console.error("Intake error:", error);
    res
      .status(500)
      .json({ error: true, message: "Server error during intake" });
  }
});

// POST /api/assess/next - Get next MCQ question
app.post("/api/assess/next", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);

    if (session.currentStep !== "assessment") {
      return res.status(400).json({ error: "Not in assessment phase" });
    }

    const assessment = session.assessment;
    const currentLevel = assessment.currentLevel;
    const availableClusters = LEVELS[currentLevel].clusters;
    const askedClusters = assessment.askedClusters[currentLevel] || [];
    const remainingClusters = availableClusters.filter(
      (c) => !askedClusters.includes(c),
    );

    if (
      remainingClusters.length === 0 ||
      assessment.currentQuestionCount >= 2
    ) {
      return res
        .status(400)
        .json({ error: "No more questions available for this level" });
    }

    // Select next cluster
    const nextCluster = remainingClusters[0];
    assessment.askedClusters[currentLevel].push(nextCluster);
    assessment.currentQuestionCount++;

    // Generate MCQ using OpenAI
    const systemPrompt = getSystemPrompt({
      lang: session.lang,
      profile: session.intake,
      level: currentLevel,
      cluster: nextCluster,
      avoidClusters: askedClusters,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate an MCQ for ${currentLevel} level, cluster: ${nextCluster}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const mcq = JSON.parse(response.choices[0].message.content);

    res.json({
      ...mcq,
      questionNumber: assessment.currentQuestionCount,
      totalQuestions: 2,
      level: currentLevel,
    });
  } catch (error) {
    console.error("Assessment error:", error);
    res.status(500).json({ error: "Server error during assessment" });
  }
});

// POST /api/assess/answer - Submit MCQ answer
app.post("/api/assess/answer", async (req, res) => {
  try {
    const { sessionId, cluster, level, userAnswer, correctAnswer } = req.body;
    const session = getSession(sessionId);

    const assessment = session.assessment;
    const isCorrect = userAnswer === correctAnswer;

    // Record evidence
    assessment.evidence.push({
      level,
      cluster,
      correct: isCorrect,
      userAnswer,
    });

    // Check progression rules
    const levelEvidence = assessment.evidence.filter((e) => e.level === level);
    const correctCount = levelEvidence.filter((e) => e.correct).length;
    const wrongCount = levelEvidence.length - correctCount;

    let nextAction = "continue";
    let nextLevel = level;

    if (levelEvidence.length === 2) {
      if (correctCount >= 1) {
        // Advance to next level
        if (level === "L1") {
          nextLevel = "L2";
        } else if (level === "L2") {
          nextLevel = "L3";
        } else {
          // Completed all levels
          session.currentStep = "report";
          nextAction = "complete";
        }
      } else if (assessment.attempts === 0) {
        // Both wrong, retry once
        assessment.attempts = 1;
        assessment.askedClusters[level] = [];
        assessment.currentQuestionCount = 0;
        nextAction = "retry";
      } else {
        // Failed retry, stop assessment
        session.currentStep = "report";
        nextAction = "stop";
      }
    }

    // Update session
    if (nextLevel !== level) {
      assessment.currentLevel = nextLevel;
      assessment.attempts = 0;
      assessment.currentQuestionCount = 0;
    }

    res.json({
      correct: isCorrect,
      nextAction,
      nextLevel,
      message: isCorrect ? "Correct!" : "Incorrect",
      canProceed: nextAction !== "stop",
    });
  } catch (error) {
    console.error("Answer processing error:", error);
    res.status(500).json({ error: "Server error processing answer" });
  }
});

// POST /api/report - Generate final report
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);

    if (session.currentStep !== "report") {
      return res.status(400).json({ error: "Not in report phase" });
    }

    // Calculate strengths and gaps
    const evidence = session.assessment.evidence;
    const strengths = [];
    const gaps = [];

    // Add strengths from correct answers
    evidence.forEach((e) => {
      if (e.correct && !strengths.includes(e.cluster)) {
        strengths.push(e.cluster);
      }
    });

    // Add gaps from wrong answers
    evidence.forEach((e) => {
      if (!e.correct && !gaps.includes(e.cluster)) {
        gaps.push(e.cluster);
      }
    });

    // Add unvisited higher level clusters as gaps
    const highestLevel = session.assessment.currentLevel;
    const levels = ["L1", "L2", "L3"];
    const currentLevelIndex = levels.indexOf(highestLevel);

    for (let i = currentLevelIndex + 1; i < levels.length; i++) {
      const level = levels[i];
      LEVELS[level].clusters.forEach((cluster) => {
        if (!gaps.includes(cluster)) {
          gaps.push(cluster);
        }
      });
    }

    // Generate report using OpenAI
    const systemPrompt = getSystemPrompt({
      lang: session.lang,
      profile: session.intake,
      evidence,
      strengths,
      gaps,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Generate the final assessment report based on the evidence provided",
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const report = JSON.parse(response.choices[0].message.content);
    session.report = report;
    session.finished = true;

    res.json(report);
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({ error: "Server error generating report" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

// SPA fallback - must be last route (serves index.html for all non-API routes)
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../public/index.html"));
});

const port = parseInt(process.env.PORT || "5000", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
