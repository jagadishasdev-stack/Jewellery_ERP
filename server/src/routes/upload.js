/**
 * File Upload Route — logo, stamp, signature for Invoice Studio
 * Saves files to /server/uploads/ and returns URL
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { getUploadsRoot } = require('../utils/uploadsDir');

// The single source of truth for which upload sub-folders exist — used to
// create them below, to pick a safe destination for a new upload, AND to
// validate `type` on delete (see the DELETE route further down).
const UPLOAD_TYPES = ['logos', 'stamps', 'signatures', 'scheme-groups', 'approval-items'];

// Ensure upload dirs exist
UPLOAD_TYPES.forEach(d => {
  const full = path.join(getUploadsRoot(), d);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.query.type || 'logos'; // logos | stamps | signatures | scheme-groups | approval-items
    const folder = UPLOAD_TYPES.includes(type) ? type : 'logos';
    cb(null, path.join(getUploadsRoot(), folder));
  },
  filename: (req, file, cb) => {
    const tenantId = req.user?.tenantId || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${tenantId}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg','.jpeg','.png','.svg','.gif','.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only image files allowed (JPG, PNG, SVG, GIF, WEBP)'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// ── POST /api/upload/image ─────────────────────────────────────────────────────
// upload.single('file') wrapped in its own error handler: when fileFilter
// rejects a file (wrong extension) or the 5MB limit is exceeded, multer
// calls next(err) rather than invoking the route handler at all — the
// `if (!req.file)` check below the middleware was dead code for that case,
// since it never got reached. Uncaught, that error fell through to the
// app's generic error handler, which always replies with a flat "An
// unexpected error occurred." 500 and discards fileFilter's own actually-
// useful message ("Only image files allowed..."). Now surfaced as a clean
// 400 with the real reason.
router.post('/image', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return sendError(res, 400, err.message || 'Upload failed.');
    next();
  });
}, (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded or invalid file type.');

  const type = req.query.type || 'logos';
  const url = `/uploads/${type}/${req.file.filename}`;

  return sendSuccess(res, {
    url,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    type,
  }, 'File uploaded successfully.');
});

// ── DELETE /api/upload/image ───────────────────────────────────────────────────
router.delete('/image', authenticate, (req, res) => {
  const { filename, type = 'logos' } = req.body;
  if (!filename) return sendError(res, 400, 'Filename required.');
  // `type` used to go straight into path.join() unchecked, unlike the
  // upload destination above which whitelists it — a caller could pass
  // type: '../../../../etc' (or any other traversal) and path.join would
  // walk right out of the uploads directory, letting an authenticated user
  // delete arbitrary files the Node process has permission to remove.
  // path.basename(filename) alone doesn't help since `type` is a separate,
  // unsanitized path segment.
  if (!UPLOAD_TYPES.includes(type)) return sendError(res, 400, 'Invalid type.');
  const filePath = path.join(getUploadsRoot(), type, path.basename(filename));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return sendSuccess(res, null, 'File deleted.');
  } catch { return sendError(res, 500, 'Failed to delete file.'); }
});

module.exports = router;
