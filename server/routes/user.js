import express from 'express';
import * as authService from '../services/authService.js';
import * as userService from '../services/userService.js';
import { requireAuth, requireVerified } from '../middleware/security.js';

const router = express.Router();

/**
 * GET /api/state
 * Get user's current app state (for resuming session)
 */
router.get('/state', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user profile
    const user = await authService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get or create active attempt
    const attempt = await authService.getOrCreateAttempt(userId);
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: !!user.email_verified_at
      },
      currentStep: attempt.current_step,
      attemptId: attempt.id,
      intake: user.profile_json || {},
      intakeStepIndex: attempt.intake_step_index || 0,
      assessmentState: attempt.assessment_state || {
        currentLevel: 'L1',
        attempts: 0,
        evidence: [],
        askedClusters: { L1: [], L2: [], L3: [] },
        currentQuestionCount: 0
      },
      reportData: attempt.report_data
    });
    
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/me
 * Get user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await authService.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      profile: user.profile_json || {},
      emailVerified: !!user.email_verified_at,
      createdAt: user.created_at
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/me
 * Update user profile
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { profile } = req.body;
    
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'Invalid profile data' });
    }
    
    await authService.updateUserProfile(userId, profile);
    
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/attempts
 * Get user's assessment attempts
 */
router.get('/attempts', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const userAttempts = await authService.getUserAttempts(userId);
    
    const formatted = userAttempts.map(attempt => ({
      id: attempt.id,
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      difficultyTier: attempt.difficulty_tier,
      totalQuestions: attempt.total_questions,
      correctAnswers: attempt.correct_answers,
      scorePercent: attempt.score_percent,
      currentLevel: attempt.current_level,
      currentStep: attempt.current_step,
      isComplete: !!attempt.finished_at
    }));
    
    res.json({ attempts: formatted });
    
  } catch (error) {
    console.error('Get attempts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/attempts/:id
 * Get specific attempt details
 */
router.get('/attempts/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const attemptId = req.params.id;
    
    const attempt = await authService.getAttemptById(attemptId);
    
    if (!attempt || attempt.user_id !== userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Get attempt items
    const items = await userService.getAttemptItems(attemptId);
    
    res.json({
      attempt: {
        id: attempt.id,
        startedAt: attempt.started_at,
        finishedAt: attempt.finished_at,
        difficultyTier: attempt.difficulty_tier,
        totalQuestions: attempt.total_questions,
        correctAnswers: attempt.correct_answers,
        scorePercent: attempt.score_percent,
        currentLevel: attempt.current_level,
        reportData: attempt.report_data
      },
      items
    });
    
  } catch (error) {
    console.error('Get attempt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/attempts/new
 * Start a new assessment attempt
 */
router.post('/attempts/new', requireAuth, requireVerified, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { mode = 'normal' } = req.body;
    
    const difficultyTier = mode === 'advanced' ? 'advanced' : 'normal';
    
    // Create new attempt
    const newAttempt = await authService.getOrCreateAttempt(userId, difficultyTier);
    
    res.json({
      success: true,
      attemptId: newAttempt.id,
      message: mode === 'advanced' 
        ? 'Starting advanced assessment...'
        : 'Starting new assessment...'
    });
    
  } catch (error) {
    console.error('New attempt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/teaching-notes
 * Get user's teaching notes
 */
router.get('/teaching-notes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const notes = await userService.getUserTeachingNotes(userId);
    
    res.json({ notes });
    
  } catch (error) {
    console.error('Get teaching notes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
