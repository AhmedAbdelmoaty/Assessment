import express from 'express';
import { db, users, userAssessments, attempts, teachingNotes } from '../db.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Middleware to require authentication
export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// GET /api/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = user.profileJson || {};

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      name: profile.name,
      phone: profile.phone,
      intake: profile.intake || {},
      emailVerified: !!user.emailVerifiedAt,
      createdAt: user.createdAt
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/me
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, username, phone, intake } = req.body;

    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId));

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username is being changed and if it's unique
    if (username && username !== currentUser.username) {
      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 3-30 characters' });
      }

      if (!/^[a-z0-9_-]+$/i.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      if (existingUser && existingUser.id !== req.session.userId) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    // Merge with existing profileJson
    const currentProfile = currentUser.profileJson || {};
    const updatedProfile = {
      ...currentProfile,
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      ...(intake && { intake: { ...currentProfile.intake, ...intake } })
    };

    const updateData = {
      profileJson: updatedProfile
    };

    if (username && username !== currentUser.username) {
      updateData.username = username;
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.session.userId));

    res.json({ ok: true });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/me/assessments
router.get('/me/assessments', requireAuth, async (req, res) => {
  try {
    const assessments = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, req.session.userId))
      .orderBy(desc(attempts.startedAt));

    const formattedAssessments = assessments.map(a => ({
      id: a.id,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      completedAt: a.finishedAt, // Alias for backward compatibility
      difficulty: a.difficultyTier || a.difficulty,
      scorePercent: a.scorePercent || 0,
      totalQuestions: a.totalQuestions || 0,
      correctAnswers: a.correctAnswers || 0,
      currentLevel: a.currentLevel,
      status: a.finishedAt ? 'complete' : 'in-progress'
    }));

    res.json(formattedAssessments);

  } catch (error) {
    console.error('Get assessments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/me/explanations
router.get('/me/explanations', requireAuth, async (req, res) => {
  try {
    const explanations = await db
      .select()
      .from(teachingNotes)
      .where(eq(teachingNotes.userId, req.session.userId))
      .orderBy(desc(teachingNotes.createdAt));

    const formattedExplanations = explanations.map(e => ({
      id: e.id,
      topic: e.topicDisplay,
      content: e.text,
      createdAt: e.createdAt
    }));

    res.json(formattedExplanations);

  } catch (error) {
    console.error('Get explanations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
