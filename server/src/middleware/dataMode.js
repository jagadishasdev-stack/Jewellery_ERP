/**
 * dataMode middleware
 * ───────────────────
 * Reads the current Data_Mode from request header X-Data-Mode.
 * Injects req.dataMode (1, 2, or 3) into every request.
 * All route handlers read req.dataMode and filter queries accordingly.
 *
 * Modes:
 *   1 = Dummy / Practice
 *   2 = Unofficial ERP  (Ctrl+F5 screen)
 *   3 = Official ERP    (default, normal screen)
 */
const setDataMode = (req, res, next) => {
  const raw = parseInt(req.headers['x-data-mode'], 10);
  // Only allow 1, 2, 3 — default to 3 (official)
  req.dataMode = [1, 2, 3].includes(raw) ? raw : 3;
  next();
};

module.exports = { setDataMode };
