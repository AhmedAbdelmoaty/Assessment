import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";

// 🔹 البرومبت الجديد للأسئلة (Batch)
import { getQuestionPromptBatch } from "./prompts/system.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));

// In-memory session store
const sessions = new Map();

// OpenAI client (اترك الموديل كما هو مستخدمًا "gpt-5")
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

// Intake order & catalog (بدون تغيير جوهري)
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

// ⚠️ نحتفظ بنفس الكتالوج كما عندك (اختصرته هنا لتقليل الطول)
// يمكنك إبقاء INTAKE_CATALOG كما هو في نسختك السابقة تمامًا (لا حاجة لتغييره)
import fs from "fs";
const intakeCatalogPath = join(__dirname, "intake_catalog.cache.json");
let INTAKE_CATALOG;
try {
  // لو عايز تحتفظ بنفس الكائن كما في نسختك السابقة، استورده مباشرة بدل هذا
  INTAKE_CATALOG = JSON.parse(fs.readFileSync(intakeCatalogPath, "utf-8"));
} catch {
  // نسخة مصغرة للطوارئ لو ملف الكاش غير متوفر (يمكنك إزالته لو عندك الكائن الأصلي)
  INTAKE_CATALOG = {
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
    
    country: {
      type: "country",
      prompt: { en: "Which country do you live in?", ar: "في أي دولة تقيم؟" },
      options: {
        en: [
          "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh",
          "Belarus", "Belgium", "Bolivia", "Brazil", "Bulgaria", "Cambodia", "Canada", "Chile", "China", "Colombia",
          "Costa Rica", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia", "Finland", "France",
          "Georgia", "Germany", "Ghana", "Greece", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
          "Ireland", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania",
          "Luxembourg", "Malaysia", "Mexico", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman", "Pakistan",
          "Palestine", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Singapore",
          "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria",
          "Thailand", "Tunisia", "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Venezuela",
          "Vietnam", "Yemen"
        ],
        ar: [
          "أفغانستان", "ألبانيا", "الجزائر", "الأرجنتين", "أرمينيا", "أستراليا", "النمسا", "أذربيجان", "البحرين", "بنغلاديش",
          "بيلاروسيا", "بلجيكا", "بوليفيا", "البرازيل", "بلغاريا", "كمبوديا", "كندا", "تشيلي", "الصين", "كولومبيا",
          "كوستاريكا", "كرواتيا", "قبرص", "التشيك", "الدنمارك", "الإكوادور", "مصر", "إستونيا", "فنلندا", "فرنسا",
          "جورجيا", "ألمانيا", "غانا", "اليونان", "المجر", "آيسلندا", "الهند", "إندونيسيا", "إيران", "العراق",
          "أيرلندا", "إيطاليا", "اليابان", "الأردن", "كازاخستان", "كينيا", "الكويت", "لاتفيا", "لبنان", "ليتوانيا",
          "لوكسمبورغ", "ماليزيا", "المكسيك", "المغرب", "هولندا", "نيوزيلندا", "نيجيريا", "النرويج", "عُمان", "باكستان",
          "فلسطين", "بيرو", "الفلبين", "بولندا", "البرتغال", "قطر", "رومانيا", "روسيا", "السعودية", "سنغافورة",
          "سلوفاكيا", "سلوفينيا", "جنوب أفريقيا", "كوريا الجنوبية", "إسبانيا", "سريلانكا", "السودان", "السويد", "سويسرا", "سوريا",
          "تايلاند", "تونس", "تركيا", "أوكرانيا", "الإمارات", "بريطانيا", "الولايات المتحدة", "الأوروغواي", "فنزويلا",
          "فيتنام", "اليمن"
        ]
      }
    },
    age_band: {
      type: "chips",
      prompt: { en: "What is your age range?", ar: "ما هي فئتك العمرية؟" },
      options: {
        en: ["18–24", "25–34", "35–44", "45–54", "55+"],
        ar: ["18–24", "25–34", "35–44", "45–54", "55+"],
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
}

// مستويات وعناقيد (للتقارير فقط)
const LEVELS = {
  L1: {
    clusters: ["central_tendency_basics", "basic_spread_distribution_shape"],
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
      "correlation_vs_covariance",
      "skewness_kurtosis_diagnostics",
    ],
  },
};

// Initialize/get session
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
        attempts: 0, // 0=first attempt, 1=retry
        evidence: [], // { level, cluster, correct, qid }
        questionQueue: [], // holds a batch of 2 MCQs for the current level
        queueCursor: 0, // 0 -> first question; 1 -> second
        lastAttemptStems: {}, // { L1: ["stem1","stem2"], ... } to avoid verbatim repetition on retry
        answeredInCurrentAttempt: 0, // how many in current attempt (0..2)
      },
      finished: false,
      report: null,
    });
  }
  return sessions.get(sessionId);
}

// Validation (unchanged)
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
    const cleaned = value.toString().replace(/[\s\-()]/g, "");
    if (!/^\+?\d{7,15}$/.test(cleaned)) return false;
    return true;
  }
  return value && value.trim().length > 0;
}

