import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import fs from "fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import adminRoutes from "./routes/admin.js";
import { requireAdmin, redirectAdmins } from "./middleware/admin.js";
import { getQuestionPromptSingle } from "./prompts/system.js";
import { getFinalReportPrompt } from "./prompts/report.js";
import { humanizeCluster, toDisplayList } from "./shared/topicDisplayMap.js";
import { getTeachingSystemPrompt } from "./prompts/teach.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Security & Middleware Setup
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.set('trust proxy', 1);

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many requests, please try again later" });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: "Too many requests, please try again later" });

// Session Management with PostgreSQL
const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

app.use(express.json());

// Protect Routes
const redirectToLogin = (req, res) => res.redirect('/login.html');
const checkAuth = (req, res, next) => req.session.userId ? next() : redirectToLogin(req, res);

app.get('/admin.html', requireAdmin);
app.get('/chat.html', redirectAdmins, checkAuth);
app.get('/dashboard.html', redirectAdmins, checkAuth);

// Serve Static Files & Mount API Routes
app.use(express.static(join(__dirname, "../public")));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', profileRoutes);
app.use('/api/admin', adminLimiter, requireAdmin, adminRoutes);

// In-memory session store & OpenAI Client
const sessions = new Map();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key",
});

// IDs لمساعد الشرح
const TEACH_ASSISTANT_ID = process.env.TEACH_ASSISTANT_ID || "";
const TEACH_VECTOR_STORE_ID = process.env.TEACH_VECTOR_STORE_ID || "";

/* =========================
   Helpers: logging + guards
   ========================= */

/**
 * Logs teaching-related messages if DEBUG_TEACH env var is set.
 * @param {string} tag 
 * @param {any} payload 
 */
function logTeach(tag, payload) {
  const dbg = (process.env.DEBUG_TEACH || "").toString().toLowerCase();
  if (dbg === "1" || dbg === "true" || dbg === "yes") {
    try { console.log(`[teach:${tag}]`, payload); } catch (e) {}
  }
}

/**
 * Ensures the teaching state object exists on the session.
 * @param {object} sess 
 * @returns {object} The teaching state.
 */
function ensureTeachingState(sess) {
  return sess.teaching = sess.teaching || {
    mode: "idle",
    lang: "ar",
    topics_queue: [],
    current_topic_index: 0,
    transcript: [],
    assistant: { threadId: null },
    profileContext: {}
  };
}

/**
 * Pushes a new message item to the session transcript.
 * @param {object} session 
 * @param {{from: 'user'|'tutor', text: string}} item 
 */
function pushTranscript(session, item) {
  session.teaching = session.teaching || {};
  session.teaching.transcript = session.teaching.transcript || [];
  session.teaching.transcript.push({
    from: item.from,
    text: String(item.text || "").slice(0, 4000)
  });
}

/**
 * Converts transcript array to OpenAI message format.
 * @param {Array<object>} [transcript=[]] 
 * @returns {Array<object>}
 */
function transcriptToMessages(transcript = []) {
  return transcript.map(t => ({
    role: t.from === "user" ? "user" : "assistant",
    content: t.text
  }));
}

/**
 * Asserts that threadId and runId are valid.
 * @param {string} threadId 
 * @param {string} runId 
 */
function assertIds(threadId, runId) {
  if (!threadId || !runId) throw new Error(`Missing IDs — threadId=${threadId}, runId=${runId}`);
  if (!String(threadId).startsWith("thread_")) throw new Error(`Bad threadId: ${threadId}`);
  if (!String(runId).startsWith("run_")) throw new Error(`Bad runId: ${runId}`);
}

/**
 * Safely retrieves an OpenAI run object.
 * @param {string} threadId 
 * @param {string} runId 
 * @returns {Promise<object>}
 */
async function safeRetrieveRun(threadId, runId) {
  assertIds(threadId, runId);
  logTeach("poll", { threadId, runId });
  return openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
}

/**
 * Polls the OpenAI run status until it is 'completed' or a timeout occurs.
 * @param {string} threadId 
 * @param {string} runId 
 * @param {object} [opts={}]
 * @returns {Promise<object>}
 */
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

/* =========================
   Intake Data & Setup
   ========================= */

const INTAKE_ORDER = [ "name_full", "email", "phone_number", "country", "age_band", "job_nature", "experience_years_band", "job_title_exact", "sector", "learning_reason" ];
const INTAKE_OPENING = {
  ar: "أهلاً 👋 قبل ما نبدأ، هحتاج منك بعض التفاصيل البسيطة علشان نخصّص الاسئلة حسب خبرتك وهدفك. هنكملها خطوة بخطوة",
  en: "Hi 👋 Before we start, I’ll need a few quick details so I can tailor the questions to your experience and goals. We’ll go step by step."
};

