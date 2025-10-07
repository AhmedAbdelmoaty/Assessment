import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { getSystemPrompt } from './prompts/system.js';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// In-memory session store
const sessions = new Map();

// OpenAI client - the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

// Level and cluster definitions
const LEVELS = {
  L1: {
    clusters: [
      'measurement_scales_data_types',
      'central_tendency_basics', 
      'basic_spread_distribution_shape'
    ]
  },
  L2: {
    clusters: [
      'quantiles_iqr_boxplots',
      'standard_deviation_variability',
      'grouped_summaries'
    ]
  },
  L3: {
    clusters: [
      'z_scores_standardization',
      'skewness_kurtosis_diagnostics',
      'correlation_vs_covariance'
    ]
  }
};

// Country list (ISO-3166)
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Brazil", "Bulgaria", "Cambodia",
  "Canada", "Chile", "China", "Colombia", "Croatia", "Cyprus", "Czech Republic", "Denmark",
  "Ecuador", "Egypt", "Estonia", "Finland", "France", "Georgia", "Germany", "Ghana",
  "Greece", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia",
  "Lebanon", "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco", "Netherlands", "New Zealand",
  "Nigeria", "Norway", "Oman", "Pakistan", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Saudi Arabia", "Singapore", "Slovakia", "Slovenia", "South Africa",
  "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Thailand", "Turkey", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Venezuela", "Vietnam"
];

// Initialize or get session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      lang: 'en',
      currentStep: 'intake',
      intake: {},
      assessment: {
        currentLevel: 'L1',
        attempts: 0,
        evidence: [],
        askedClusters: { L1: [], L2: [], L3: [] },
        currentQuestionCount: 0
      },
      finished: false
    });
  }
  return sessions.get(sessionId);
}

// POST /api/intake/next - Handle intake flow
app.post('/api/intake/next', async (req, res) => {
  try {
    const { sessionId = randomUUID(), lang = 'en', answer } = req.body;
    const session = getSession(sessionId);
    session.lang = lang;
    
    const intake = session.intake;
    let nextStep = null;
    let choices = null;
    let dropdown = null;
    let message = '';
    let validation = null;

    // Determine current intake step
    if (!intake.name) {
      if (answer) {
        const words = answer.trim().split(/\s+/);
        if (words.length < 2) {
          validation = lang === 'ar' 
            ? 'يرجى إدخال الاسم الكامل (الاسم الأول والأخير على الأقل)'
            : 'Please enter your full name (at least first and last name)';
        } else {
          intake.name = answer;
        }
      }
      
      if (!intake.name) {
        message = lang === 'ar' 
          ? 'مرحبًا! لنبدأ بالتعرف عليك. ما هو اسمك الكامل؟'
          : 'Hello! Let\'s start by getting to know you. What is your full name?';
      }
    } else if (!intake.email) {
      if (answer) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(answer)) {
          validation = lang === 'ar' 
            ? 'يرجى إدخال عنوان بريد إلكتروني صحيح'
            : 'Please enter a valid email address';
        } else {
          intake.email = answer;
        }
      }
      
      if (!intake.email) {
        message = lang === 'ar' 
          ? 'ما هو عنوان بريدك الإلكتروني؟'
          : 'What is your email address?';
      }
    } else if (!intake.ageBand) {
      if (answer) {
        intake.ageBand = answer;
      } else {
        message = lang === 'ar' 
          ? 'ما هي فئتك العمرية؟'
          : 'What is your age range?';
        choices = ["16–17","18–24","25–34","35–44","45–54","55+"];
      }
    } else if (!intake.country) {
      if (answer) {
        if (COUNTRIES.includes(answer)) {
          intake.country = answer;
        } else {
          validation = lang === 'ar' 
            ? 'يرجى اختيار دولة من القائمة'
            : 'Please select a country from the list';
        }
      } else {
        message = lang === 'ar' 
          ? 'في أي دولة تقيم؟'
          : 'Which country do you live in?';
        dropdown = COUNTRIES;
      }
    } else if (!intake.jobNature) {
      if (answer) {
        intake.jobNature = answer;
      } else {
        message = lang === 'ar' 
          ? 'ما هو طبيعة عملك أو قسمك؟'
          : 'What is the nature of your work or department?';
        choices = lang === 'ar' 
          ? ["المالية/المحاسبة","المبيعات","التسويق","العمليات","الموارد البشرية","تقنية المعلومات/البيانات","خدمة العملاء","المنتج/الهندسة","سلسلة الإمداد/اللوجستيات","الرعاية الصحية","التعليم","العقارات","التصنيع","القطاع الحكومي/العام","عمل حر/استشارات","أخرى"]
          : ["Accounting/Finance","Sales","Marketing","Operations","HR","IT/Data","Customer Support","Product/Engineering","Supply Chain/Logistics","Healthcare","Education","Real Estate","Manufacturing","Government/Public","Freelance/Consulting","Other"];
      }
    } else if (!intake.experienceYears) {
      if (answer) {
        intake.experienceYears = answer;
      } else {
        message = lang === 'ar' 
          ? 'كم سنة من الخبرة لديك؟'
          : 'How many years of experience do you have?';
        choices = lang === 'ar' 
          ? ["أقل من سنة","1–2 سنوات","3–5 سنوات","6–9 سنوات","10–14 سنة","15+ سنة"]
          : ["<1y","1–2y","3–5y","6–9y","10–14y","15y+"];
      }
    } else if (!intake.jobTitle) {
      if (answer) {
        intake.jobTitle = answer;
      } else {
        message = lang === 'ar' 
          ? 'ما هو مسماك الوظيفي بالضبط؟'
          : 'What is your exact job title?';
      }
    } else if (!intake.sector) {
      if (answer) {
        intake.sector = answer;
      } else {
        message = lang === 'ar' 
          ? 'في أي قطاع أو صناعة تعمل؟'
          : 'Which sector or industry do you work in?';
        choices = lang === 'ar' 
          ? ["العقارات","التجزئة/التجارة الإلكترونية","البنوك/المالية","الاتصالات","السلع الاستهلاكية السريعة","الرعاية الصحية","التعليم","التصنيع","الإعلام/الإعلان","السفر/الضيافة","الحكومي/العام","التقنية/البرمجيات","أخرى"]
          : ["Real Estate","Retail/E-commerce","Banking/Finance","Telecom","FMCG","Healthcare","Education","Manufacturing","Media/Advertising","Travel/Hospitality","Government/Public","Technology/Software","Other"];
      }
    } else if (!intake.learningReason) {
      if (answer) {
        intake.learningReason = answer;
      } else {
        message = lang === 'ar' 
          ? 'ما هو سبب رغبتك في تعلم تحليل البيانات؟'
          : 'What is your reason for wanting to learn data analysis?';
        choices = lang === 'ar' 
          ? ["تغيير مسار","ترقية","احتياج مشروع","تحديث مهارة","أكاديمي"]
          : ["Career shift","Promotion","Project need","Skill refresh","Academic"];
      }
    } else {
      // Intake complete
      session.currentStep = 'assessment';
      message = lang === 'ar' 
        ? 'شكرًا — خصصت التقييم وفق بياناتك. لنبدأ.'
        : 'Thanks — I\'ve tailored your assessment based on your profile. Let\'s begin.';
    }

    res.json({
      sessionId,
      message: validation || message,
      choices,
      dropdown,
      isComplete: session.currentStep === 'assessment',
      validation: !!validation
    });

  } catch (error) {
    console.error('Intake error:', error);
    res.status(500).json({ error: 'Server error during intake' });
  }
});

