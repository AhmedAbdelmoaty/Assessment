import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import fs from "fs";

// 🔹 استخدم دالة السؤال الواحد من system.js
import { getQuestionPromptSingle } from "./prompts/system.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));

// In-memory session store
const sessions = new Map();

// OpenAI client
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

// Intake order & opening
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
const INTAKE_OPENING = {
  ar: "أهلاً 👋 قبل ما نبدأ، هحتاج منك بعض التفاصيل البسيطة علشان نخصّص الاسئلة حسب خبرتك وهدفك. هنكملها خطوة بخطوة",
  en: "Hi 👋 Before we start, I’ll need a few quick details so I can tailor the questions to your experience and goals. We’ll go step by step."
};

// ⚠️ كتالوج الـintake (كما أرسلته)
const intakeCatalogPath = join(__dirname, "intake_catalog.cache.json");
let INTAKE_CATALOG;
try {
  INTAKE_CATALOG = JSON.parse(fs.readFileSync(intakeCatalogPath, "utf-8"));
} catch {
  INTAKE_CATALOG = {
    name_full: {
      type: 'text',
      prompt: { en: "What’s your full name?", ar: "ممكن تكتب اسمك الكامل؟" },
      validation_error: { en: "Please enter your full name.", ar: "من فضلك اكتب اسمك كامل." }
    },
    email: {
      type: 'text',
      prompt: { en: "Could you enter your email address?", ar: "ممكن تدخل بريدك الإلكتروني؟" },
      validation_error: { en: "That email doesn’t look valid. Please try again.", ar: "البريد الالكتروني مش صحيح ممكن تكتبه مرة تانيه" }
    },
    phone_number: {
      type: 'text',
      prompt: { en: "What’s your mobile number?", ar: "رقم موبايلك كام؟" },
      validation_error: { en: "Phone number isn’t valid. Digits, spaces and an optional + are allowed.", ar: "رقم الموبايل مش واضح. مسموح أرقام ومسافات و+" }
    },
    country: {
      type: "country",
      prompt: { en: "Which country are you based in?", ar: "من أي دولة بتكلّمنا؟" },
      options: {
        en: [
          "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Brazil","Bulgaria","Cambodia","Canada","Chile","China","Colombia","Costa Rica","Croatia","Cyprus","Czech Republic","Denmark","Ecuador","Egypt","Estonia","Finland","France","Georgia","Germany","Ghana","Greece","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Italy","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Latvia","Lebanon","Lithuania","Luxembourg","Malaysia","Mexico","Morocco","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Palestine","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Thailand","Tunisia","Turkey","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Venezuela","Vietnam","Yemen"
        ],
        ar: [
          "أفغانستان","ألبانيا","الجزائر","الأرجنتين","أرمينيا","أستراليا","النمسا","أذربيجان","البحرين","بنغلاديش","بيلاروسيا","بلجيكا","بوليفيا","البرازيل","بلغاريا","كمبوديا","كندا","تشيلي","الصين","كولومبيا","كوستاريكا","كرواتيا","قبرص","التشيك","الدنمارك","الإكوادور","مصر","إستونيا","فنلندا","فرنسا","جورجيا","ألمانيا","غانا","اليونان","المجر","آيسلندا","الهند","إندونيسيا","إيران","العراق","أيرلندا","إيطاليا","اليابان","الأردن","كازاخستان","كينيا","الكويت","لاتفيا","لبنان","ليتوانيا","لوكسمبورغ","ماليزيا","المكسيك","المغرب","هولندا","نيوزيلندا","نيجيريا","النرويج","عُمان","باكستان","فلسطين","بيرو","الفلبين","بولندا","البرتغال","قطر","رومانيا","روسيا","السعودية","سنغافورة","سلوفاكيا","سلوفينيا","جنوب أفريقيا","كوريا الجنوبية","إسبانيا","سريلانكا","السودان","السويد","سويسرا","سوريا","تايلاند","تونس","تركيا","أوكرانيا","الإمارات","بريطانيا","الولايات المتحدة","الأوروغواي","فنزويلا","فيتنام","اليمن"
        ]
      }
    },
    age_band: {
      type: "chips",
      prompt: { en: "Pick your age range:", ar: "اختار فئتك العمرية:" },
      options: { en: ["18–24","25–34","35–44","45–54","55+"], ar: ["18–24","25–34","35–44","45–54","55+"] }
    },
    job_nature: {
      type: "chips",
      prompt: { en: "Choose your department or nature of work:", ar: "اختار طبيعة عملك او القسم الذي تعمل به:" },
      options: {
        en: ["Accounting/Finance","Sales","Marketing","Operations","HR","IT/Data","Customer Support","Product/Engineering","Supply Chain/Logistics","Freelance/Consulting","Other"],
        ar: ["المالية/المحاسبة","المبيعات","التسويق","العمليات","الموارد البشرية","تقنية المعلومات/البيانات","خدمة العملاء","سلسلة الإمداد/اللوجستيات","عمل حر/استشارات","أخرى"]
      }
    },
    experience_years_band: {
      type: "chips",
      prompt: { en: "How many years of experience do you have?", ar: "عندك كام سنة خبرة ؟" },
      options: { en: ["<1y","1–2y","3–5y","6–9y","10–14y","15y+"], ar: ["أقل من سنة","1–2 سنوات","3–5 سنوات","6–9 سنوات","10–14 سنة","15+ سنة"] }
    },
    job_title_exact: { type: "text", prompt: { en: "Type your exact job title:", ar: "اكتب مسماك الوظيفي بشكل صحيح تماما" } },
    sector: {
      type: "chips",
      prompt: { en: "Choose your industry/sector:", ar: "اختار قطاع شغلك:" },
      options: {
        en: ["Real Estate","Retail/E-commerce","Banking/Finance","Telecom","Healthcare","Education","Manufacturing","Media/Advertising","Travel/Hospitality","Government/Public","Technology/Software","Other"],
        ar: ["العقارات","التجزئة/التجارة الإلكترونية","البنوك/المالية","الاتصالات","الرعاية الصحية","التعليم","التصنيع","الإعلام/الإعلان","السفر/الضيافة","الحكومي/العام","التقنية/البرمجيات","أخرى"]
      }
    },
    learning_reason: {
      type: "chips",
      prompt: { en: "Pick your main learning reason:", ar: "اختار سبب التعلّم الأساسي:" },
      options: { en: ["Career shift","Promotion","Skill refresh","Academic"], ar: ["تغيير مسار","ترقية","تحديث مهارة","أكاديمي"] }
    }
  };
}