const intakeCatalogPath = join(__dirname, "intake_catalog.cache.json");
let INTAKE_CATALOG;
try {
  INTAKE_CATALOG = JSON.parse(fs.readFileSync(intakeCatalogPath, "utf-8"));
} catch (e) {
  // Full fallback intake catalog (highly compressed for line density)
  INTAKE_CATALOG = {
    name_full: { type: 'text', prompt: { en: "What’s your full name?", ar: "ممكن تكتب اسمك الكامل؟" }, validation_error: { en: "Please enter your full name.", ar: "من فضلك اكتب اسمك كامل." } },
    email: { type: 'text', prompt: { en: "Could you enter your email address?", ar: "ممكن تدخل بريدك الإلكتروني؟" }, validation_error: { en: "That email doesn’t look valid. Please try again.", ar: "البريد الالكتروني مش صحيح ممكن تكتبه مرة تانيه" } },
    phone_number: { type: 'text', prompt: { en: "What’s your mobile number?", ar: "رقم موبايلك كام؟" }, validation_error: { en: "Phone number isn’t valid. Digits, spaces and an optional + are allowed.", ar: "رقم الموبايل مش واضح. مسموح أرقام ومسافات و+" } },
    country: {
      type: "country", prompt: { en: "Which country are you based in?", ar: "من أي دولة بتكلّمنا؟" },
      options: {
        en: ["Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Brazil", "Bulgaria", "Cambodia", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia", "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman", "Pakistan", "Palestine", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Thailand", "Tunisia", "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Venezuela", "Vietnam", "Yemen"],
        ar: ["أفغانستان", "ألبانيا", "الجزائر", "الأرجنتين", "أرمينيا", "أستراليا", "النمسا", "أذربيجان", "البحرين", "بنغلاديش", "بيلاروسيا", "بلجيكا", "بوليفيا", "البرازيل", "بلغاريا", "كمبوديا", "كندا", "تشيلي", "الصين", "كولومبيا", "كوستاريكا", "كرواتيا", "قبرص", "التشيك", "الدنمارك", "الإكوادور", "مصر", "إستونيا", "فنلندا", "فرنسا", "جورجيا", "ألمانيا", "غانا", "اليونان", "المجر", "آيسلندا", "الهند", "إندونيسيا", "إيران", "العراق", "أيرلندا", "إيطاليا", "اليابان", "الأردن", "كازاخستان", "كينيا", "الكويت", "لاتفيا", "لبنان", "ليتوانيا", "لوكسمبورغ", "ماليزيا", "المكسيك", "المغرب", "هولندا", "نيوزيلندا", "نيجيريا", "النرويج", "عُمان", "باكستان", "فلسطين", "بيرو", "الفلبين", "بولندا", "البرتغال", "قطر", "رومانيا", "روسيا", "السعودية", "سنغافورة", "سلوفاكيا", "سلوفينيا", "جنوب أفريقيا", "كوريا الجنوبية", "إسبانيا", "سريلانكا", "السودان", "السويد", "سويسرا", "سوريا", "تايلاند", "تونس", "تركيا", "أوكرانيا", "الإمارات", "بريطانيا", "الولايات المتحدة", "الأوروغواي", "فنزويلا", "فيتنام", "اليمن"]
      }
    },
    age_band: { type: "chips", prompt: { en: "Pick your age range:", ar: "اختار فئتك العمرية:" }, options: { en: ["18–24", "25–34", "35–44", "45–54", "55+"], ar: ["18–24", "25–34", "35–44", "45–54", "55+"] } },
    job_nature: {
      type: "chips", prompt: { en: "Choose your department or nature of work:", ar: "اختار طبيعة عملك او القسم الذي تعمل به:" },
      options: {
        en: ["Accounting/Finance", "Sales", "Marketing", "Operations", "HR", "IT/Data", "Customer Support", "Product/Engineering", "Supply Chain/Logistics", "Freelance/Consulting", "Other"],
        ar: ["المالية/المحاسبة", "المبيعات", "التسويق", "العمليات", "الموارد البشرية", "تقنية المعلومات/البيانات", "خدمة العملاء", "سلسلة الإمداد/اللوجستيات", "عمل حر/استشارات", "أخرى"]
      }
    },
    experience_years_band: { type: "chips", prompt: { en: "How many years of experience do you have?", ar: "عندك كام سنة خبرة ؟" }, options: { en: ["<1y", "1–2y", "3–5y", "6–9y", "10–14y", "15y+"], ar: ["أقل من سنة", "1–2 سنوات", "3–5 سنوات", "6–9 سنوات", "10–14 سنة", "15+ سنة"] } },
    job_title_exact: { type: "text", prompt: { en: "Type your exact job title:", ar: "اكتب مسماك الوظيفي بشكل صحيح تماما" } },
    sector: {
      type: "chips", prompt: { en: "Choose your industry/sector:", ar: "اختار قطاع شغلك:" },
      options: {
        en: ["Real Estate", "Retail/E-commerce", "Banking/Finance", "Telecom", "Healthcare", "Education", "Manufacturing", "Media/Advertising", "Travel/Hospitality", "Government/Public", "Technology/Software", "Other"],
        ar: ["العقارات", "التجزئة/التجارة الإلكترونية", "البنوك/المالية", "الاتصالات", "الرعاية الصحية", "التعليم", "التصنيع", "الإعلام/الإعلان", "السفر/الضيافة", "الحكومي/العام", "التقنية/البرمجيات", "أخرى"]
      }
    },
    learning_reason: { type: "chips", prompt: { en: "Pick your main learning reason:", ar: "اختار سبب التعلّم الأساسي:" }, options: { en: ["Career shift", "Promotion", "Skill refresh", "Academic"], ar: ["تغيير مسار", "ترقية", "تحديث مهارة", "أكاديمي"] } }
  };
}

// Levels (for Report)
const LEVELS = {
  L1: { clusters: ["central_tendency_foundations", "dispersion_boxplot_foundations"] },
  L2: { clusters: ["distribution_shape_normality", "data_quality_outliers_iqr"] },
  L3: { clusters: ["correlation_bivariate_patterns", "non_normal_skew_kurtosis_z"] },
};

/* =========================
   Session Management
   ========================= */

/**
 * Initializes or retrieves a user session.
 * @param {string} sessionId 
 * @returns {object} The session object.
 */
function getSession(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);

  const initialSession = {
    sessionId,
    lang: "en",
    currentStep: "intake",
    intakeStepIndex: 0,
    openingShown: false,
    intake: {},
    assessment: {
      currentLevel: "L1",
      attempts: 0,
      evidence: [],
      questionIndexInAttempt: 1,
      usedClustersCurrentAttempt: [],
      stemsCurrentAttempt: [],
      lastAttemptStems: {},
    },
    teaching: ensureTeachingState({}).teaching, // Initialize teaching state cleanly
    finished: false,
    report: null,
  };
  sessions.set(sessionId, initialSession);
  return initialSession;
}

/**
 * Builds the ordered teaching queue based on assessment evidence.
 * @param {object} session
 * @param {string} [lang="ar"]
 * @returns {Array<object>}
 */
function buildTeachingQueueFromEvidence(session, lang = "ar") {
  const A = session.assessment || { evidence: [], currentLevel: "L1" };
  const ev = Array.isArray(A.evidence) ? A.evidence : [];
  const queue = [], seen = new Set();

  for (const e of ev) {
    if (!e || !e.cluster) continue;
    const display = humanizeCluster(e.cluster, lang);
    const kind = e.correct ? "strength" : "gap";
    const prev = queue[queue.length - 1];
    if (prev && prev.display === display) continue;
    queue.push({ display, kind });
    seen.add(e.cluster);
  }

  const catalogOrder = [...(LEVELS.L1?.clusters || []), ...(LEVELS.L2?.clusters || []), ...(LEVELS.L3?.clusters || [])];
  for (const clusterKey of catalogOrder) {
    if (!seen.has(clusterKey)) {
      const display = humanizeCluster(clusterKey, lang);
      const prev = queue[queue.length - 1];
      if (prev && prev.display === display) continue;
      queue.push({ display, kind: "gap" });
    }
  }
  return queue;
}

/**
 * Performs simple validation for intake inputs.
 * @param {string} stepKey 
 * @param {any} value 
 * @returns {boolean}
 */
