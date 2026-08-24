const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const dotenv = require('dotenv');

app.setName('Jewellery ERP');

let mainWindow = null;
let serverProcess = null;

// ─── Resolve paths (dev: siblings on disk · packaged: copied into resources) ──
const isPackaged = app.isPackaged;
const serverEntry = isPackaged
  ? path.join(process.resourcesPath, 'server', 'src', 'index.js')
  : path.join(__dirname, '../server/src/index.js');
const clientDistDir = isPackaged
  ? path.join(process.resourcesPath, 'client-dist')
  : path.join(__dirname, '../client/dist');

// ─── Per-machine config lives outside the (read-only, once installed) app dir ─
const userDataDir = app.getPath('userData');
const envPath = path.join(userDataDir, '.env');
const uploadsDir = path.join(userDataDir, 'uploads');

function ensureUserConfig() {
  if (!fs.existsSync(envPath)) {
    const templatePath = isPackaged
      ? path.join(process.resourcesPath, 'env.template')
      : path.join(__dirname, 'resources/env.template');
    fs.mkdirSync(userDataDir, { recursive: true });
    let contents = fs.readFileSync(templatePath, 'utf8');
    // Give this install its own random JWT secrets instead of the shared placeholder.
    contents = contents
      .replace(/JWT_SECRET=.*/, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`)
      .replace(/JWT_REFRESH_SECRET=.*/, `JWT_REFRESH_SECRET=${crypto.randomBytes(48).toString('hex')}`);
    fs.writeFileSync(envPath, contents);
  }
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http.get(`http://localhost:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);

      function retry() {
        if (Date.now() - start > timeoutMs) return reject(new Error('Server did not start in time.'));
        setTimeout(poll, 300);
      }
    })();
  });
}

function startServer() {
  ensureUserConfig();
  const userEnv = dotenv.parse(fs.readFileSync(envPath));
  const port = userEnv.PORT || '5000';

  // Run the server with Electron's own bundled Node runtime (no system Node required).
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ...userEnv,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: port,
      UPLOADS_DIR: uploadsDir,
      CLIENT_DIST_DIR: clientDistDir,
    },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d}`.trimEnd()));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d}`.trimEnd()));
  serverProcess.on('exit', (code) => {
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox(
        'Jewellery ERP stopped unexpectedly',
        `The background server exited (code ${code}).\n\n` +
        `Check that PostgreSQL is running and that the settings in\n${envPath}\nare correct, then restart the app.`
      );
    }
  });

  return { port };
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Jewellery ERP',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep target="_blank" links (e.g. print/report tabs) in the OS browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  const { port } = startServer();
  try {
    await waitForServer(port);
  } catch (err) {
    dialog.showErrorBox(
      'Could not start Jewellery ERP',
      `The background server did not respond on port ${port}.\n\n` +
      `Check that PostgreSQL is running and that the settings in\n${envPath}\nare correct, then restart the app.`
    );
    app.quit();
    return;
  }
  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
