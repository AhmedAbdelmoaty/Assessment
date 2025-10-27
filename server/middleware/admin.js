import { db, users } from '../db.js';
import { eq } from 'drizzle-orm';

/**
 * Middleware to check if the logged-in user is an admin
 * Responds with JSON 403 for API routes, redirects for HTML routes
 */
export async function requireAdmin(req, res, next) {
  // Check if user is logged in
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login.html');
  }

  try {
    // Fetch user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user) {
      req.session.destroy();
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'User not found' });
      }
      return res.redirect('/login.html');
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return res.redirect('/dashboard.html');
    }

    // Attach user to request for convenience
    req.user = user;
    next();
  } catch (error) {
    console.error('[ADMIN MIDDLEWARE ERROR]', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Middleware to redirect admins away from regular user pages
 * Use on user-only routes like /dashboard.html, /chat.html
 */
export async function redirectAdmins(req, res, next) {
  // Only check if user is logged in
  if (!req.session || !req.session.userId) {
    return next();
  }

  try {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (user && user.role === 'admin') {
      return res.redirect('/admin.html');
    }

    next();
  } catch (error) {
    console.error('[REDIRECT ADMINS ERROR]', error);
    next();
  }
}
