import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const serverProcess = spawn(process.execPath, ['--watch', 'server/index.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

const viteExecutable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);

const clientProcess = spawn(viteExecutable, [], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

const children = [serverProcess, clientProcess];

let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of children) {
  child.on('exit', (code) => {
    shutdown('SIGTERM');
    process.exitCode = typeof code === 'number' ? code : 0;
  });
}
