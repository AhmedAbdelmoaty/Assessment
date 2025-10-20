// Auth middleware
export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Optional auth middleware (adds userId to req if logged in, but doesn't block)
export function optionalAuth(req, res, next) {
  // Just pass through, session will have userId if logged in
  next();
}
