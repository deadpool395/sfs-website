const { csrfSync } = require('csrf-sync');

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.body?._csrf || req.get('x-csrf-token'),
});

function requireAdmin(req, res, next) {
  if (req.session?.adminId) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

// Expose a CSRF token to every rendered view.
function csrfLocals(req, res, next) {
  res.locals.csrfToken = generateToken(req);
  next();
}

module.exports = { requireAdmin, csrfProtection: csrfSynchronisedProtection, csrfLocals };