// Levels (للتقرير فقط)
const LEVELS = {
  L1: { clusters: ["central_tendency_basics", "basic_spread_distribution_shape"] },
  L2: { clusters: ["quantiles_iqr_boxplots", "standard_deviation_variability", "grouped_summaries"] },
  L3: { clusters: ["z_scores_standardization", "correlation_vs_covariance", "skewness_kurtosis_diagnostics"] },
};

// Init/get session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      lang: "en",
      currentStep: "intake",
      intakeStepIndex: 0,
      openingShown: false,
      intake: {},
      assessment: {
        currentLevel: "L1",
        attempts: 0, // 0 first attempt, 1 retry
        evidence: [], // { level, cluster, correct, qid }
        // 🔄 منطق السؤال الواحد:
        questionIndexInAttempt: 1,         // 1 ثم 2 داخل نفس المحاولة
        usedClustersCurrentAttempt: [],    // لتجنب تكرار الكلاستر في سؤالَي المحاولة
        currentQuestion: null,             // آخر سؤال أُرسل للفرونت
        stemsCurrentAttempt: [],           // stems سؤالَي المحاولة الأولى لتغذية avoid_stems وقت الإعادة
        lastAttemptStems: {},              // { L1: ["stem1","stem2"], ... } تُملأ بعد إنهاء المحاولة الأولى
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

    if (answer !== undefined && answer !== null) {
      const currentStepKey = INTAKE_ORDER[session.intakeStepIndex];
      const stepConfig = INTAKE_CATALOG[currentStepKey];
      if (!validateIntakeInput(currentStepKey, answer)) {
        const errorMessage =
          stepConfig.validation_error?.[lang] ||
          (lang === "ar" ? "يرجى إدخال إجابة صحيحة" : "Please enter a valid answer");
        return res.json({ error: true, message: errorMessage });
      }
      session.intake[currentStepKey] = answer;
      session.intakeStepIndex++;
    }

    if (session.intakeStepIndex >= INTAKE_ORDER.length) {
      session.currentStep = "assessment";
      return res.json({
        done: true,
        message:
          lang === "ar"
            ? "تمام! كده عندي صورة أوضح عنك. هنبدأ أسئلة التقييم دلوقتي. الهدف مش نجاح ورسوب الهدف نفهم مستواك بدقة علشان نطلع لك خطة مناسبة"
            : "Great! I now have a clearer picture of you. We’ll start the assessment now. There’s no pass or fail — the goal is to gauge your level accurately so we can give you a suitable plan.",
      });
    }

    if ((answer === undefined || answer === null) && session.intakeStepIndex === 0 && !session.openingShown) {
      session.openingShown = true;
      return res.json({
        sessionId,
        stepKey: "__opening__",
        type: "info",
        prompt: INTAKE_OPENING[lang],
        lang,
        autoNext: true,
      });
    }

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
    res.status(500).json({ error: true, message: "Server error during intake" });
  }
});