function validateIntakeInput(stepKey, value) {
  if (stepKey === "name_full") return (value.trim().split(/\s+/).length >= 2);
  if (stepKey === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (stepKey === "phone_number") {
    if (!value) return false;
    const cleaned = value.toString().replace(/[\s\-()]/g, "");
    return /^\+?\d{7,15}$/.test(cleaned);
  }
  return value && value.trim().length > 0;
}

/**
 * Shuffles choices and updates the correct index.
 * @param {Array<string>} choices
 * @param {number} correctIndex
 * @returns {{newChoices: Array<string>, newCorrectIndex: number}}
 */
function shuffleChoicesAndUpdateCorrectIndex(choices, correctIndex) {
  const arr = choices.map((text, idx) => ({ text, idx }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return {
    newChoices: arr.map(o => o.text),
    newCorrectIndex: arr.findIndex(o => o.idx === correctIndex)
  };
}

// Fallback MCQs (Highly compressed)
function getFallbackMCQ(level, lang, questionIndex) {
  const fallbacks = {
    L1: {
      q1: {
        en: { kind: "question", level: "L1", cluster: "central_tendency_foundations", prompt: "What is the mean of the following dataset: 2, 4, 6, 8, 10?", choices: ["5", "6", "7", "8"], correct_index: 1, difficulty: "easy" },
        ar: { kind: "question", level: "L1", cluster: "central_tendency_foundations", prompt: "ما هو المتوسط الحسابي للبيانات التالية: 2، 4، 6، 8، 10؟", choices: ["5", "6", "7", "8"], correct_index: 1, difficulty: "easy" }
      },
      q2: {
        en: { kind: "question", level: "L1", cluster: "central_tendency_foundations", prompt: "In the dataset [3, 7, 7, 10, 13], what is the median?", choices: ["7", "8", "10", "6.5"], correct_index: 0, difficulty: "easy" },
        ar: { kind: "question", level: "L1", cluster: "central_tendency_foundations", prompt: "في البيانات [3، 7، 7، 10، 13]، ما هو الوسيط؟", choices: ["7", "8", "10", "6.5"], correct_index: 0, difficulty: "easy" }
      }
    },
    L2: {
      q1: {
        en: { kind: "question", level: "L2", cluster: "distribution_analysis", prompt: "Which measure is most affected by outliers in a dataset?", choices: ["Mean", "Median", "Mode", "Range"], correct_index: 0, difficulty: "medium" },
        ar: { kind: "question", level: "L2", cluster: "distribution_analysis", prompt: "أي من المقاييس التالية يتأثر بشكل أكبر بالقيم المتطرفة في البيانات؟", choices: ["المتوسط الحسابي", "الوسيط", "المنوال", "المدى"], correct_index: 0, difficulty: "medium" }
      },
      q2: {
        en: { kind: "question", level: "L2", cluster: "distribution_analysis", prompt: "What does a standard deviation of zero indicate about a dataset?", choices: ["All values are the same", "The data is normally distributed", "There are no outliers", "The mean equals the median"], correct_index: 0, difficulty: "medium" },
        ar: { kind: "question", level: "L2", cluster: "distribution_analysis", prompt: "ماذا يعني الانحراف المعياري الصفري في مجموعة بيانات؟", choices: ["جميع القيم متطابقة", "البيانات موزعة طبيعياً", "لا توجد قيم متطرفة", "المتوسط يساوي الوسيط"], correct_index: 0, difficulty: "medium" }
      }
    },
    L3: {
      q1: {
        en: { kind: "question", level: "L3", cluster: "statistical_inference", prompt: "What is the standard error of the mean used for in statistical analysis?", choices: ["Measuring the spread of individual data points", "Estimating the precision of the sample mean", "Calculating the range of the dataset", "Determining the mode of the distribution"], correct_index: 1, difficulty: "hard" },
        ar: { kind: "question", level: "L3", cluster: "statistical_inference", prompt: "ما هو الغرض من الخطأ المعياري للمتوسط في التحليل الإحصائي؟", choices: ["قياس انتشار نقاط البيانات الفردية", "تقدير دقة المتوسط العيني", "حساب المدى للبيانات", "تحديد المنوال للتوزيع"], correct_index: 1, difficulty: "hard" }
      },
      q2: {
        en: { kind: "question", level: "L3", cluster: "statistical_inference", prompt: "In hypothesis testing, what does a p-value less than 0.05 typically indicate?", choices: ["The null hypothesis is proven true", "There is strong evidence against the null hypothesis", "The sample size is too small", "The data follows a normal distribution"], correct_index: 1, difficulty: "hard" },
        ar: { kind: "question", level: "L3", cluster: "statistical_inference", prompt: "في اختبار الفرضيات، ماذا تعني قيمة p أقل من 0.05 عادةً؟", choices: ["تم إثبات صحة الفرضية الصفرية", "هناك دليل قوي ضد الفرضية الصفرية", "حجم العينة صغير جداً", "البيانات تتبع التوزيع الطبيعي"], correct_index: 1, difficulty: "hard" }
      }
    }
  };
  const qKey = questionIndex === 1 ? 'q1' : 'q2';
  return fallbacks[level]?.[qKey]?.[lang] || fallbacks.L1.q1.en;
}

/* -------------------------
   Session State (Hydration)
   ------------------------- */

app.get("/api/session/state", (req, res) => {
  try {
    const s = sessions.get(req.session.lastSessionId);
    if (!s) return res.json({ ok: true, phase: "idle", sessionId: null });

    const phase = (s.currentStep === "assessment") ? "assessment" :
                  (s.currentStep === "teaching")   ? "teaching"   :
                  (s.currentStep === "report")     ? "report"     :
                  (s.currentStep === "intake")     ? "intake"     : "idle";

    const A = s.assessment || {};
    const T = s.teaching || {};
    const R = s.report || null;

    const payload = {
      ok: true,
      phase,
      sessionId: s.sessionId,
      assessment: undefined,
      teaching: undefined,
      report: undefined
    };

    if (phase === "assessment") {
      const cq = A.currentQuestion || null;
      payload.assessment = {
        attemptId: A.attemptId || null,
        level: A.currentLevel,
        stepWithinLevel: A.questionIndexInAttempt || 1,
        usedClusters: A.usedClustersCurrentAttempt || [],
        evidence: Array.isArray(A.evidence) ? A.evidence : [],
        currentQuestion: cq ? {
          qid: cq.qid,
          prompt: cq.prompt,
          choices: cq.choices,
          level: cq.level,
          cluster: cq.cluster
        } : null,
        progress: {
          asked: (Array.isArray(A.evidence) ? A.evidence.length : 0),
          correct: (Array.isArray(A.evidence) ? A.evidence.filter(e => e.correct).length : 0),
          totalTarget: 6
        }
      };
    }

    if (phase === "teaching") {
      payload.teaching = {
        threadId: T?.assistant?.threadId || null,
        transcript: Array.isArray(T?.transcript) ? T.transcript : [],
        mode: T.mode || "idle"
      };
    }

    if (phase === "report" && R) {
      payload.report = {
        scorePercent: R?.scorePercent ?? null,
        strengths: R?.strengths ?? [],
        gaps: R?.gaps ?? [],
        narrative: R?.narrative ?? ""
      };
    }

    return res.json(payload);
  } catch (e) {
    console.error("[/api/session/state] error:", e);
    return res.json({ ok: false, phase: "idle", sessionId: null });
  }
});

/* -------------------------
   Start a Brand-New Assessment
   ------------------------- */

// -------------------------
// Start a Brand-New Assessment (hard reset)
// -------------------------
app.post("/api/assess/new", (req, res) => {
  try {
    // 1) افصل الجلسة القديمة تمامًا
    const prevId = req.session.lastSessionId || null;
    if (prevId && sessions.has(prevId)) {
      const prevSession = sessions.get(prevId);
      // علِّمها كمنتهية (للإحصاء فقط)، ثم احذفها من الذاكرة حتى لا تتسرب حالتها
      try { prevSession.finished = true; } catch {}
      sessions.delete(prevId);
    }

    // 2) أنشئ جلسة جديدة نظيفة
    const newId = randomUUID();
    const s = getSession(newId); // هذه دالتك الحالية لإنشاء/جلب جلسة

    // حالة عامة للجلسة
    s.sessionId = newId;
    s.createdAt = new Date();
    s.finished = false;
    s.currentStep = "intake";
    s.intakeStepIndex = 0;
    s.intake = {};              // امسح أي معلومات intake سابقة
    s.report = null;            // لا تقرير
    // لو بتسجل لغة المستخدم في الجلسة يمكن تهيئتها هنا لو احتجت:
    // s.lang = (req.body?.lang || req.query?.lang || "ar");

    // حالة التقييم الجديدة
    s.assessment = {
      currentLevel: "L1",
      attempts: 0,
      evidence: [],
      questionIndexInAttempt: 1,       // 1..2 داخل كل مستوى
      usedClustersCurrentAttempt: [],
      stemsCurrentAttempt: [],
      lastAttemptStems: {},
      currentQuestion: null            // مفيش سؤال نشط لسه
    };

    // حالة الشرح الجديدة (صفر)
    // لو عندك ensureTeachingState بتعمل نفس ده سيبها، وإلا الكود التالي كافي.
    if (typeof ensureTeachingState === "function") {
      ensureTeachingState(s);
    } else {
      s.teaching = {
        mode: "idle",
        transcript: [],
        assistant: { threadId: null }
      };
    }

    // 3) اربط الكوكي-session بالجديدة
    req.session.lastSessionId = newId;

    // 4) ردّ مؤكِّد
    return res.json({ ok: true, sessionId: newId, phase: "intake" });
  } catch (e) {
    console.error("[/api/assess/new] error:", e);
    return res.status(500).json({ ok: false, error: "Failed to start new assessment" });
  }
});


// -------- Intake Flow --------

app.post("/api/intake/next", async (req, res) => {
  try {
    const { sessionId = randomUUID(), lang = "en", answer } = req.body;
    const session = getSession(sessionId);
    session.lang = lang;
    req.session.lastSessionId = sessionId; // Bind session

    // Check for logged-in user intake data
    if (req.session.userId && session.intakeStepIndex === 0 && !session.intakeChecked) {
      try {
        const { db, users } = await import('./db.js');
        const { eq } = await import('drizzle-orm');
        const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));

        if (user) {
          const profile = user.profileJson || {};
          if (profile.intakeCompleted && profile.intake) {
            session.intake = { ...profile.intake };
            session.intakeStepIndex = INTAKE_ORDER.length;
            session.currentStep = "assessment";
            session.intakeChecked = true;
            return res.json({ done: true, skipIntake: true, message: lang === "ar" ? "مرحبًا! هنبدأ أسئلة التقييم مباشرة." : "Welcome back! We'll start the assessment directly." });
          }

          session.intake.name_full = profile.name || user.username;
          session.intake.email = user.email;
          session.intake.phone_number = profile.phone || '';
          session.intakeStepIndex = 3;
          session.intakeChecked = true;
        }
      } catch (err) { console.error('Failed to load user data:', err); }
    }

    // Process answer
    if (answer !== undefined && answer !== null) {
      const currentStepKey = INTAKE_ORDER[session.intakeStepIndex];
      const stepConfig = INTAKE_CATALOG[currentStepKey];
      if (!validateIntakeInput(currentStepKey, answer)) {
        const errorMessage = stepConfig.validation_error?.[lang] || (lang === "ar" ? "يرجى إدخال إجابة صحيحة" : "Please enter a valid answer");
        return res.json({ error: true, message: errorMessage });
      }
      session.intake[currentStepKey] = answer;
      session.intakeStepIndex++;
    }

    // Check for completion
    if (session.intakeStepIndex >= INTAKE_ORDER.length) {
      session.currentStep = "assessment";
      session.assessment = session.assessment || { currentLevel: "L1", attempts: 0, evidence: [], questionIndexInAttempt: 1, usedClustersCurrentAttempt: [], stemsCurrentAttempt: [], lastAttemptStems: {} };

      if (req.session.userId) {
        try {
          const { db, users } = await import('./db.js');
          const { eq } = await import('drizzle-orm');
          const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
          const existingProfile = user?.profileJson || {};
          await db.update(users).set({ 
            profileJson: {
              ...existingProfile,
              name: session.intake.name_full,
              phone: session.intake.phone_number,
              intake: session.intake,
              intakeCompleted: true,
              intakeCompletedAt: new Date().toISOString()
            }
          }).where(eq(users.id, req.session.userId));
          console.log(`[INTAKE] Saved intake data for user ${req.session.userId}`);
        } catch (err) { console.error('[INTAKE] Failed to save intake to database:', err); }
      }

      return res.json({
        done: true,
        message: lang === "ar" ? "تمام! كده عندي صورة أوضح عنك. هنبدأ أسئلة التقييم دلوقتي. الهدف مش نجاح ورسوب الهدف نفهم مستواك بدقة علشان نطلع لك خطة مناسبة"
                              : "Great! I now have a clearer picture of you. We’ll start the assessment now. There’s no pass or fail — the goal is to gauge your level accurately so we can give you a suitable plan."
      });
    }

    // Opening message
    if ((answer === undefined || answer === null) && !session.openingShown) {
      session.openingShown = true;
      return res.json({ sessionId, stepKey: "__opening__", type: "info", prompt: INTAKE_OPENING[lang], lang, autoNext: true });
    }

    // Next step
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

// -------- Assessment: get ONE MCQ --------

app.post("/api/assess/next", async (req, res) => {
  const isDev = process.env.NODE_ENV !== 'production';
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    req.session.lastSessionId = sessionId; // Bind session

    if (session.currentStep !== "assessment" || !session.assessment) {
      if (isDev) console.log(`[ASSESS-NEXT] Initializing assessment state`);
      session.currentStep = "assessment";
      session.assessment = { currentLevel: "L1", attempts: 0, evidence: [], questionIndexInAttempt: 1, usedClustersCurrentAttempt: [], stemsCurrentAttempt: [], lastAttemptStems: {} };
    }

    const A = session.assessment;
    if (!A.startedAt && A.currentLevel === "L1" && A.attempts === 0 && A.evidence.length === 0) A.startedAt = new Date();
    // Idempotent return of existing currentQuestion if present
    if (session.assessment && session.assessment.currentQuestion) {
      const cq = session.assessment.currentQuestion;
      const question_index = session.assessment.questionIndexInAttempt || 1;
      return res.json({
        kind: "question", level: cq.level, cluster: cq.cluster, prompt: cq.prompt, choices: cq.choices,
        correct_answer: "__hidden__", rationale: "", questionNumber: question_index, totalQuestions: 2
      });
    }


    const profile = {
      job_nature: session.intake?.job_nature || "", experience_years_band: session.intake?.experience_years_band || "",
      job_title_exact: session.intake?.job_title_exact || "", sector: session.intake?.sector || "", learning_reason: session.intake?.learning_reason || "",
    };

    const attempt_type = A.attempts === 0 ? "first" : "retry";
    const question_index = A.questionIndexInAttempt || 1;
    const used_clusters_current_attempt = A.usedClustersCurrentAttempt || [];
    const avoid_stems = attempt_type === "retry" ? (A.lastAttemptStems[A.currentLevel] || []) : [];

    let q = null, usedFallback = false;

    if (!process.env.OPENAI_API_KEY) {
      console.warn('[ASSESS-NEXT] ⚠️ OPENAI_API_KEY not found, using fallback MCQ');
      q = getFallbackMCQ(A.currentLevel, session.lang || 'en', question_index);
      usedFallback = true;
    } else {
      try {
        const systemPrompt = getQuestionPromptSingle({ lang: session.lang, level: A.currentLevel, profile, attempt_type, question_index, used_clusters_current_attempt, avoid_stems });
        if (isDev) console.log(`[ASSESS-NEXT] OpenAI prompt (first 200 chars): ${systemPrompt.substring(0, 200)}...`);

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }], response_format: { type: "json_object" },
          temperature: 0.2, top_p: 1, max_completion_tokens: 2048,
        });
        q = JSON.parse(response.choices[0].message.content);

        if (!q || q.kind !== "question" || !Array.isArray(q.choices) || q.choices.length < 3 || typeof q.correct_index !== "number" || q.correct_index < 0 || q.correct_index >= q.choices.length) {
          console.error("[ASSESS-NEXT] Invalid question schema from OpenAI:", q);
          throw new Error("Invalid question schema");
        }
        if (isDev) console.log(`[ASSESS-NEXT] ✅ OpenAI success - Level: ${q.level}, Cluster: ${q.cluster}`);
      } catch (openaiErr) {
        console.error('[ASSESS-NEXT] ⚠️ OpenAI call failed:', { status: openaiErr?.status || openaiErr?.response?.status, code: openaiErr?.code, message: openaiErr?.message, errorBody: openaiErr?.response?.data });
        console.log('[ASSESS-NEXT] Using fallback MCQ');
        q = getFallbackMCQ(A.currentLevel, session.lang || 'en', question_index);
        usedFallback = true;
      }
    }

    const { newChoices, newCorrectIndex } = shuffleChoicesAndUpdateCorrectIndex(q.choices, q.correct_index);

    const current = {
      level: q.level || A.currentLevel, cluster: q.cluster, difficulty: q.difficulty || (question_index === 1 ? "easy" : "harder"),
      prompt: q.prompt, choices: newChoices, correct_index: newCorrectIndex,
      qid: `${A.currentLevel}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    A.currentQuestion = current;

    if (attempt_type === "first") {
      A.stemsCurrentAttempt = A.stemsCurrentAttempt || [];
      A.stemsCurrentAttempt.push(current.prompt);
    }

    if (question_index === 1 && current.cluster && !A.usedClustersCurrentAttempt.includes(current.cluster)) {
      A.usedClustersCurrentAttempt.push(current.cluster);
    }

    const mcqPayload = {
      kind: "question", level: current.level, cluster: current.cluster, prompt: current.prompt, choices: current.choices,
      correct_answer: "__hidden__", rationale: "", questionNumber: question_index, totalQuestions: 2,
      ...(isDev && usedFallback && { _dev_fallback: true })
    };

    return res.json(mcqPayload);
  } catch (err) {
    console.error("[ASSESS-NEXT] Fatal error:", { message: err?.message, stack: (process.env.NODE_ENV !== 'production') ? err?.stack : undefined });
    return res.status(500).json({ 
      error: true, stage: "assess-next", reason: (process.env.NODE_ENV !== 'production') ? err?.message || "Unknown error" : "Server error",
      detail: (process.env.NODE_ENV !== 'production') ? err?.code || err?.name : undefined
    });
  }
});

// -------- Assessment: submit answer --------

app.post("/api/assess/answer", async (req, res) => {
  try {
    const { sessionId, userChoiceIndex } = req.body;
    const session = getSession(sessionId);
    const A = session.assessment;
    req.session.lastSessionId = sessionId; // Bind session

    if (session.currentStep !== "assessment" || !A.currentQuestion) return res.status(400).json({ error: "No active question" });

    const q = A.currentQuestion;
    const isCorrect = Number.isInteger(userChoiceIndex) && userChoiceIndex >= 0 && userChoiceIndex < (q.choices?.length || 0) && userChoiceIndex === q.correct_index;

    A.evidence.push({ level: q.level, cluster: q.cluster, correct: isCorrect, qid: q.qid });

    let nextAction = "continue";

    if (A.questionIndexInAttempt === 1) {
      A.questionIndexInAttempt = 2;
    } else {
      const lastTwo = A.evidence.filter(e => e.level === A.currentLevel).slice(-2);
      const correctCount = lastTwo.filter(e => e.correct).length;
      const wrongCount = 2 - correctCount;

      if (wrongCount === 2) {
        if (A.attempts === 0) { // Failed first attempt, try again with new questions
          A.attempts = 1;
          A.lastAttemptStems[A.currentLevel] = Array.isArray(A.stemsCurrentAttempt) ? [...A.stemsCurrentAttempt] : [];
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "retry_same_level";
        } else { // Failed retry, stop assessment
          session.currentStep = "report";
          nextAction = "stop";
        }
      } else { // Passed or partially passed
        if (A.currentLevel === "L1") A.currentLevel = "L2";
        else if (A.currentLevel === "L2") A.currentLevel = "L3";
        else { // Completed L3
          session.currentStep = "report";
          nextAction = "complete";
        }

        if (session.currentStep !== "report") { // Advance to next level
          A.attempts = 0;
          A.stemsCurrentAttempt = [];
          A.usedClustersCurrentAttempt = [];
          A.questionIndexInAttempt = 1;
          nextAction = "advance";
        }
      }
    }
    A.currentQuestion = null;

    return res.json({ correct: isCorrect, nextAction, message: "", canProceed: nextAction !== "stop" });
  } catch (err) {
    console.error("Answer processing error:", err);
    res.status(500).json({ error: "Server error processing answer" });
  }
});

/* -------- Assessment: current (resume helper) -------- */

app.post("/api/assess/current", (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const s = sessions.get(sessionId);
    const A = s?.assessment || {};
    const q = A.currentQuestion || null;

    return res.json({
      hasActive: !!q && s?.currentStep === "assessment",
      current: q ? {
        level: q.level, cluster: q.cluster, prompt: q.prompt, choices: q.choices,
        questionNumber: A.questionIndexInAttempt || 1, totalQuestions: 2
      } : null
    });
  } catch (e) {
    console.error("[/api/assess/current] error:", e);
    return res.status(500).json({ error: true, message: "Failed to fetch current assessment state" });
  }
});

// -------- Final report --------

function calculateScore(evidence) {
  let correctCount = 0;
  for (const level of ['L1', 'L2', 'L3']) {
    const levelEvidence = evidence.filter(e => e.level === level);
    if (levelEvidence.length === 0) continue;
    correctCount += levelEvidence.slice(-2).filter(e => e.correct).length;
  }
  return { correctCount, totalQuestions: 6, scorePercent: Math.round((correctCount / 6) * 100) };
}

app.post("/api/report", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    const lang = session.lang || "en";
    req.session.lastSessionId = sessionId; // Bind session

    const A = session.assessment || { evidence: [], currentLevel: "L1" };
    const evidence = Array.isArray(A.evidence) ? A.evidence : [];

    // Determine Strengths & Gaps
    const strengths = Array.from(new Set(evidence.filter(e => e.correct).map(e => e.cluster)));
    const gaps = Array.from(new Set(evidence.filter(e => !e.correct).map(e => e.cluster)));

    // Fill in unattempted clusters as gaps
    const levelOrder = ["L1", "L2", "L3"];
    const highestReached = A.currentLevel || "L1";
    for (let i = levelOrder.indexOf(highestReached) + 1; i < levelOrder.length; i++) {
      for (const c of (LEVELS[levelOrder[i]]?.clusters || [])) {
        if (!gaps.includes(c)) gaps.push(c);
      }
    }

    const strengths_display = strengths.map(c => humanizeCluster(c, lang));
    const gaps_display = gaps.map(c => humanizeCluster(c, lang));
    const { correctCount, totalQuestions, scorePercent } = calculateScore(evidence);

    const summary_counts = { total_questions: evidence.length, total_correct: evidence.filter(e => e.correct).length, total_wrong: Math.max(0, evidence.length - evidence.filter(e => e.correct).length) };
    const profile = { job_nature: session.intake?.job_nature || "", experience_years_band: session.intake?.experience_years_band || "", job_title_exact: session.intake?.job_title_exact || "", sector: session.intake?.sector || "", learning_reason: session.intake?.learning_reason || "" };

    // Local Fallback Narrative (Highly compressed)
    const localFallback = (() => {
      const intro = lang === "ar" ? "نتائج تقييمك جاهزة. سنعرض موجزًا مختصرًا." : "Your assessment results are ready. Here’s a short summary.";
      const strengthsLine = strengths_display.length ? (lang === "ar" ? `نقاط قوة ظهرت: ${strengths_display.join("، ")}.` : `Strengths noticed: ${strengths_display.join(", ")}.`) : (lang === "ar" ? "لا توجد نقاط قوة واضحة حتى الآن." : "No clear strengths yet.");
      const gapsLine = gaps_display.length ? (lang === "ar" ? `تحتاج لتعزيز في: ${gaps_display.join("، ")}.` : `Areas to reinforce: ${gaps_display.join(", ")}.`) : (lang === "ar" ? "لا توجد فجوات واضحة." : "No clear gaps.");
      const cta = lang === "ar" ? "تحب أشرح لك هذه النقاط خطوة بخطوة الآن؟" : "Would you like me to explain these points step-by-step now?";
      return `${intro}\n${strengthsLine}\n${gapsLine}\n${cta}`;
    })();

    let narrative = "";
    try {
      const systemPrompt = getFinalReportPrompt({
        lang, profile, strengths_display, gaps_display, summary_counts,
        evidence: evidence.map(e => ({ level: e.level, cluster_code: e.cluster, cluster_display: humanizeCluster(e.cluster, lang), correct: !!e.correct })),
      });

      const completion = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }], temperature: 0.2, top_p: 1, max_completion_tokens: 512 });
      narrative = completion?.choices?.[0]?.message?.content?.trim() || "";
      if (!narrative) console.warn("[/api/report] Empty LLM narrative, using local fallback.");
    } catch (llmErr) {
      console.error("[/api/report] LLM error:", { message: llmErr?.message, status: llmErr?.status || llmErr?.response?.status, data: llmErr?.response?.data, stack: llmErr?.stack });
    }

    const report = {
      kind: "final_report", message: narrative || localFallback, strengths, gaps, strengths_display, gaps_display,
      stats_level: correctCount >= 5 ? "Advanced" : (correctCount >= 3 && totalQuestions >= 4 ? "Intermediate" : "Beginner"),
    };

    session.report = report;
    session.finished = true;
    session.currentStep = "report";

    if (req.session.userId) {
      try {
        const { db, attempts } = await import('./db.js');
        const startedAt = session.assessment?.startedAt || new Date();
        await db.insert(attempts).values({
          userId: req.session.userId, startedAt: startedAt, finishedAt: new Date(), difficultyTier: 'adaptive',
          totalQuestions: totalQuestions, correctAnswers: correctCount, scorePercent: scorePercent,
          currentLevel: highestReached, currentStep: 'completed', intakeStepIndex: null, assessmentState: { evidence, strengths, gaps }, reportData: report
        });
        console.log(`[REPORT] Saved assessment (score: ${correctCount}/6 = ${scorePercent}%) for user ${req.session.userId}`);
      } catch (err) { console.error('[REPORT] Failed to save assessment to database:', err); }
    }

    return res.json(report);
  } catch (err) {
    console.error("Report generation fatal error:", err);
    return res.status(200).json({
      kind: "final_report", message: (req?.body?.lang || "en") === "ar" ? "نتائج تقييمك جاهزة بصورة مبسطة." : "Your assessment results are ready in a simplified form.",
      strengths: [], gaps: [], strengths_display: [], gaps_display: [], stats_level: "Beginner",
    });
  }
});

/* ===================================================
   Teaching Notes Database Helpers
   =================================================== */

async function getOrCreateTeachingNote(userId) {
  const { db, teachingNotes, attempts } = await import('./db.js');
  const { eq, desc, and } = await import('drizzle-orm');

  const latestAttempt = await db.select().from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.currentStep, 'completed'))).orderBy(desc(attempts.finishedAt)).limit(1);
  if (!latestAttempt || latestAttempt.length === 0) return null;
  const assessmentId = latestAttempt[0].id;

  const [existingNote] = await db.select().from(teachingNotes).where(and(eq(teachingNotes.userId, userId), eq(teachingNotes.assessmentId, assessmentId), eq(teachingNotes.inProgress, true))).limit(1);

  if (existingNote) {
    return { id: existingNote.id, assessmentId: existingNote.assessmentId, threadId: existingNote.threadId, transcript: existingNote.transcript || [], isResume: true };
  }

  const [newNote] = await db.insert(teachingNotes).values({ userId: userId, assessmentId: assessmentId, threadId: null, inProgress: true, topicDisplay: 'Teaching Session', text: '', transcript: [] }).returning();
  return { id: newNote.id, assessmentId: newNote.assessmentId, threadId: null, transcript: [], isResume: false };
}

async function updateTeachingNote(noteId, data) {
  const { db, teachingNotes } = await import('./db.js');
  const { eq } = await import('drizzle-orm');
  await db.update(teachingNotes).set(data).where(eq(teachingNotes.id, noteId));
}

async function finalizeTeachingNote(noteId, transcript, lang) {
  const { db, teachingNotes } = await import('./db.js');
  const { eq } = await import('drizzle-orm');

  const formattedText = transcript.map(entry => {
    const from = entry.from === 'user' ? (lang === 'ar' ? 'المتعلم' : 'Learner') : (lang === 'ar' ? 'المدرّس' : 'Tutor');
    return `[${from}]: ${entry.text}`;
  }).join('\n\n');

  const topicDisplay = lang === 'ar' ? `شرح ${new Date().toLocaleDateString('ar-EG')}` : `Explanation ${new Date().toLocaleDateString('en-US')}`;

  await db.update(teachingNotes).set({ text: formattedText, topicDisplay: topicDisplay, transcript: transcript, inProgress: false }).where(eq(teachingNotes.id, noteId));
}

/* =========================
   Teaching: start (data-only)
   ========================= */

app.post("/api/teach/start", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = getSession(sessionId);
    const teaching = ensureTeachingState(session);
    teaching.lang = session.lang || teaching.lang || "ar";
    req.session.lastSessionId = sessionId; // Bind session

    const { gaps_display: G, strengths_display: S } = session.report || {};

    if (!G?.length && !S?.length) return res.status(400).json({ error: true, message: (session.lang === "ar") ? "لا توجد مواضيع للشرح حاليًا." : "No topics to teach right now." });

    if (!teaching.topics_queue?.length) {
      const langForDisplay = teaching.lang || session.lang || "ar";
      const canonicalKeys = [...(LEVELS.L1?.clusters || []), ...(LEVELS.L2?.clusters || []), ...(LEVELS.L3?.clusters || [])];
      const canonicalDisplays = canonicalKeys.map(k => humanizeCluster(k, langForDisplay));
      const setS = new Set(S), setG = new Set(G);
      const ordered = canonicalDisplays.map(disp => {
        if (setS.has(disp)) return { display: disp, kind: "strength" };
        if (setG.has(disp)) return { display: disp, kind: "gap" };
        return null;
      }).filter(Boolean);
      teaching.topics_queue = ordered;
    }

    teaching.mode = "active";
    teaching.current_topic_index = 0;
    teaching.transcript = teaching.transcript || [];
    teaching.profileContext = {
      job_nature: session.intake?.job_nature || "", experience_years_band: session.intake?.experience_years_band || "",
      job_title_exact: session.intake?.job_title_exact || "", sector: session.intake?.sector || "", learning_reason: session.intake?.learning_reason || "",
    };

    const first = teaching.topics_queue[0];
    if (!first) return res.status(400).json({ error: true, message: (session.lang === "ar") ? "لا توجد مواضيع للشرح." : "No topics to teach." });

    logTeach("start.data", { sessionId, lang: teaching.lang, first });

    // DB Setup / Resume
    if (req.session.userId) {
      try {
        const noteData = await getOrCreateTeachingNote(req.session.userId);
        if (noteData) {
          teaching.dbNoteId = noteData.id;
          teaching.dbAssessmentId = noteData.assessmentId;
          if (noteData.isResume && noteData.threadId) {
            teaching.assistant = teaching.assistant || {};
            teaching.assistant.threadId = noteData.threadId;
            teaching.transcript = noteData.transcript || [];
            logTeach("teaching.resume", { noteId: noteData.id, threadId: noteData.threadId, transcriptLen: teaching.transcript.length });
          } else {
            logTeach("teaching.new", { noteId: noteData.id, assessmentId: noteData.assessmentId });
          }
        }
      } catch (dbErr) { console.error("[TEACH-START] Database error:", dbErr); }
    }

    // OpenAI Assistant Flow
    if (TEACH_ASSISTANT_ID && TEACH_VECTOR_STORE_ID) {
      if (!teaching.assistant?.threadId) {
        const createdThread = await openai.beta.threads.create();
        const threadId = createdThread?.id;
        if (!threadId) throw new Error("Failed to create thread");
        teaching.assistant.threadId = threadId;
        logTeach("thread.created", { threadId });

        if (req.session.userId && teaching.dbNoteId) {
          try { await updateTeachingNote(teaching.dbNoteId, { threadId: threadId }); logTeach("thread.saved_to_db", { noteId: teaching.dbNoteId, threadId }); } catch (dbErr) { console.error("[TEACH-START] Failed to save threadId:", dbErr); }
        }
      }

      const threadId = teaching.assistant.threadId;
      const topicsLine = teaching.topics_queue.map((t, i) => `${i + 1}) ${t.display} [${t.kind}]`).join(" | ");
      const openingMsg = (teaching.lang === "ar")
        ? [`سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`, `الموضوعات بالترتيب: ${topicsLine}`, `ابدأ بالموضوع الأول: "${first.display}" (النوع: ${first.kind}).`].join("\n")
        : [`Profile context: ${JSON.stringify(teaching.profileContext || {})}`, `Topics (ordered): ${topicsLine}`, `Start with: "${first.display}" (kind: ${first.kind}).`].join("\n");

      await openai.beta.threads.messages.create(threadId, { role: "user", content: openingMsg });

      const run = await openai.beta.threads.runs.create(threadId, { assistant_id: TEACH_ASSISTANT_ID, instructions: getTeachingSystemPrompt({ lang: teaching.lang }) });
      if (!run?.id) throw new Error("Failed to create run");
      logTeach("run.created", { threadId, runId: run.id });

      const finalRun = await pollRunUntilDone(threadId, run.id);
      if (finalRun.status === "completed") {
        const msgs = await openai.beta.threads.messages.list(threadId, { order: "desc", limit: 5 });
        const text = (msgs.data.find(m => m.role === "assistant")?.content?.[0]?.text?.value || "").trim();
        if (text) {
          pushTranscript(session, { from: "tutor", text });
          return res.json({ message: text });
        }
      }

      const fb = (session.lang === "ar") ? "هنبدأ شرح أول موضوع بشكل بسيط خطوة بخطوة." : "Let’s start with the first topic, step by step.";
      pushTranscript(session, { from: "tutor", text: fb });
      return res.json({ message: fb });
    }

    // Fallback without Assistant
    const sys = getTeachingSystemPrompt({ lang: teaching.lang });
    const userSeed = (teaching.lang === "ar")
      ? [`سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`, `ابدأ بالموضوع: "${first.display}" (النوع: ${first.kind}).`].join("\n")
      : [`Profile context: ${JSON.stringify(teaching.profileContext || {})}`, `Start with topic: "${first.display}" (kind: ${first.kind}).`].join("\n");

    const completion = await openai.chat.completions.create({ model: "gpt-5", messages: [{ role: "system", content: sys }, { role: "user", content: userSeed }], temperature: 0.2, top_p: 1, max_completion_tokens: 2200 });
    const text = (completion?.choices?.[0]?.message?.content || "").trim();
    pushTranscript(session, { from: "tutor", text });
    return res.json({ message: text });

  } catch (err) {
    console.error("/api/teach/start error:", err?.message || err, err?.stack);
    return res.status(500).json({ error: true, message: "Teaching start failed." });
  }
});

/* =================================
   Teaching: user sends a chat message
   ================================= */

app.post("/api/teach/message", async (req, res) => {
  try {
    const { sessionId, text, userMessage } = req.body || {};
    const userText = (text ?? userMessage ?? "").toString().trim();
    const session = getSession(sessionId);
    const teaching = ensureTeachingState(session);
    req.session.lastSessionId = sessionId; // Bind session

    if (!userText) return res.status(400).json({ error: true, message: "Empty message." });
    if (teaching.mode !== "active") { logTeach("message.inactive", { sessionId }); return res.status(400).json({ error: true, message: (session.lang === "ar" ? "الشرح غير مفعّل حالياً." : "Teaching is not active right now.") }); }

    const lang = teaching.lang || session.lang || "ar";
    const current = teaching.topics_queue[teaching.current_topic_index || 0] || { display: "", kind: "gap" };
    const currentTopic = current.display || "";

    try { pushTranscript(session, { from: "user", text: userText }); } catch {}

    if (TEACH_ASSISTANT_ID && TEACH_VECTOR_STORE_ID) {
      if (!teaching.assistant?.threadId) {
        const createdThread = await openai.beta.threads.create();
        teaching.assistant.threadId = createdThread?.id;
        if (!teaching.assistant.threadId) throw new Error("Failed to create Thread (no id)");
        logTeach("thread.created@message", { threadId: teaching.assistant.threadId });
      }

      const threadId = teaching.assistant.threadId;
      const userPayload = (lang === "ar")
        ? [`سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`, `الموضوع الحالي: "${current.display}" (النوع: ${current.kind}).`, `رسالة المتعلم: ${userText}`].join("\n")
        : [`Profile context: ${JSON.stringify(teaching.profileContext || {})}`, `Current topic: "${current.display}" (kind: ${current.kind}).`, `Learner message: ${userText}`].join("\n");

      await openai.beta.threads.messages.create(threadId, { role: "user", content: userPayload });

      const run = await openai.beta.threads.runs.create(threadId, { assistant_id: TEACH_ASSISTANT_ID, instructions: getTeachingSystemPrompt({ lang }) });
      if (!run?.id) throw new Error("Failed to create Run (no id)");
      logTeach("run.created@message", { threadId, runId: run.id });

      const finalRun = await pollRunUntilDone(threadId, run.id);

      if (finalRun.status === "completed") {
        const msgs = await openai.beta.threads.messages.list(threadId, { order: "desc", limit: 6 });
        const reply = (msgs.data.find(m => m.role === "assistant")?.content?.[0]?.text?.value || "").trim();
        if (reply) {
          try { pushTranscript(session, { from: "tutor", text: reply, topic: currentTopic }); } catch {}
          if (req.session.userId && teaching.dbNoteId && teaching.transcript) { try { await updateTeachingNote(teaching.dbNoteId, { transcript: teaching.transcript }); } catch (dbErr) { console.error("[TEACH-MESSAGE] Failed to save transcript:", dbErr); } }
          return res.json({ message: reply });
        }
      }

      const fb = (lang === "ar") ? "تمام، خلّيني أوضّحها خطوة خطوة." : "Okay, let me break it down step by step.";
      try { pushTranscript(session, { from: "tutor", text: fb, topic: currentTopic }); } catch {}
      if (req.session.userId && teaching.dbNoteId && teaching.transcript) { try { await updateTeachingNote(teaching.dbNoteId, { transcript: teaching.transcript }); } catch (dbErr) { console.error("[TEACH-MESSAGE] Failed to save transcript:", dbErr); } }
      return res.json({ message: fb });
    }

    // Fallback without Assistant
    const sys = getTeachingSystemPrompt({ lang });
    const userTurn = (lang === "ar")
      ? [`سياق المستخدم: ${JSON.stringify(teaching.profileContext || {})}`, `الموضوع الحالي: "${current.display}" (النوع: ${current.kind}).`, `رسالة المتعلم: ${userText}`].join("\n")
      : [`Profile context: ${JSON.stringify(teaching.profileContext || {})}`, `Current topic: "${current.display}" (kind: ${current.kind}).`, `Learner message: ${userText}`].join("\n");

    const completion = await openai.chat.completions.create({ model: "gpt-5", messages: [{ role: "system", content: sys }, { role: "user", content: userTurn }], temperature: 0.2, top_p: 1, max_completion_tokens: 2000 });
    const reply = (completion?.choices?.[0]?.message?.content || "").trim();
    try { pushTranscript(session, { from: "tutor", text: reply, topic: currentTopic }); } catch {}

    if (req.session.userId && teaching.dbNoteId && teaching.transcript) { try { await updateTeachingNote(teaching.dbNoteId, { transcript: teaching.transcript }); } catch (dbErr) { console.error("[TEACH-MESSAGE] Failed to save transcript:", dbErr); } }
    return res.json({ message: reply });

  } catch (err) {
    console.error("/api/teach/message error:", err?.message || err, err?.stack);
    return res.status(500).json({ error: true, message: "Teaching message failed." });
  }
});

/* =================================
   Teaching: save transcript to database
   ================================= */

app.post("/api/teach/save", async (req, res) => {
  try {
    const { sessionId, autoSave } = req.body || {};
    const session = getSession(sessionId);
    const teaching = ensureTeachingState(session);
    const lang = session.lang || "en";

    if (!req.session.userId) return res.status(401).json({ error: true, message: lang === "ar" ? "يجب تسجيل الدخول لحفظ الشرح" : "Must be logged in to save explanation" });
    if (!teaching.transcript?.length) return res.status(400).json({ error: true, message: lang === "ar" ? "لا يوجد محتوى للحفظ" : "No content to save" });

    let title;
    if (teaching.dbNoteId) {
      try {
        await finalizeTeachingNote(teaching.dbNoteId, teaching.transcript, lang);
        title = lang === "ar" ? `شرح ${new Date().toLocaleDateString('ar-EG')}` : `Explanation ${new Date().toLocaleDateString('en-US')}`;
        console.log(`[TEACH] Finalized teaching note ${teaching.dbNoteId} for user ${req.session.userId}`);
        teaching.transcript = []; teaching.mode = "idle"; teaching.current_topic_index = 0; teaching.dbNoteId = null; teaching.dbAssessmentId = null;

        return res.json({
          ok: true, title,
          message: autoSave ? (lang === "ar" ? "تم حفظ الشرح تلقائيًا" : "Explanation auto-saved") : (lang === "ar" ? `تم حفظ "${title}" بنجاح!` : `"${title}" saved successfully!`),
        });
      } catch (dbErr) { console.error("[TEACH-SAVE] Failed to finalize teaching note:", dbErr); }
    }

    const { db, teachingNotes } = await import('./db.js');
    const { eq, count } = await import('drizzle-orm');

    const explanationNumber = ((await db.select({ count: count() }).from(teachingNotes).where(eq(teachingNotes.userId, req.session.userId)))[0]?.count || 0) + 1;
    title = lang === "ar" ? `الشرح ${explanationNumber}` : `Explanation ${explanationNumber}`;

    const transcriptText = teaching.transcript.map(entry => {
        const label = entry.from === "user" ? (lang === "ar" ? "أنا" : "Me") : (lang === "ar" ? "المعلم" : "Tutor");
        return `${label}: ${entry.text}`;
      }).join("\n\n");

    await db.insert(teachingNotes).values({
      userId: req.session.userId, topicDisplay: title, text: transcriptText,
      transcript: teaching.transcript, inProgress: false, threadId: teaching.assistant?.threadId || null, assessmentId: null
    });

    teaching.transcript = []; teaching.mode = "idle"; teaching.current_topic_index = 0;
    console.log(`[TEACH] Saved explanation "${title}" for user ${req.session.userId}`);

    return res.json({
      ok: true, title,
      message: lang === "ar" ? `تم حفظ "${title}" بنجاح!` : `"${title}" saved successfully!`,
    });

  } catch (err) {
    console.error("/api/teach/save error:", err);
    return res.status(500).json({ error: true, message: (req.body?.lang || "en") === "ar" ? "فشل حفظ الشرح" : "Failed to save explanation" });
  }
});

// Health check & SPA fallback
app.get("/api/health", (req, res) => res.json({ status: "ok", sessions: sessions.size }));
app.get("*", (req, res) => res.sendFile(join(__dirname, "../public/index.html")));

const port = parseInt(process.env.PORT || "5000", 10);
app.listen(port, "0.0.0.0", () => console.log(`Server running on port ${port}`));