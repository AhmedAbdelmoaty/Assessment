import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import fs from "fs";
import { getQuestionPromptSingle } from "./prompts/system.js";
import { getFinalReportPrompt } from "./prompts/report.js";
import { humanizeCluster, toDisplayList } from "./shared/topicDisplayMap.js";
import { getTeachingSystemPrompt } from "./prompts/teach.js";

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

// IDs لمساعد الشرح (Assistants + File Search)
const TEACH_ASSISTANT_ID = process.env.TEACH_ASSISTANT_ID || "";
const TEACH_VECTOR_STORE_ID = process.env.TEACH_VECTOR_STORE_ID || "";

/* =========================
   Helpers: logging + guards
   ========================= */

// اجعل اللوجات تظهر فقط لو DEBUG_TEACH=1 (أو "true")
function logTeach(tag, payload) {
  const dbg = (process.env.DEBUG_TEACH || "").toString().toLowerCase();
  if (dbg === "1" || dbg === "true" || dbg === "yes") {
    try { console.log(`[teach:${tag}]`, payload); } catch {}
  }
}

function ensureTeachingState(sess) {
  if (!sess.teaching) {
    sess.teaching = {
      mode: "idle",
      lang: "ar",
      topics_queue: [],
      current_topic_index: 0,
      transcript: [],
      assistant: { threadId: null },
      profileContext: {}
    };
  }
  return sess.teaching;
}

function pushTranscript(session, item) {
  session.teaching = session.teaching || {};
  session.teaching.transcript = session.teaching.transcript || [];
  session.teaching.transcript.push({
    from: item.from, // "user" | "tutor"
    text: String(item.text || "").slice(0, 4000)
  });
  if (session.teaching.transcript.length > 8) {
    session.teaching.transcript = session.teaching.transcript.slice(-8);
  }
}

// محتفظين بيها كما هي (حتى لو مش مستخدمة حاليًا) لضمان عدم كسر أي تكامل لاحق
function transcriptToMessages(transcript = []) {
  return transcript.map(t => {
    const role = t.from === "user" ? "user" : "assistant";
    return { role, content: t.text };
  });
}

// حراس قوية قبل أي retrieve
function assertIds(threadId, runId) {
  if (!threadId || !runId) {
    throw new Error(`Missing IDs — threadId=${threadId}, runId=${runId}`);
  }
  if (!String(threadId).startsWith("thread_")) {
    throw new Error(`Bad threadId: ${threadId}`);
  }
  if (!String(runId).startsWith("run_")) {
    throw new Error(`Bad runId: ${runId}`);
  }
}

async function safeRetrieveRun(threadId, runId) {
  assertIds(threadId, runId);
  logTeach("poll", { threadId, runId });
  // ✅ توقيع v6: أول باراميتر runId، والثاني كائن فيه thread_id
  return openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
}

async function pollRunUntilDone(threadId, runId, { maxTries = 40, sleepMs = 900 } = {}) {
  let last = null;
  for (let i = 0; i < maxTries; i++) {
    last = await safeRetrieveRun(threadId, runId);
    const st = last?.status || "unknown";
    if (!["queued", "in_progress"].includes(st)) return last;
    await new Promise(r => setTimeout(r, sleepMs));
  }
  throw new Error("Run polling timeout");
}

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

// ⚠️ كتالوج الـintake
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
  L1: {
    clusters: [
      "central_tendency_foundations",      // Central Tendency (Mean/Median/Mode)
      "dispersion_boxplot_foundations",    // Dispersion & Box Plot (Range/Variance/SD)
    ],
  },
  L2: {
    clusters: [
      "distribution_shape_normality",      // Distribution Shape & Normality
      "data_quality_outliers_iqr",         // Data Quality & Outliers (IQR, LB/UB)
    ],
  },
  L3: {
    clusters: [
      "correlation_bivariate_patterns",    // Correlation & Bivariate Patterns
      "non_normal_skew_kurtosis_z",        // Non-Normal Data (Skewness/Kurtosis/Z-Scores)
    ],
  },
};