// ===== Utilities =====
function shuffleChoicesAndUpdateCorrectIndex(choices, correctIndex) {
  const arr = choices.map((text, idx) => ({ text, idx }));
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const newChoices = arr.map(o => o.text);
  const newCorrectIndex = arr.findIndex(o => o.idx === correctIndex);
  return { newChoices, newCorrectIndex };
}

// -------- Assessment: get ONE MCQ --------
app.post("/api/assess/next", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (session.currentStep !== "assessment") {
      return res.status(400).json({ error: "Not in assessment phase" });
    }

    const A = session.assessment;

    // إعداد ملف التعريف بأسماء حقول صحيحة
    const profile = {
      job_nature: session.intake.job_nature || "",
      experience_years_band: session.intake.experience_years_band || "",
      job_title_exact: session.intake.job_title_exact || "",
      sector: session.intake.sector || "",
      learning_reason: session.intake.learning_reason || "",
    };

    const attempt_type = A.attempts === 0 ? "first" : "retry";
    const question_index = A.questionIndexInAttempt || 1;
    const used_clusters_current_attempt = A.usedClustersCurrentAttempt || [];
    const avoid_stems = attempt_type === "retry" ? (A.lastAttemptStems[A.currentLevel] || []) : [];

    // برومبت السؤال الواحد
    const systemPrompt = getQuestionPromptSingle({
      lang: session.lang,
      level: A.currentLevel,
      profile,
      attempt_type,
      question_index,
      used_clusters_current_attempt,
      avoid_stems,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      top_p: 1,
      max_completion_tokens: 2048,
    });

    const q = JSON.parse(response.choices[0].message.content);

    // تحقق بسيط من الـschema
    if (!q || q.kind !== "question" || !Array.isArray(q.choices) || typeof q.correct_index !== "number") {
      console.error("Invalid question schema from model:", q);
      return res.status(500).json({ error: "Invalid question format from model" });
    }

    // خلط الخيارات + تحديث correct_index
    const { newChoices, newCorrectIndex } = shuffleChoicesAndUpdateCorrectIndex(q.choices, q.correct_index);

    // حفظ السؤال الحالي في الجلسة
    const current = {
      level: q.level || A.currentLevel,
      cluster: q.cluster,
      difficulty: q.difficulty || (question_index === 1 ? "easy" : "harder"),
      prompt: q.prompt,
      choices: newChoices,
      correct_index: newCorrectIndex,
      qid: `${A.currentLevel}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    A.currentQuestion = current;

    // سجل الـstem داخل المحاولة الأولى فقط (لاستخدامه كـ avoid_stems لاحقًا عند الإعادة)
    if (attempt_type === "first") {
      A.stemsCurrentAttempt = A.stemsCurrentAttempt || [];
      A.stemsCurrentAttempt.push(current.prompt);
    }

    // في السؤال الأول فقط، امنع تكرار الكلاستر في نفس المحاولة بإضافته للقائمة
    if (question_index === 1 && current.cluster) {
      if (!A.usedClustersCurrentAttempt.includes(current.cluster)) {
        A.usedClustersCurrentAttempt.push(current.cluster);
      }
    }

    // أرسل للواجهة (لا نكشف الإجابة)
    const mcqPayload = {
      kind: "question",
      level: current.level,
      cluster: current.cluster,
      prompt: current.prompt,
      choices: current.choices,
      correct_answer: "__hidden__",
      rationale: "",
      questionNumber: question_index,
      totalQuestions: 2,
    };

    return res.json(mcqPayload);
  } catch (err) {
    console.error("Assessment next error:", err);
    res.status(500).json({ error: "Server error during assessment" });
  }
});

// -------- Assessment: submit answer (index vs index) --------
app.post("/api/assess/answer", async (req, res) => {
  try {
    const { sessionId, userChoiceIndex } = req.body;
    const session = getSession(sessionId);
    const A = session.assessment;

    if (session.currentStep !== "assessment" || !A.currentQuestion) {
      return res.status(400).json({ error: "No active question" });
    }

    const q = A.currentQuestion;

    // مقارنة رقمية دقيقة
    const isCorrect =
      Number.isInteger(userChoiceIndex) &&
      userChoiceIndex >= 0 &&
      userChoiceIndex < (q.choices?.length || 0) &&
      userChoiceIndex === q.correct_index;

    // سجل الدليل
    A.evidence.push({
      level: q.level,
      cluster: q.cluster,
      correct: isCorrect,
      qid: q.qid,
    });

    let nextAction = "continue";

    // تقدم داخل المحاولة
    if (A.questionIndexInAttempt === 1) {
      // لسه سؤال واحد فقط — هنطلب السؤال رقم 2
      A.questionIndexInAttempt = 2;
      nextAction = "continue";
    } else {
      // خلّصنا السؤالين — قرّر ترقّي/إعادة/توقف
      const lastTwo = A.evidence.filter(e => e.level === A.currentLevel).slice(-2);
      const correctCount = lastTwo.filter(e => e.correct).length;
      const wrongCount = 2 - correctCount;

      if (wrongCount === 2) {
        if (A.attempts === 0) {
          // إعادة مرة واحدة في نفس المستوى
          A.attempts = 1;
          // خزّن stems المحاولة الأولى للاستخدام كـ avoid_stems
          A.lastAttemptStems[A.currentLevel] = Array.isArray(A.stemsCurrentAttempt) ? [...A.stemsCurrentAttempt] : [];
          // صفّر سياق المحاولة الجديدة
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "retry_same_level";
        } else {
          // فشل الإعادة — أوقف وانتقل للتقرير
          session.currentStep = "report";
          nextAction = "stop";
        }
      } else {
        // 1 صح/1 غلط أو 2 صح ⇒ ترقّي
        if (A.currentLevel === "L1") A.currentLevel = "L2";
        else if (A.currentLevel === "L2") A.currentLevel = "L3";
        else {
          session.currentStep = "report";
          nextAction = "complete";
        }

        if (session.currentStep !== "report") {
          // صفّر كل مؤشرات المحاولة للمستوى الجديد
          A.attempts = 0;
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "advance";
        }
      }
    }

    // امسح السؤال الحالي بعد التقييم
    A.currentQuestion = null;

    // لا نرسل “صح/غلط” نصيًا؛ فقط نُعلم الواجهة بالخطوة التالية
    return res.json({
      correct: isCorrect,
      nextAction,
      message: "",
      canProceed: nextAction !== "stop",
    });
  } catch (err) {
    console.error("Answer processing error:", err);
    res.status(500).json({ error: "Server error processing answer" });
  }
});

// -------- Final report (same as before) --------
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    const lang = session.lang || "en";
    if (session.currentStep !== "report") {
      return res.status(400).json({ error: "Not in report phase" });
    }

    const evidence = session.assessment.evidence;
    const strengths = Array.from(new Set(evidence.filter(e => e.correct).map(e => e.cluster)));
    const gaps = Array.from(new Set(evidence.filter(e => !e.correct).map(e => e.cluster)));

    const levelOrder = ["L1", "L2", "L3"];
    const highestReached = session.assessment.currentLevel;
    const idx = levelOrder.indexOf(highestReached);
    for (let i = idx + 1; i < levelOrder.length; i++) {
      for (const c of LEVELS[levelOrder[i]].clusters) {
        if (!gaps.includes(c)) gaps.push(c);
      }
    }

    let stats_level = "Beginner";
    const correctTotal = evidence.filter(e => e.correct).length;
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