// -------- Intake Flow --------
app.post("/api/intake/next", async (req, res) => {
  try {
    const { sessionId = randomUUID(), lang = "en", answer } = req.body;
    const session = getSession(sessionId);
    session.lang = lang;

    // If answer provided, validate/store
    if (answer !== undefined && answer !== null) {
      const currentStepKey = INTAKE_ORDER[session.intakeStepIndex];
      const stepConfig = INTAKE_CATALOG[currentStepKey];
      if (!validateIntakeInput(currentStepKey, answer)) {
        const errorMessage =
          stepConfig.validation_error?.[lang] ||
          (lang === "ar"
            ? "يرجى إدخال إجابة صحيحة"
            : "Please enter a valid answer");
        return res.json({ error: true, message: errorMessage });
      }
      session.intake[currentStepKey] = answer;
      session.intakeStepIndex++;
    }

    // Done?
    if (session.intakeStepIndex >= INTAKE_ORDER.length) {
      session.currentStep = "assessment";
      return res.json({
        done: true,
        message:
          lang === "ar"
            ? "شكرًا — خصصت التقييم وفق بياناتك. لنبدأ."
            : "Thanks — I've tailored your assessment based on your profile. Let's begin.",
      });
    }

    // Next step payload
    const nextStepKey = INTAKE_ORDER[session.intakeStepIndex];
    const nextStep = INTAKE_CATALOG[nextStepKey];
    return res.json({
      sessionId,
      stepKey: nextStepKey,
      type: nextStep.type,
      prompt: nextStep.prompt[lang],
      options: nextStep.options?.[lang] || null,
      lang,
    });
  } catch (err) {
    console.error("Intake error:", err);
    res
      .status(500)
      .json({ error: true, message: "Server error during intake" });
  }
});

// -------- Assessment: get next MCQ (serves 1 of the batch) --------
app.post("/api/assess/next", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (session.currentStep !== "assessment") {
      return res.status(400).json({ error: "Not in assessment phase" });
    }

    const A = session.assessment;

    // If queue empty or fully consumed -> fetch a new batch (two MCQs)
    const needNewBatch =
      A.questionQueue.length === 0 || A.queueCursor >= A.questionQueue.length;

    if (needNewBatch) {
      // 🔧 نجهّز بروفايل بالمفاتيح الصحيحة (تطابق intake)
      const profile = {
        job_nature: session.intake.job_nature || "",
        experience_years_band: session.intake.experience_years_band || "",
        job_title_exact: session.intake.job_title_exact || "",
        sector: session.intake.sector || "",
        learning_reason: session.intake.learning_reason || "",
      };

      const attempt_type = A.attempts === 0 ? "first" : "retry";
      const avoid_stems =
        attempt_type === "retry" ? A.lastAttemptStems[A.currentLevel] || [] : [];

      const systemPrompt = getQuestionPromptBatch({
        lang: session.lang,
        level: A.currentLevel,
        profile,
        attempt_type,
        avoid_stems,
      });

      // Call OpenAI - JSON output
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // غيّر الموديل لو حبيت
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.2, // التزام أعلى بالتعليمات
        top_p: 1,
        max_completion_tokens: 2048,
      });

      const batch = JSON.parse(response.choices[0].message.content);

      // Basic schema checks
      if (
        !batch ||
        batch.kind !== "question_batch" ||
        !Array.isArray(batch.items) ||
        batch.items.length !== 2
      ) {
        console.error("Invalid batch schema from model:", batch);
        return res.status(500).json({ error: "Invalid question batch from model" });
      }

      // Store queue & reset cursor
      A.questionQueue = batch.items.map((q, idx) => ({
        level: A.currentLevel,
        cluster: q.cluster,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        correct_index: q.correct_index, // ← بنحتاجه للمقارنة بالفهرس
        qid: `${A.currentLevel}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}-${idx}`,
      }));
      A.queueCursor = 0;
      A.answeredInCurrentAttempt = 0;
    }

    // Serve current question
    const current = A.questionQueue[A.queueCursor];

    // 🧠 احفظ السؤال الحالي في الجلسة (للاحتياط/المرجعية)
    A.currentQuestion = {
      level: current.level,
      cluster: current.cluster,
      prompt: current.prompt,
      choices: current.choices,
      correct_index: current.correct_index,
      difficulty: current.difficulty || null,
      qid: current.qid,
    };

    // لا نكشف الإجابة الصحيحة للفرونت
    const mcqPayload = {
      kind: "question",
      level: current.level,
      cluster: current.cluster,
      prompt: current.prompt,
      choices: current.choices, // خيارات نصية بلا A/B — الواجهة تضيف الحروف بصريًا
      correct_answer: "__hidden__", // متروك Placeholder حفاظًا على توافق الواجهة الحالي
      rationale: "", // لا تفسيرات
      questionNumber: A.queueCursor + 1,
      totalQuestions: 2,
    };

    return res.json(mcqPayload);
  } catch (err) {
    console.error("Assessment next error:", err);
    res.status(500).json({ error: "Server error during assessment" });
  }
});