// POST /api/assess/next - Get next MCQ question
app.post('/api/assess/next', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    
    if (session.currentStep !== 'assessment') {
      return res.status(400).json({ error: 'Not in assessment phase' });
    }

    const assessment = session.assessment;
    const currentLevel = assessment.currentLevel;
    const availableClusters = LEVELS[currentLevel].clusters;
    const askedClusters = assessment.askedClusters[currentLevel] || [];
    const remainingClusters = availableClusters.filter(c => !askedClusters.includes(c));
    
    if (remainingClusters.length === 0 || assessment.currentQuestionCount >= 2) {
      return res.status(400).json({ error: 'No more questions available for this level' });
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
      avoidClusters: askedClusters
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate an MCQ for ${currentLevel} level, cluster: ${nextCluster}` }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048
    });

    const mcq = JSON.parse(response.choices[0].message.content);
    
    res.json({
      ...mcq,
      questionNumber: assessment.currentQuestionCount,
      totalQuestions: 2,
      level: currentLevel
    });

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ error: 'Server error during assessment' });
  }
});

// POST /api/assess/answer - Submit MCQ answer
app.post('/api/assess/answer', async (req, res) => {
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
      userAnswer
    });

    // Check progression rules
    const levelEvidence = assessment.evidence.filter(e => e.level === level);
    const correctCount = levelEvidence.filter(e => e.correct).length;
    const wrongCount = levelEvidence.length - correctCount;
    
    let nextAction = 'continue';
    let nextLevel = level;
    
    if (levelEvidence.length === 2) {
      if (correctCount >= 1) {
        // Advance to next level
        if (level === 'L1') {
          nextLevel = 'L2';
        } else if (level === 'L2') {
          nextLevel = 'L3';
        } else {
          // Completed all levels
          session.currentStep = 'report';
          nextAction = 'complete';
        }
      } else if (assessment.attempts === 0) {
        // Both wrong, retry once
        assessment.attempts = 1;
        assessment.askedClusters[level] = [];
        assessment.currentQuestionCount = 0;
        nextAction = 'retry';
      } else {
        // Failed retry, stop assessment
        session.currentStep = 'report';
        nextAction = 'stop';
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
      message: isCorrect ? 'Correct!' : 'Incorrect',
      canProceed: nextAction !== 'stop'
    });

  } catch (error) {
    console.error('Answer processing error:', error);
    res.status(500).json({ error: 'Server error processing answer' });
  }
});

// POST /api/report - Generate final report
app.post('/api/report', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    
    if (session.currentStep !== 'report') {
      return res.status(400).json({ error: 'Not in report phase' });
    }

    // Calculate strengths and gaps
    const evidence = session.assessment.evidence;
    const strengths = [];
    const gaps = [];
    
    // Add strengths from correct answers
    evidence.forEach(e => {
      if (e.correct && !strengths.includes(e.cluster)) {
        strengths.push(e.cluster);
      }
    });
    
    // Add gaps from wrong answers
    evidence.forEach(e => {
      if (!e.correct && !gaps.includes(e.cluster)) {
        gaps.push(e.cluster);
      }
    });
    
    // Add unvisited higher level clusters as gaps
    const highestLevel = session.assessment.currentLevel;
    const levels = ['L1', 'L2', 'L3'];
    const currentLevelIndex = levels.indexOf(highestLevel);
    
    for (let i = currentLevelIndex + 1; i < levels.length; i++) {
      const level = levels[i];
      LEVELS[level].clusters.forEach(cluster => {
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
      gaps
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the final assessment report based on the evidence provided" }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024
    });

    const report = JSON.parse(response.choices[0].message.content);
    session.report = report;
    session.finished = true;
    
    res.json(report);

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Server error generating report' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

// SPA fallback - must be last route (serves index.html for all non-API routes)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
