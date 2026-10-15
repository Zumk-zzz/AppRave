import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'start';
if (!['start', 'build'].includes(action)) throw new Error('Use web.mjs start or build');
const args = action === 'build' ? ['export', '--platform', 'web', ...process.argv.slice(3)] : ['start', '--web', ...process.argv.slice(3)];
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url)), ...args], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, EXPO_PUBLIC_APPRAVE_API_URL: process.env.APPRAVE_API_URL?.trim() ?? '', EXPO_PUBLIC_APPRAVE_DATA_SOURCE: config.expo.extra.dataSource },
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
