import express from 'express';
import * as authService from '../services/authService.js';
import * as emailService from '../services/emailService.js';
import { validators } from '../../shared/schema.js';

const router = express.Router();

// Simple validation helpers
function validateStartAuth(body) {
  const errors = [];
  if (!body.email || !validators.isValidEmail(body.email)) {
    errors.push('Valid email is required');
  }
  if (!body.profileJson || typeof body.profileJson !== 'object') {
    errors.push('Profile data is required');
  }
  if (body.lang && !['en', 'ar'].includes(body.lang)) {
    errors.push('Language must be en or ar');
  }
  return errors;
}

function validatePassword(password) {
  if (!password || !validators.isValidPassword(password)) {
    return 'Password must be at least 8 characters';
  }
  return null;
}

function validateUserId(userId) {
  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    return 'Valid user ID is required';
  }
  return null;
}

/**
 * POST /api/auth/start
 * Create user account and send verification email
 */
router.post('/start', async (req, res) => {
  try {
    const errors = validateStartAuth(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation error', details: errors });
    }

    const { email, profileJson, lang = 'en' } = req.body;
    
    // Check if user already exists
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      if (existingUser.email_verified_at) {
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
      await authService.markEmailVerified(emailToken.user_id);
      
      // Return user ID for password setting
      return res.json({
        success: true,
        userId: emailToken.user_id,
        action: 'set_password',
        message: 'Email verified! Please set your password.'
      });
    } else {
      // Password reset - return user ID for password setting
      return res.json({
        success: true,
        userId: emailToken.user_id,
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
    const { userId, password } = req.body;
    
    const userIdError = validateUserId(userId);
    if (userIdError) {
      return res.status(400).json({ error: userIdError });
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    
    // Verify user exists and is verified
    const user = await authService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.email_verified_at) {
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
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !validators.isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    const user = await authService.findUserByEmail(email);
    
    if (!user || !user.pass_hash) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    const isValid = await authService.verifyPassword(password, user.pass_hash);
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }
    
    if (!user.email_verified_at) {
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
    const { email, lang = 'en' } = req.body;
    
    if (!email || !validators.isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    const user = await authService.findUserByEmail(email);
    
    // Always return success for security (don't leak user existence)
    if (user && user.email_verified_at) {
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
    const { token, password } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    
    const emailToken = await authService.verifyAndConsumeToken(token, 'reset');
    
    if (!emailToken) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        message: 'The reset link has expired or has already been used'
      });
    }
    
    // Set new password
    await authService.setUserPassword(emailToken.user_id, password);
    
    res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
