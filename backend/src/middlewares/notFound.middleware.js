/**
 * @fileoverview Express middleware (notFound.middleware).
 * @module middlewares/notFound.middleware
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: 'Not Found',
      path: req.originalUrl,
      hint: 'Routes live under /api/... (try GET / health or POST /api/auth/login)',
    },
  });
}

module.exports = { notFound };