// ===== Build full teaching queue from evidence + fill missing topics =====
function buildTeachingQueueFromEvidence(session, lang = "ar") {
  const A = session.assessment || { evidence: [], currentLevel: "L1" };
  const ev = Array.isArray(A.evidence) ? A.evidence : [];

  // 1) أولاً: من الـ evidence بالترتيب الحقيقي للأسئلة
  const queue = [];
  const seen = new Set();
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (!e || !e.cluster) continue;
    const display = humanizeCluster(e.cluster, lang);
    const kind = e.correct ? "strength" : "gap";

    // تجنّب تكرار نفس الكلاستر ورا بعض مباشرةً
    const prev = queue[queue.length - 1];
    if (prev && prev.display === display) continue;

    queue.push({ display, kind });
    seen.add(e.cluster);
  }

  // 2) بعد كده: أي موضوعات ما ظهرتش في الأسئلة تتضاف كـ gap (بالترتيب المنطقي للمستويات)
  const catalogOrder = [
    ...((LEVELS.L1?.clusters) || []),
    ...((LEVELS.L2?.clusters) || []),
    ...((LEVELS.L3?.clusters) || []),
  ];
  for (const clusterKey of catalogOrder) {
    if (!seen.has(clusterKey)) {
      const display = humanizeCluster(clusterKey, lang);
      // برضه تجنّب تكرار الاسم لو آخر عنصر نفس الـ display (لو حصل توافق أسماء)
      const prev = queue[queue.length - 1];
      if (prev && prev.display === display) continue;
      queue.push({ display, kind: "gap" });
    }
  }

  return queue;
}

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
        questionIndexInAttempt: 1,
        usedClustersCurrentAttempt: [],
        currentQuestion: null,
        stemsCurrentAttempt: [],
        lastAttemptStems: {},
      },
      teaching: {
        mode: "idle",
        lang: "ar",
        topics_queue: [],
        current_topic_index: 0,
        transcript: [],
        assistant: { threadId: null }
      },
      finished: false,
      report: null,
    });
  }
  return sessions.get(sessionId);
}

