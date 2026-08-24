const path = require('path');

// Normal server run: uploads/ lives next to the server source, same as before.
// Packaged desktop app: Electron's main process sets UPLOADS_DIR to a writable
// per-user location (the install directory itself may be read-only).
function getUploadsRoot() {
  return process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
}

module.exports = { getUploadsRoot };
