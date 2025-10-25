import express from 'express';
import bcrypt from 'bcrypt';
import { db, users, authOtps } from '../db.js';
import { eq, and, isNull, gt, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import nodemailer from 'nodemailer';

const router = express.Router();

// Email configuration
let transporter = null;
const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

if (SMTP_CONFIGURED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, username, email, phone, password, confirmPassword } = req.body;

    // Validation
    if (!name || !username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }

    if (!/^[a-z0-9_-]+$/i.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if email or username already exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(
        sql`${users.email} = ${email} OR ${users.username} = ${username}`
      );

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.email === email) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      if (existingUser.username === username) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    // Hash password
    const passHash = await bcrypt.hash(password, 10);

    // Create user
    const [newUser] = await db.insert(users).values({
      email,
      username,
      passHash,
      profileJson: { name, phone: phone || null },
      emailVerifiedAt: null
    }).returning();

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.insert(authOtps).values({
      userId: newUser.id,
      code: otpCode,
      expiresAt,
      consumedAt: null
    });

    // Send OTP via email or log to console
    if (SMTP_CONFIGURED && transporter) {
      try {
        await transporter.sendMail({
          from: process.env.FROM_EMAIL || process.env.SMTP_USER,
          to: email,
          subject: 'Verify your email - Learning Assessment Platform',
          html: `
            <h2>Email Verification</h2>
            <p>Hello ${name},</p>
            <p>Your verification code is: <strong>${otpCode}</strong></p>
            <p>This code will expire in 15 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `
        });
        console.log(`[EMAIL] OTP sent to ${email}`);
      } catch (emailError) {
        console.error('[EMAIL ERROR]', emailError);
        console.log(`[DEV MODE] OTP for ${email}: ${otpCode}`);
      }
    } else {
      console.log(`[DEV MODE] OTP for ${email}: ${otpCode}`);
    }

    res.json({ 
      ok: true,
      devMode: !SMTP_CONFIGURED
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find latest unconsumed OTP
    const otps = await db
      .select()
      .from(authOtps)
      .where(
        and(
          eq(authOtps.userId, user.id),
          isNull(authOtps.consumedAt)
        )
      )
      .orderBy(desc(authOtps.createdAt))
      .limit(1);

    if (otps.length === 0) {
      return res.status(400).json({ error: 'No valid OTP found' });
    }

    const otp = otps[0];

    // Check expiration
    if (new Date() > new Date(otp.expiresAt)) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Compare codes (as strings to preserve leading zeros)
    if (otp.code !== code) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    // Mark OTP as consumed
    await db
      .update(authOtps)
      .set({ consumedAt: new Date() })
      .where(eq(authOtps.id, otp.id));

    // Mark email as verified
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id));

    res.json({ ok: true });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Server error during verification' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.emailVerifiedAt) {
      return res.status(401).json({ error: 'Please verify your email first' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passHash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }

      // Create session with user data
      req.session.userId = user.id;
      req.session.email = user.email;

      res.json({ ok: true });
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.json({ ok: true });
  });
});

    // GET /api/session/state
    router.get('/session/state', async (req, res) => {
      try {
        const { sessionId } = req.query;

        // If no sessionId provided, return basic state
        if (!sessionId) {
          if (!req.session.userId) {
            return res.json({ loggedIn: false, stage: null, messages: [] });
          }

          const userId = req.session.userId;
          const [user] = await db.select().from(users).where(eq(users.id, userId));

          if (!user) {
            return res.json({ loggedIn: false, stage: null, messages: [] });
          }

          const profile = user.profileJson || {};
          let stage = 'idle';
          if (!profile.intakeCompleted) {
            stage = 'intake-pending';
          }

          return res.json({
            loggedIn: true,
            stage,
            messages: [],
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              name: profile.name
            }
          });
        }

        // Fetch chat history for this sessionId
        const { chatMessages } = await import('../db.js');
        const { desc } = await import('drizzle-orm');
        const { eq } = await import('drizzle-orm');

        const messages = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId))
          .orderBy(chatMessages.createdAt);

        // Determine stage from messages
        let stage = 'idle';
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.messageType === 'mcq') stage = 'assessment';
          else if (lastMsg.messageType === 'report') stage = 'report';
          else if (lastMsg.messageType === 'teaching') stage = 'teaching';
          else if (lastMsg.messageType === 'intake') stage = 'intake';
        }

        return res.json({
          loggedIn: !!req.session.userId,
          sessionId,
          stage,
          messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            messageType: m.messageType,
            metadata: m.metadata,
            createdAt: m.createdAt
          }))
        });

      } catch (error) {
        console.error('Session state error:', error);
        res.status(500).json({ error: 'Server error' });
      }
    });

export default router;