// Validation
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

    if ((answer === undefined || answer === null) && !session.openingShown) {
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

    if (!q || q.kind !== "question" || !Array.isArray(q.choices) || typeof q.correct_index !== "number") {
      console.error("Invalid question schema from model:", q);
      return res.status(500).json({ error: "Invalid question format from model" });
    }

    const { newChoices, newCorrectIndex } = shuffleChoicesAndUpdateCorrectIndex(q.choices, q.correct_index);

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

    if (attempt_type === "first") {
      A.stemsCurrentAttempt = A.stemsCurrentAttempt || [];
      A.stemsCurrentAttempt.push(current.prompt);
    }

    if (question_index === 1 && current.cluster) {
      if (!A.usedClustersCurrentAttempt.includes(current.cluster)) {
        A.usedClustersCurrentAttempt.push(current.cluster);
      }
    }

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

// -------- Assessment: submit answer --------
app.post("/api/assess/answer", async (req, res) => {
  try {
    const { sessionId, userChoiceIndex } = req.body;
    const session = getSession(sessionId);
    const A = session.assessment;

    if (session.currentStep !== "assessment" || !A.currentQuestion) {
      return res.status(400).json({ error: "No active question" });
    }

    const q = A.currentQuestion;

    const isCorrect =
      Number.isInteger(userChoiceIndex) &&
      userChoiceIndex >= 0 &&
      userChoiceIndex < (q.choices?.length || 0) &&
      userChoiceIndex === q.correct_index;

    A.evidence.push({
      level: q.level,
      cluster: q.cluster,
      correct: isCorrect,
      qid: q.qid,
    });

    let nextAction = "continue";

    if (A.questionIndexInAttempt === 1) {
      A.questionIndexInAttempt = 2;
      nextAction = "continue";
    } else {
      const lastTwo = A.evidence.filter(e => e.level === A.currentLevel).slice(-2);
      const correctCount = lastTwo.filter(e => e.correct).length;
      const wrongCount = 2 - correctCount;

      if (wrongCount === 2) {
        if (A.attempts === 0) {
          A.attempts = 1;
          A.lastAttemptStems[A.currentLevel] = Array.isArray(A.stemsCurrentAttempt) ? [...A.stemsCurrentAttempt] : [];
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "retry_same_level";
        } else {
          session.currentStep = "report";
          nextAction = "stop";
        }
      } else {
        if (A.currentLevel === "L1") A.currentLevel = "L2";
        else if (A.currentLevel === "L2") A.currentLevel = "L3";
        else {
          session.currentStep = "report";
          nextAction = "complete";
        }

        if (session.currentStep !== "report") {
          A.attempts = 0;
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "advance";
        }
      }
    }

    A.currentQuestion = null;

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

// -------- Final report --------
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    const lang = session.lang || "en";

    const A = session.assessment || { evidence: [], currentLevel: "L1" };
    const evidence = Array.isArray(A.evidence) ? A.evidence : [];

    const strengths = Array.from(new Set(evidence.filter(e => e.correct).map(e => e.cluster)));
    const gaps = Array.from(new Set(evidence.filter(e => !e.correct).map(e => e.cluster)));

    const levelOrder = ["L1", "L2", "L3"];
    const highestReached = A.currentLevel || "L1";
    const idx = levelOrder.indexOf(highestReached);
    for (let i = idx + 1; i < levelOrder.length; i++) {
      for (const c of (LEVELS[levelOrder[i]]?.clusters || [])) {
        if (!gaps.includes(c)) gaps.push(c);
      }
    }

    const strengths_display = strengths.map(c => humanizeCluster(c, lang));
    const gaps_display = gaps.map(c => humanizeCluster(c, lang));

    const total_questions = evidence.length;
    const total_correct = evidence.filter(e => e.correct).length;
    const summary_counts = {
      total_questions,
      total_correct,
      total_wrong: Math.max(0, total_questions - total_correct),
    };

    const profile = {
      job_nature: session.intake?.job_nature || "",
      experience_years_band: session.intake?.experience_years_band || "",
      job_title_exact: session.intake?.job_title_exact || "",
      sector: session.intake?.sector || "",
      learning_reason: session.intake?.learning_reason || "",
    };

    const localFallback = (() => {
      const intro = lang === "ar"
        ? "نتائج تقييمك جاهزة. سنعرض موجزًا مختصرًا."
        : "Your assessment results are ready. Here’s a short summary.";
      const strengthsLine = strengths_display.length
        ? (lang === "ar"
            ? `نقاط قوة ظهرت: ${strengths_display.join("، ")}.`
            : `Strengths noticed: ${strengths_display.join(", ")}.`)
        : (lang === "ar" ? "لا توجد نقاط قوة واضحة حتى الآن." : "No clear strengths yet.");
      const gapsLine = gaps_display.length
        ? (lang === "ar"
            ? `تحتاج لتعزيز في: ${gaps_display.join("، ")}.`
            : `Areas to reinforce: ${gaps_display.join(", ")}.`)
        : (lang === "ar" ? "لا توجد فجوات واضحة." : "No clear gaps.");
      const cta = lang === "ar"
        ? "تحب أشرح لك هذه النقاط خطوة بخطوة الآن؟"
        : "Would you like me to explain these points step-by-step now?";
      return `${intro}\n${strengthsLine}\n${gapsLine}\n${cta}`;
    })();

    let narrative = "";
    try {
      const systemPrompt = getFinalReportPrompt({
        lang,
        profile,
        strengths_display,
        gaps_display,
        evidence: evidence.map(e => ({
          level: e.level,
          cluster_code: e.cluster,
          cluster_display: humanizeCluster(e.cluster, lang),
          correct: !!e.correct,
        })),
        summary_counts,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.2,
        top_p: 1,
        max_completion_tokens: 512,
      });

      narrative = completion?.choices?.[0]?.message?.content?.trim() || "";
      if (!narrative) {
        console.warn("[/api/report] Empty LLM narrative, using local fallback.");
      }
    } catch (llmErr) {
      console.error("[/api/report] LLM error:", {
        message: llmErr?.message,
        status: llmErr?.status || llmErr?.response?.status,
        data: llmErr?.response?.data,
        stack: llmErr?.stack,
      });
    }

    const report = {
      kind: "final_report",
      message: narrative || localFallback,
      strengths,
      gaps,
      strengths_display,
      gaps_display,
      stats_level: (() => {
        if (total_correct >= 5) return "Advanced";
        if (total_correct >= 3 && total_questions >= 4) return "Intermediate";
        return "Beginner";
      })(),
    };

    session.report = report;
    session.finished = true;
    session.currentStep = "report";

    return res.json(report);
  } catch (err) {
    console.error("Report generation fatal error:", err);
    return res.status(200).json({
      kind: "final_report",
      message:
        (session?.lang || "en") === "ar"
          ? "نتائج تقييمك جاهزة بصورة مبسطة."
          : "Your assessment results are ready in a simplified form.",
      strengths: [],
      gaps: [],
      strengths_display: [],
      gaps_display: [],
      stats_level: "Beginner",
    });
  }
});

/* =========================
   Teaching: start (data-only)
   ========================= */
app.post("/api/teach/start", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = getSession(sessionId);
    const teaching = ensureTeachingState(session);
    teaching.lang = session.lang || teaching.lang || "ar";

    // اجلب الموضوعات من التقرير (نقاط قوة وضعف بصيغة العرض البشرية)
    const gapsDisplay = Array.isArray(session?.report?.gaps_display) ? session.report.gaps_display : [];
    const strengthsDisplay = Array.isArray(session?.report?.strengths_display) ? session.report.strengths_display : [];

    if (!gapsDisplay.length && !strengthsDisplay.length) {
      return res.status(400).json({
        error: true,
        message: (session.lang === "ar") ? "لا توجد مواضيع للشرح حاليًا." : "No topics to teach right now."
      });
    }

    // إن لم تكن قائمة مرتّبة مسبقًا، ابنِ قائمة "منهجية" بنفس المواضيع الواردة في التقرير فقط
    if (!Array.isArray(teaching.topics_queue) || !teaching.topics_queue.length) {
      const langForDisplay = teaching.lang || session.lang || "ar";

      // 1) ابني ترتيب المنهج كأسماء "بشرية" بنفس لغة الجلسة
      const canonicalKeys = [
        ...((LEVELS.L1?.clusters) || []),
        ...((LEVELS.L2?.clusters) || []),
        ...((LEVELS.L3?.clusters) || []),
      ];
      const canonicalDisplays = canonicalKeys.map(k => humanizeCluster(k, langForDisplay));

      // 2) جهّز lookup سريع من القوائم القادمة من التقرير (من غير تعديل)
      const S = Array.isArray(strengthsDisplay) ? strengthsDisplay : [];
      const G = Array.isArray(gapsDisplay) ? gapsDisplay : [];
      const setS = new Set(S);
      const setG = new Set(G);

      // 3) مرّ على المنهج بالترتيب: لو الموضوع موجود في strengths → ادفعه كـ strength،
      //    وإلا لو موجود في gaps → ادفعه كـ gap. لا تضف أي موضوع غير موجود في التقرير.
      const ordered = [];
      for (const disp of canonicalDisplays) {
        if (setS.has(disp)) {
          ordered.push({ display: disp, kind: "strength" });
          continue;
        }
        if (setG.has(disp)) {
          ordered.push({ display: disp, kind: "gap" });
          continue;
        }
      }

      teaching.topics_queue = ordered;
    }


    teaching.mode = "active";
    teaching.current_topic_index = 0;
    teaching.transcript = teaching.transcript || [];

    // اجمع سياق المستخدم من الـintake فقط (بيانات خام—لا تعليمات)
    teaching.profileContext = {
      job_nature: session.intake?.job_nature || "",
      experience_years_band: session.intake?.experience_years_band || "",
      job_title_exact: session.intake?.job_title_exact || "",
      sector: session.intake?.sector || "",
      learning_reason: session.intake?.learning_reason || "",
    };

    const first = teaching.topics_queue[0] || null;
    if (!first) {
      return res.status(400).json({
        error: true,
        message: (session.lang === "ar") ? "لا توجد مواضيع للشرح." : "No topics to teach."
      });
    }

    logTeach("start.data", { sessionId, lang: teaching.lang, first });

    if (TEACH_ASSISTANT_ID && TEACH_VECTOR_STORE_ID) {
      // إنشاء Thread مرة واحدة
      if (!teaching.assistant?.threadId) {
        const createdThread = await openai.beta.threads.create();
        const threadId = createdThread?.id;
        if (!threadId) throw new Error("Failed to create thread");
        teaching.assistant.threadId = threadId;
        logTeach("thread.created", { threadId });
      }
      const threadId = teaching.assistant.threadId;

      // رسالة افتتاحية "بيانات فقط"
      const topicsLine = teaching.topics_queue.map((t, i) => `${i + 1}) ${t.display} [${t.kind}]`).join(" | ");
      const openingMsg = (teaching.lang === "ar")
        ? [
            `سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`,
            `الموضوعات بالترتيب: ${topicsLine}`,
            `ابدأ بالموضوع الأول: "${first.display}" (النوع: ${first.kind}).`
          ].join("\n")
        : [
            `Profile context: ${JSON.stringify(teaching.profileContext || {})}`,
            `Topics (ordered): ${topicsLine}`,
            `Start with: "${first.display}" (kind: ${first.kind}).`
          ].join("\n");

      await openai.beta.threads.messages.create(threadId, { role: "user", content: openingMsg });

      // تشغيل الـAssistant وفق نظام teach.js فقط
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: TEACH_ASSISTANT_ID,
        instructions: getTeachingSystemPrompt({ lang: teaching.lang })
      });
      const runId = run?.id;
      if (!runId) throw new Error("Failed to create run");
      logTeach("run.created", { threadId, runId });

      const finalRun = await pollRunUntilDone(threadId, runId, { maxTries: 40, sleepMs: 900 });

      if (finalRun.status === "completed") {
        const msgs = await openai.beta.threads.messages.list(threadId, { order: "desc", limit: 5 });
        const assistantMsg = msgs.data.find(m => m.role === "assistant");
        const text = (assistantMsg?.content?.[0]?.text?.value || "").trim();
        if (text) {
          pushTranscript(session, { from: "tutor", text });
          return res.json({ message: text });
        }
      }

      const fb = (session.lang === "ar")
        ? "هنبدأ شرح أول موضوع بشكل بسيط خطوة بخطوة."
        : "Let’s start with the first topic, step by step.";
      pushTranscript(session, { from: "tutor", text: fb });
      return res.json({ message: fb });
    }

    // ============= Fallback بدون Assistant =============
    const sys = getTeachingSystemPrompt({ lang: teaching.lang });
    const userSeed = (teaching.lang === "ar")
      ? [
          `سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`,
          `ابدأ بالموضوع: "${first.display}" (النوع: ${first.kind}).`
        ].join("\n")
      : [
          `Profile context: ${JSON.stringify(teaching.profileContext || {})}`,
          `Start with topic: "${first.display}" (kind: ${first.kind}).`
        ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userSeed }
      ],
      temperature: 0.2,
      top_p: 1,
      max_completion_tokens: 2200
    });
    const text = (completion?.choices?.[0]?.message?.content || "").trim();
    pushTranscript(session, { from: "tutor", text });
    return res.json({ message: text });

  } catch (err) {
    console.error("/api/teach/start error:", err?.message || err, err?.stack);
    return res.status(500).json({ error: true, message: "Teaching start failed." });
  }
});


