/**
 * Data Migration Center — file parsing. Extends excelImport.js's
 * parseSheet() pattern (same XLSX read options: cellDates:true so a real
 * date-formatted cell arrives as a JS Date, not a serial number) to read
 * EVERY sheet of a workbook, not just the first — this tool needs to
 * detect and migrate several distinct entities that may all live in one
 * uploaded workbook (e.g. "Customer Master" + "Item Master" as separate
 * sheets in the same .xlsx).
 */
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

/**
 * Parses a single Excel/CSV buffer into { sheetName: rows[] } for every
 * sheet. A CSV file has exactly one "sheet".
 */
function parseWorkbookAllSheets(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
    if (rows.length) sheets[name] = rows; // skip genuinely empty sheets
  }
  return sheets;
}

/**
 * Extracts a .zip buffer into memory (no disk round-trip needed — AdmZip
 * reads/writes buffers directly) and returns [{ fileName, buffer }] for
 * every .xlsx/.xls/.csv entry found, silently skipping anything else
 * (folders, .DS_Store, README files, etc. — a customer's export zip is
 * never guaranteed to contain only spreadsheets).
 */
function extractZipEntries(buffer) {
  const zip = new AdmZip(buffer);
  const entries = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) continue;
    entries.push({ fileName: path.basename(entry.entryName), buffer: entry.getData() });
  }
  return entries;
}

/**
 * Top-level entry point: takes the uploaded files (multer's in-memory
 * file objects) and returns a flat, normalized structure —
 * [{ fileName, sheetName, rows }] — regardless of whether the source was
 * a single .xlsx, several files, or a .zip bundling several files. A ZIP
 * is expanded transparently; nothing downstream needs to know a zip was
 * involved at all.
 */
function parseUploadedFiles(files) {
  const result = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip') {
      for (const inner of extractZipEntries(file.buffer)) {
        const sheets = parseWorkbookAllSheets(inner.buffer);
        for (const [sheetName, rows] of Object.entries(sheets)) {
          result.push({ fileName: inner.fileName, sheetName, rows });
        }
      }
    } else {
      const sheets = parseWorkbookAllSheets(file.buffer);
      for (const [sheetName, rows] of Object.entries(sheets)) {
        result.push({ fileName: file.originalname, sheetName, rows });
      }
    }
  }
  return result;
}

/**
 * Persists an uploaded file to disk under server/uploads/migrations/
 * {migrationId}/ — temporary storage, not permanent (doc §4's own
 * guidance) — cleaned up by a retention sweep once a migration reaches a
 * terminal state past a retention window (not built in this pass; the
 * storage path is recorded in migration_files for that future sweep to
 * use).
 */
function saveUploadedFile(migrationId, file) {
  const dir = path.join(__dirname, '..', '..', '..', 'uploads', 'migrations', migrationId);
  fs.mkdirSync(dir, { recursive: true });
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(dir, safeName);
  fs.writeFileSync(fullPath, file.buffer);
  return fullPath;
}

module.exports = { parseWorkbookAllSheets, extractZipEntries, parseUploadedFiles, saveUploadedFile };
