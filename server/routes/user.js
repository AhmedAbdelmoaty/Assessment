import express from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import { db } from '../db.js';
import { attempts, attemptItems, teachingNotes } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
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
        emailVerified: !!user.emailVerifiedAt
      },
      currentStep: attempt.currentStep,
      attemptId: attempt.id,
      intake: user.profileJson || {},
      intakeStepIndex: attempt.intakeStepIndex || 0,
      assessmentState: attempt.assessmentState || {
        currentLevel: 'L1',
        attempts: 0,
        evidence: [],
        askedClusters: { L1: [], L2: [], L3: [] },
        currentQuestionCount: 0
      },
      reportData: attempt.reportData
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
      profile: user.profileJson || {},
      emailVerified: !!user.emailVerifiedAt,
      createdAt: user.createdAt
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
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      difficultyTier: attempt.difficultyTier,
      totalQuestions: attempt.totalQuestions,
      correctAnswers: attempt.correctAnswers,
      scorePercent: attempt.scorePercent,
      currentLevel: attempt.currentLevel,
      currentStep: attempt.currentStep,
      isComplete: !!attempt.finishedAt
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
    
    if (!attempt || attempt.userId !== userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Get attempt items
    const items = await db.select()
      .from(attemptItems)
      .where(eq(attemptItems.attemptId, attemptId))
      .orderBy(attemptItems.createdAt);
    
    res.json({
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        difficultyTier: attempt.difficultyTier,
        totalQuestions: attempt.totalQuestions,
        correctAnswers: attempt.correctAnswers,
        scorePercent: attempt.scorePercent,
        currentLevel: attempt.currentLevel,
        reportData: attempt.reportData
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
    
    const notes = await db.select()
      .from(teachingNotes)
      .where(eq(teachingNotes.userId, userId))
      .orderBy(desc(teachingNotes.createdAt));
    
    res.json({ notes });
    
  } catch (error) {
    console.error('Get teaching notes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