// -------- Assessment: submit answer (compare by index & progress silently) --------
app.post("/api/assess/answer", async (req, res) => {
  try {
    // 👇 الواجهة الآن ترسل فهرس الاختيار
    const { sessionId, userChoiceIndex } = req.body;
    const session = getSession(sessionId);
    const A = session.assessment;

    if (session.currentStep !== "assessment" || A.questionQueue.length === 0) {
      return res.status(400).json({ error: "No active question" });
    }

    // السؤال الحالي من الطابور بحسب المؤشر
    const current = A.questionQueue[A.queueCursor];

    // ✅ مقارنة رقمية دقيقة: الفهرس القادم من الفرونت مقابل correct_index
    const isCorrect =
      Number.isInteger(userChoiceIndex) &&
      userChoiceIndex >= 0 &&
      userChoiceIndex < (current.choices?.length || 0) &&
      userChoiceIndex === current.correct_index;

    // سجل الدليل
    A.evidence.push({
      level: current.level,
      cluster: current.cluster,
      correct: isCorrect,
      qid: current.qid,
    });

    // تقدّم داخل الطابور والمحاولة
    A.queueCursor += 1;
    A.answeredInCurrentAttempt += 1;

    let nextAction = "continue";

    // لو جاوب السؤالين في هذه المحاولة، قرّر التقدّم/الإعادة
    if (A.answeredInCurrentAttempt >= 2 || A.queueCursor >= A.questionQueue.length) {
      const lastTwo = A.evidence
        .filter((e) => e.level === A.currentLevel)
        .slice(-2);
      const correctCount = lastTwo.filter((e) => e.correct).length;
      const wrongCount = 2 - correctCount;

      // حفظ stems آخر محاولة (لتجنّب تكرار حرفي في retry فقط)
      A.lastAttemptStems[A.currentLevel] = (A.questionQueue || []).map((q) => q.prompt);

      if (wrongCount === 2) {
        if (A.attempts === 0) {
          // إعادة مرة واحدة في نفس المستوى
          A.attempts = 1;
          A.questionQueue = [];
          A.queueCursor = 0;
          A.answeredInCurrentAttempt = 0;
          nextAction = "retry_same_level";
        } else {
          // فشل الإعادة → إنهاء
          session.currentStep = "report";
          nextAction = "stop";
        }
      } else {
        // 2 صح أو 1 صح + 1 غلط ⇒ تقدّم
        if (A.currentLevel === "L1") A.currentLevel = "L2";
        else if (A.currentLevel === "L2") A.currentLevel = "L3";
        else {
          // L3 انتهى
          session.currentStep = "report";
          nextAction = "complete";
        }

        // صفّر حالة المستوى التالي
        if (session.currentStep !== "report") {
          A.attempts = 0;
          A.questionQueue = [];
          A.queueCursor = 0;
          A.answeredInCurrentAttempt = 0;
          nextAction = "advance";
        }
      }
    }

    // لا نرسل “صح/غلط” أو تفسير للمستخدم
    return res.json({
      correct: isCorrect, // لو الواجهة لسه بتقرأه، ماشي؛ لكن ما نعرضش رسالة
      nextAction,
      message: "",
      canProceed: nextAction !== "stop",
    });
  } catch (err) {
    console.error("Answer processing error:", err);
    res.status(500).json({ error: "Server error processing answer" });
  }
});

// -------- Final report (بسيط بدون موديل حالياً) --------
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    const lang = session.lang || "en";
    if (session.currentStep !== "report") {
      return res.status(400).json({ error: "Not in report phase" });
    }

    const evidence = session.assessment.evidence;
    // strengths: clusters answered correctly at least once
    const strengths = Array.from(
      new Set(evidence.filter((e) => e.correct).map((e) => e.cluster)),
    );
    // gaps: clusters answered wrong at least once
    const gaps = Array.from(
      new Set(evidence.filter((e) => !e.correct).map((e) => e.cluster)),
    );

    // Add unvisited higher-level clusters as gaps
    const levelOrder = ["L1", "L2", "L3"];
    const highestReached = session.assessment.currentLevel;
    const idx = levelOrder.indexOf(highestReached);
    for (let i = idx + 1; i < levelOrder.length; i++) {
      for (const c of LEVELS[levelOrder[i]].clusters) {
        if (!gaps.includes(c)) gaps.push(c);
      }
    }

    // Determine overall level
    let stats_level = "Beginner";
    const correctTotal = evidence.filter((e) => e.correct).length;
    const total = evidence.length;
    if (correctTotal >= 3 && total >= 4) stats_level = "Intermediate";
    if (correctTotal >= 5) stats_level = "Advanced";

    const enMsg = "Nice work—here are your descriptive statistics results.";
    const arMsg = "عمل جيّد — إليك نتائجك في الإحصاء الوصفي.";

    const report = {
      kind: "final_report",
      message: lang === "ar" ? arMsg : enMsg,
      strengths,
      gaps,
      stats_level,
    };

    session.report = report;
    session.finished = true;
    return res.json(report);
  } catch (err) {
    console.error("Report generation error:", err);
    res.status(500).json({ error: "Server error generating report" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../public/index.html"));
});

const port = parseInt(process.env.PORT || "5000", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
