import express from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import * as emailService from '../services/emailService.js';

const router = express.Router();

// Validation schemas
const startAuthSchema = z.object({
  email: z.string().email(),
  profileJson: z.record(z.any()),
  lang: z.enum(['en', 'ar']).default('en'),
});

const setPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const requestResetSchema = z.object({
  email: z.string().email(),
  lang: z.enum(['en', 'ar']).default('en'),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

/**
 * POST /api/auth/start
 * Create user account and send verification email
 */
router.post('/start', async (req, res) => {
  try {
    const { email, profileJson, lang } = startAuthSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      if (existingUser.emailVerifiedAt) {
        return res.status(400).json({ 
          error: 'Email already registered',
          message: lang === 'ar' ? 'البريد الإلكتروني مسجل بالفعل' : 'This email is already registered'
        });
      }
      // Resend verification if not verified yet
      const token = await authService.createEmailToken(existingUser.id, 'verify');
      await emailService.sendVerificationEmail(email, token, lang);
      return res.json({ 
        message: lang === 'ar' 
          ? 'تم إرسال رابط التفعيل إلى بريدك الإلكتروني'
          : 'Verification link sent to your email'
      });
    }
    
    // Create new user
    const user = await authService.createUser(email, profileJson);
    
    // Create verification token
    const token = await authService.createEmailToken(user.id, 'verify');
    
    // Send verification email
    await emailService.sendVerificationEmail(email, token, lang);
    
    res.json({
      message: lang === 'ar' 
        ? 'تم إرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى التحقق من بريدك الإلكتروني.'
        : 'Verification link sent to your email. Please check your inbox.'
    });
    
  } catch (error) {
    console.error('Start auth error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/auth/verify?token=...&type=verify|reset
 * Verify email token or password reset token
 */
router.get('/verify', async (req, res) => {
  try {
    const { token, type = 'verify' } = req.query;
    
    if (!token || !['verify', 'reset'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    const emailToken = await authService.verifyAndConsumeToken(token, type);
    
    if (!emailToken) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        message: 'The link has expired or has already been used'
      });
    }
    
    if (type === 'verify') {
      // Mark email as verified
      await authService.markEmailVerified(emailToken.userId);
      
      // Return user ID for password setting
      return res.json({
        success: true,
        userId: emailToken.userId,
        action: 'set_password',
        message: 'Email verified! Please set your password.'
      });
    } else {
      // Password reset - return user ID for password setting
      return res.json({
        success: true,
        userId: emailToken.userId,
        action: 'reset_password',
        message: 'Please set your new password.'
      });
    }
    
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/set-password
 * Set password after email verification
 */
router.post('/set-password', async (req, res) => {
  try {
    const { userId, password } = setPasswordSchema.parse(req.body);
    
    // Verify user exists and is verified
    const user = await authService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.emailVerifiedAt) {
      return res.status(403).json({ error: 'Email not verified' });
    }
    
    // Set password
    await authService.setUserPassword(userId, password);
    
    // Create session
    req.session.userId = userId;
    req.session.email = user.email;
    req.session.emailVerified = true;
    
    res.json({
      success: true,
      message: 'Password set successfully! You are now logged in.'
    });
    
  } catch (error) {
    console.error('Set password error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const user = await authService.findUserByEmail(email);
    
    if (!user || !user.passHash) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    const isValid = await authService.verifyPassword(password, user.passHash);
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    if (!user.emailVerifiedAt) {
      return res.status(403).json({ 
        error: 'Email not verified',
        message: 'Please verify your email before logging in'
      });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.emailVerified = true;
    
    res.json({
      success: true,
      message: 'Logged in successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/logout
 * Logout and destroy session
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

/**
 * POST /api/auth/request-reset
 * Request password reset (always returns 200 for security)
 */
router.post('/request-reset', async (req, res) => {
  try {
    const { email, lang } = requestResetSchema.parse(req.body);
    
    const user = await authService.findUserByEmail(email);
    
    // Always return success for security (don't leak user existence)
    if (user && user.emailVerifiedAt) {
      const token = await authService.createEmailToken(user.id, 'reset');
      await emailService.sendResetEmail(email, token, lang);
    }
    
    res.json({
      success: true,
      message: lang === 'ar'
        ? 'إذا كان البريد الإلكتروني مسجلاً، ستتلقى رابط إعادة تعيين كلمة المرور.'
        : 'If the email is registered, you will receive a password reset link.'
    });
    
  } catch (error) {
    console.error('Request reset error:', error);
    // Still return success for security
    res.json({
      success: true,
      message: 'If the email is registered, you will receive a password reset link.'
    });
  }
});

/**
 * POST /api/auth/reset
 * Reset password with token
 */
router.post('/reset', async (req, res) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    
    const emailToken = await authService.verifyAndConsumeToken(token, 'reset');
    
    if (!emailToken) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        message: 'The reset link has expired or has already been used'
      });
    }
    
    // Set new password
    await authService.setUserPassword(emailToken.userId, password);
    
    res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
