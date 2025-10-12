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
// IDs لمساعد الشرح (Assistants + File Search). هنوفرهم من لوحة OpenAI بعد رفع الكتاب.
// لو فاضيين، السيرفر هيشتغل بـ fallback بدون كتاب.
const TEACH_ASSISTANT_ID = process.env.TEACH_ASSISTANT_ID || "";
const TEACH_VECTOR_STORE_ID = process.env.TEACH_VECTOR_STORE_ID || "";

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
      teaching: {
        mode: "idle",           // "idle" | "active"
        lang: "ar",             // هنضبطها من session.lang عند البدء
        topics_queue: [],       // gaps_display من التقرير
        current_topic_index: 0,
        transcript: [],         // هنحفظ آخر 6–8 رسائل (مستخدم/معلّم)
        assistant: {
          threadId: null        // Threads API لما نبدأ الشرح
        }
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
// نحفظ آخر 6–8 رسائل فقط (ذاكرة قريبة للشات)
function pushTranscript(session, item) {
  session.teaching = session.teaching || {};
  session.teaching.transcript = session.teaching.transcript || [];
  session.teaching.transcript.push({
    from: item.from,                           // "user" | "tutor"
    text: String(item.text || "").slice(0, 4000)
  });
  // احتفظ بآخر 8 فقط
  if (session.teaching.transcript.length > 8) {
    session.teaching.transcript = session.teaching.transcript.slice(-8);
  }
}

// نحول الـtranscript لرسائل نمط chat.completions (لـ fallback فقط)
function transcriptToMessages(transcript = []) {
  return transcript.map(t => {
    const role = t.from === "user" ? "user" : "assistant";
    return { role, content: t.text };
  });
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
      model: "gpt-4o-mini",
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

// -------- Final report (LLM-generated narrative + safe local fallback) --------
app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    const lang = session.lang || "en";

    // نبني التقرير مهما كانت الحالة، اعتمادًا على evidence المتاحة
    const A = session.assessment || { evidence: [], currentLevel: "L1" };
    const evidence = Array.isArray(A.evidence) ? A.evidence : [];

    // strengths & gaps من الدليل
    const strengths = Array.from(new Set(evidence.filter(e => e.correct).map(e => e.cluster)));
    const gaps = Array.from(new Set(evidence.filter(e => !e.correct).map(e => e.cluster)));

    // أضف مواضيع المستويات الأعلى كفرص نمو إن لم تُزر بعد
    const levelOrder = ["L1", "L2", "L3"];
    const highestReached = A.currentLevel || "L1";
    const idx = levelOrder.indexOf(highestReached);
    for (let i = idx + 1; i < levelOrder.length; i++) {
      for (const c of (LEVELS[levelOrder[i]]?.clusters || [])) {
        if (!gaps.includes(c)) gaps.push(c);
      }
    }

    // أسماء بشرية
    const strengths_display = strengths.map(c => humanizeCluster(c, lang));
    const gaps_display = gaps.map(c => humanizeCluster(c, lang));

    // عدّادات اختيارية
    const total_questions = evidence.length;
    const total_correct = evidence.filter(e => e.correct).length;
    const summary_counts = {
      total_questions,
      total_correct,
      total_wrong: Math.max(0, total_questions - total_correct),
    };

    // بروفايل للّغة
    const profile = {
      job_nature: session.intake?.job_nature || "",
      experience_years_band: session.intake?.experience_years_band || "",
      job_title_exact: session.intake?.job_title_exact || "",
      sector: session.intake?.sector || "",
      learning_reason: session.intake?.learning_reason || "",
    };

    // نص افتراضي محلي (fallback) لو فشل الLLM
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

    // حاول نداء LLM، ولو فشل نرجع fallback بدون 500
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
        model: "gpt-4o-mini",
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
      // سجّل كل التفاصيل الممكنة للمساعدة في التشخيص
      console.error("[/api/report] LLM error:", {
        message: llmErr?.message,
        status: llmErr?.status || llmErr?.response?.status,
        data: llmErr?.response?.data,
        stack: llmErr?.stack,
      });
      // لا نرمي 500 — نكمل بالFallback المحلي
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

    // حدّث حالة الجلسة
    session.report = report;
    session.finished = true;
    session.currentStep = "report";

    return res.json(report);
  } catch (err) {
    // في حالة خطأ غير متوقع تمامًا (قبل بناء الFallback)
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
app.post("/api/teach/start", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);

    // لازم التقرير يكون اتولد علشان نجيب gaps_display
    const gaps = Array.isArray(session?.report?.gaps_display) ? session.report.gaps_display : [];
    if (!gaps.length) {
      return res.status(400).json({
        error: true,
        message: (session.lang === "ar")
          ? "لا توجد مواضيع لبدء الشرح."
          : "No topics to teach right now."
      });
    }

    // جهّز وضع الشرح
    session.teaching.mode = "active";
    session.teaching.lang = session.lang || "ar";
    session.teaching.topics_queue = gaps.slice(); // نسخة من موضوعات الضعف
    session.teaching.current_topic_index = 0;
    session.teaching.transcript = [];

    // لو عندنا Assistant + Vector Store (الكتاب جاهز)
    if (TEACH_ASSISTANT_ID && TEACH_VECTOR_STORE_ID) {
      // 1) أنشئ Thread للمحادثة
      const thread = await openai.beta.threads.create();
      session.teaching.assistant.threadId = thread.id;

      // 2) ابعت رسالة افتتاحية للمساعد فيها اللغة + قائمة gaps + أول موضوع
      const firstTopic = session.teaching.topics_queue[0];
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: (session.teaching.lang === "ar")
          ? `اللغة: عربية. قائمة المواضيع: ${gaps.join(" | ")}. ابدأ بالموضوع الأول: "${firstTopic}". اتّبع دورك التعليمي بدقة.`
          : `Language: English. Topics: ${gaps.join(" | ")}. Start with the first topic: "${firstTopic}". Follow your teaching role.`
      });

      // 3) شغّل Run مربوط بالمساعد (المساعد مرتبط بالكتاب مسبقًا من لوحة OpenAI)
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: TEACH_ASSISTANT_ID,
        // نضيف الرول القوي أيضًا كتعليمات إضافية (احتياطيًا)
        instructions: getTeachingSystemPrompt({ lang: session.teaching.lang })
      });

      // 4) انتظر لحدّ ما الـRun يكمّل (polling بسيط)
      let runStatus;
      do {
        await new Promise(r => setTimeout(r, 800));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      } while (runStatus.status === "queued" || runStatus.status === "in_progress");

      // 5) لو اكتمل، جيب أحدث رسالة من المساعد
      if (runStatus.status === "completed") {
        const msgs = await openai.beta.threads.messages.list(thread.id, { order: "desc", limit: 1 });
        const assistantMsg = msgs.data.find(m => m.role === "assistant");
        const text = (assistantMsg?.content?.[0]?.text?.value || "").trim();
        pushTranscript(session, { from: "tutor", text });
        return res.json({ message: text });
      }

      // فشل/تجاوز — نبعث رسالة بسيطة
      return res.json({
        message: (session.lang === "ar")
          ? "هنبدأ شرح أول موضوع بشكل مبسّط. جاهز؟"
          : "Let’s begin with a simple explanation of the first topic. Ready?"
      });
    }

    // ===== Fallback: بدون Assistant (مافيش كتاب)، نستخدم chat.completions
    const sysPrompt = getTeachingSystemPrompt({ lang: session.teaching.lang });
    const firstTopic = session.teaching.topics_queue[0];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: (session.teaching.lang === "ar")
            ? `ابدأ بشرح "${firstTopic}" بأسلوب ودود ومبسّط.`
            : `Start explaining "${firstTopic}" in a friendly, simple way.` }
      ],
      temperature: 0.2,
      top_p: 1,
      max_completion_tokens: 400
    });

    const text = (completion?.choices?.[0]?.message?.content || "").trim();
    pushTranscript(session, { from: "tutor", text });
    return res.json({ message: text });

  } catch (err) {
    console.error("/api/teach/start error:", err);
    return res.status(500).json({ error: true, message: "Teaching start failed." });
  }
});
app.post("/api/teach/message", async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body;
    const session = getSession(sessionId);
    const T = session.teaching || {};

    if (T.mode !== "active") {
      return res.status(400).json({
        error: true,
        message: (session.lang === "ar") ? "ابدأ الشرح أولًا." : "Start teaching first."
      });
    }

    const lang = T.lang || session.lang || "ar";
    const sysPrompt = getTeachingSystemPrompt({ lang });
    const currentTopic = T.topics_queue[T.current_topic_index] || T.topics_queue[0] || "";

    // خزّن رسالة المستخدم في transcript
    pushTranscript(session, { from: "user", text: userMessage });

    // ==== Assistants (لو IDs موجودة وفي Thread قائم)
    if (TEACH_ASSISTANT_ID && T.assistant?.threadId) {
      const tid = T.assistant.threadId;

      // 1) أضف رسالة المستخدم للـThread
      await openai.beta.threads.messages.create(tid, { role: "user", content: userMessage });

      // 2) شغّل Run جديد
      const run = await openai.beta.threads.runs.create(tid, {
        assistant_id: TEACH_ASSISTANT_ID,
        instructions: [
          sysPrompt,
          (lang === "ar"
            ? `الموضوع الحالي: "${currentTopic}". تذكير: لا تسأل سؤال تحقق إلا إذا طلب المستخدم ذلك.`
            : `Current topic: "${currentTopic}". Reminder: do NOT ask a check question unless the user explicitly asked.`)
        ].join("\n\n")
      });

      // 3) انتظر انتهاء الـRun
      let runStatus;
      do {
        await new Promise(r => setTimeout(r, 800));
        runStatus = await openai.beta.threads.runs.retrieve(tid, run.id);
      } while (runStatus.status === "queued" || runStatus.status === "in_progress");

      if (runStatus.status !== "completed") {
        return res.json({
          message: (lang === "ar")
            ? "تمام، هابسطها ونكمل."
            : "Alright—let me simplify that and continue."
        });
      }

      // 4) احصل على أحدث رد
      const msgs = await openai.beta.threads.messages.list(tid, { order: "desc", limit: 1 });
      const assistantMsg = msgs.data.find(m => m.role === "assistant");
      const text = (assistantMsg?.content?.[0]?.text?.value || "").trim();

      pushTranscript(session, { from: "tutor", text });
      return res.json({ message: text });
    }

    // ==== Fallback: chat.completions (بدون كتاب)
    const fewShots = transcriptToMessages(T.transcript);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: sysPrompt },
        ...fewShots, // آخر 6–8 رسائل كذاكرة قريبة
        { role: "user", content: (lang === "ar")
            ? `نحن الآن في موضوع: "${currentTopic}". هذه رسالتي: ${userMessage}`
            : `We are now on topic: "${currentTopic}". My message: ${userMessage}` }
      ],
      temperature: 0.2,
      top_p: 1,
      max_completion_tokens: 400
    });

    const text = (completion?.choices?.[0]?.message?.content || "").trim();
    pushTranscript(session, { from: "tutor", text });
    return res.json({ message: text });

  } catch (err) {
    console.error("/api/teach/message error:", err);
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
