// Start or stop the whole local Mission Control in the background.
// Usage: pnpm private:start (production: built web served by the API on 3001, no file watching)
//        pnpm private:dev   (development: tsx watch + Vite on 5174)
//        pnpm private:stop
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const stateDir = join(root, '.local');
const pidFile = join(stateDir, 'private.pid');
const logFile = join(stateDir, 'private-dev.log');
const ports = [3001, 5174];
const windows = process.platform === 'win32';
const dev = process.argv[3] === 'dev';
const servePorts = dev ? ports : [3001];
const url = dev ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:3001';

const portOpen = (port) => new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// pnpm is a .cmd shim on Windows, so run it through cmd.exe explicitly (shell: true with args is deprecated).
const pnpm = (script) => windows ? ['cmd.exe', ['/d', '/s', '/c', `pnpm ${script}`]] : ['pnpm', script.split(' ')];

function killTree(pid) {
  if (windows) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
}

// Fallback for servers started outside this script (e.g. a plain `pnpm dev`).
function pidsOnPorts() {
  if (!windows) {
    const result = spawnSync('lsof', ['-ti', ports.map((port) => `tcp:${port}`).join(',')], { encoding: 'utf8' });
    return [...new Set(result.stdout.split(/\s+/).filter(Boolean).map(Number))];
  }
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  return [...new Set(result.stdout.split(/\r?\n/)
    .filter((line) => /LISTENING/.test(line) && ports.some((port) => line.includes(`127.0.0.1:${port} `)))
    .map((line) => Number(line.trim().split(/\s+/).at(-1))).filter((pid) => pid > 0))];
}

function hermesLine() {
  const result = windows
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'hermes --version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    : spawnSync('hermes', ['--version'], { encoding: 'utf8', timeout: 15_000 });
  return result.status === 0 ? `Hermes CLI: ${result.stdout.trim().split(/\r?\n/)[0]}` : 'Hermes CLI tidak ditemukan; draf AI tetap nonaktif.';
}

async function start() {
  if ((await Promise.all(ports.map(portOpen))).some(Boolean)) return console.error('Mission Control (atau sebagiannya) sudah berjalan. Jalankan `pnpm private:stop` dulu.'), process.exit(1);
  mkdirSync(stateDir, { recursive: true });
  if (!dev) {
    console.log('Membangun web untuk mode produksi...');
    const [command, args] = pnpm('--filter @fvh/web build');
    if (spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true }).status !== 0) return console.error('Build web gagal; Mission Control tidak dijalankan.'), process.exit(1);
  }
  // A detached console-less node on Windows drops output written to inherited file handles,
  // so a small detached supervisor runs the server normally and streams its output to the log.
  const child = spawn(process.execPath, [import.meta.filename, 'supervise', dev ? 'dev' : 'production'], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
  writeFileSync(pidFile, String(child.pid));
  child.unref();
  for (let i = 0; i < 90; i += 1) {
    if ((await Promise.all(servePorts.map(portOpen))).every(Boolean)) {
      console.log(`Mission Control berjalan (${dev ? 'mode pengembangan' : 'mode produksi'}): ${url}\n${hermesLine()}\nLog: ${logFile}`);
      return;
    }
    await sleep(1000);
  }
  console.error(`Layanan belum siap setelah 90 detik. Periksa log: ${logFile}`);
  process.exit(1);
}

async function stop() {
  if (existsSync(pidFile)) {
    killTree(Number(readFileSync(pidFile, 'utf8')));
    rmSync(pidFile, { force: true });
  }
  for (const pid of pidsOnPorts()) killTree(pid);
  await sleep(1000);
  const stillRunning = (await Promise.all(ports.map(portOpen))).some(Boolean);
  console.log(stillRunning ? 'Sebagian layanan masih berjalan; tutup terminal `pnpm dev` secara manual.' : 'Mission Control dihentikan.');
}

function supervise() {
  const log = createWriteStream(logFile);
  const [command, args] = pnpm(dev ? 'dev' : '--filter @fvh/server start');
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', ...(dev ? {} : { NODE_ENV: 'production' }) } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => { log.end(`\nMission Control berhenti (kode ${code ?? 'sinyal'}).\n`); });
}

const command = process.argv[2];
if (command === 'supervise') supervise();
else if (command === 'start') await start();
else if (command === 'stop') await stop();
else { console.error('Gunakan: node scripts/private.mjs start [dev]|stop'); process.exit(1); }