/* =================================
   Teaching: user sends a chat message (data-only)
   ================================= */
app.post("/api/teach/message", async (req, res) => {
  try {
    const { sessionId, text, userMessage } = req.body || {};
    const userText = (text ?? userMessage ?? "").toString().trim();
    const session = getSession(sessionId);
    const teaching = ensureTeachingState(session);

    if (!userText) {
      return res.status(400).json({ error: true, message: "Empty message." });
    }
    if (teaching.mode !== "active") {
      logTeach("message.inactive", { sessionId });
      return res.status(400).json({
        error: true,
        message: (session.lang === "ar") ? "الشرح غير مفعّل حالياً." : "Teaching is not active right now."
      });
    }

    const lang = teaching.lang || session.lang || "ar";
    const topicsQueue = Array.isArray(teaching.topics_queue) ? teaching.topics_queue : [];
    const current = topicsQueue[teaching.current_topic_index || 0] || { display: "", kind: "gap" };
    const currentTopic = current.display || "";

    try { pushTranscript(session, { from: "user", text: userText }); } catch {}

    if (TEACH_ASSISTANT_ID && TEACH_VECTOR_STORE_ID) {
      if (!teaching.assistant?.threadId) {
        const createdThread = await openai.beta.threads.create();
        const threadId = createdThread?.id;
        if (!threadId) throw new Error("Failed to create Thread (no id)");
        teaching.assistant.threadId = threadId;
        logTeach("thread.created@message", { threadId });
      }

      const threadId = teaching.assistant.threadId;

      // Payload "بيانات فقط": بدون أي تذكيرات أسلوبية
      const userPayload = (lang === "ar")
        ? [
            `سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`,
            `الموضوع الحالي: "${current.display}" (النوع: ${current.kind}).`,
            `رسالة المتعلم: ${userText}`
          ].join("\n")
        : [
            `Profile context: ${JSON.stringify(teaching.profileContext || {})}`,
            `Current topic: "${current.display}" (kind: ${current.kind}).`,
            `Learner message: ${userText}`
          ].join("\n");

      await openai.beta.threads.messages.create(threadId, { role: "user", content: userPayload });

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: TEACH_ASSISTANT_ID,
        instructions: getTeachingSystemPrompt({ lang })
      });
      const runId = run?.id;
      if (!runId) throw new Error("Failed to create Run (no id)");
      logTeach("run.created@message", { threadId, runId });

      const finalRun = await pollRunUntilDone(threadId, runId, { maxTries: 40, sleepMs: 900 });

      if (finalRun.status === "completed") {
        const msgs = await openai.beta.threads.messages.list(threadId, { order: "desc", limit: 6 });
        const assistantMsg = msgs.data.find(m => m.role === "assistant");
        const reply = (assistantMsg?.content?.[0]?.text?.value || "").trim();
        if (reply) {
          try { pushTranscript(session, { from: "tutor", text: reply, topic: currentTopic }); } catch {}
          return res.json({ message: reply });
        }
      }

      const fb = (lang === "ar")
        ? "تمام، خلّيني أوضّحها خطوة خطوة."
        : "Okay, let me break it down step by step.";
      try { pushTranscript(session, { from: "tutor", text: fb, topic: currentTopic }); } catch {}
      return res.json({ message: fb });
    }

    // ============= Fallback بدون Assistant =============
    const sys = getTeachingSystemPrompt({ lang });
    const userTurn = (lang === "ar")
      ? [
          `سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`,
          `الموضوع الحالي: "${current.display}" (النوع: ${current.kind}).`,
          `رسالة المتعلم: ${userText}`
        ].join("\n")
      : [
          `Profile context: ${JSON.stringify(teaching.profileContext || {})}`,
          `Current topic: "${current.display}" (kind: ${current.kind}).`,
          `Learner message: ${userText}`
        ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userTurn }
      ],
      temperature: 0.2,
      top_p: 1,
      max_completion_tokens: 2000 // أطول قليلًا لتفادي الاختصار المخلّ
    });

    const reply = (completion?.choices?.[0]?.message?.content || "").trim();
    try { pushTranscript(session, { from: "tutor", text: reply, topic: currentTopic }); } catch {}
    return res.json({ message: reply });

  } catch (err) {
    console.error("/api/teach/message error:", err?.message || err, err?.stack);
    return res.status(500).json({ error: true, message: "Teaching message failed." });
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
