// Start or stop the whole local Mission Control (API + web) in the background.
// Usage: pnpm private:start | pnpm private:stop
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const stateDir = join(root, '.local');
const pidFile = join(stateDir, 'private.pid');
const logFile = join(stateDir, 'private-dev.log');
const ports = [3001, 5174];
const windows = process.platform === 'win32';

const portOpen = (port) => new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const result = spawnSync('hermes', ['--version'], { encoding: 'utf8', shell: windows, timeout: 15_000 });
  return result.status === 0 ? `Hermes CLI: ${result.stdout.trim().split(/\r?\n/)[0]}` : 'Hermes CLI tidak ditemukan; draf AI tetap nonaktif.';
}

async function start() {
  const running = await Promise.all(ports.map(portOpen));
  if (running.every(Boolean)) return console.log('Mission Control sudah berjalan: http://127.0.0.1:5174');
  if (running.some(Boolean)) return console.error('Sebagian layanan masih berjalan. Jalankan `pnpm private:stop` dulu.'), process.exit(1);
  mkdirSync(stateDir, { recursive: true });
  const log = openSync(logFile, 'w');
  const child = spawn('pnpm', ['dev'], { cwd: root, detached: true, stdio: ['ignore', log, log], shell: windows, windowsHide: true });
  closeSync(log);
  writeFileSync(pidFile, String(child.pid));
  child.unref();
  for (let i = 0; i < 60; i += 1) {
    if ((await Promise.all(ports.map(portOpen))).every(Boolean)) {
      console.log(`Mission Control berjalan: http://127.0.0.1:5174\n${hermesLine()}\nLog: ${logFile}`);
      return;
    }
    await sleep(1000);
  }
  console.error(`Layanan belum siap setelah 60 detik. Periksa log: ${logFile}`);
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

const command = process.argv[2];
if (command === 'start') await start();
else if (command === 'stop') await stop();
else { console.error('Gunakan: node scripts/private.mjs start|stop'); process.exit(1); }
