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

// Ensure upload dirs exist
const dirs = ['logos', 'stamps', 'signatures', 'scheme-groups', 'approval-items'];
dirs.forEach(d => {
  const full = path.join(getUploadsRoot(), d);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.query.type || 'logos'; // logos | stamps | signatures | scheme-groups | approval-items
    const allowed = ['logos','stamps','signatures','scheme-groups','approval-items'];
    const folder = allowed.includes(type) ? type : 'logos';
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
router.post('/image', authenticate, upload.single('file'), (req, res) => {
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
  const filePath = path.join(getUploadsRoot(), type, path.basename(filename));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return sendSuccess(res, null, 'File deleted.');
  } catch { return sendError(res, 500, 'Failed to delete file.'); }
});

module.exports = router;
