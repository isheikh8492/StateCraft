// Starts StateCraft. Installs dependencies only when they have changed since the last
// install, and builds the web app only when its sources are newer than the last build,
// so an ordinary start goes straight to the server. Uses nothing outside Node itself,
// because it runs before anything is installed.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => join(root, ...parts);

/** When a file was last changed, or 0 if it is not there. */
const changed = (path) => (existsSync(path) ? statSync(path).mtimeMs : 0);

/** The newest change to any file under the given paths. */
const newest = (...paths) => {
  let latest = 0;
  const walk = (path) => {
    if (!existsSync(path)) return;
    const info = statSync(path);
    if (!info.isDirectory()) {
      latest = Math.max(latest, info.mtimeMs);
      return;
    }
    for (const name of readdirSync(path)) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(join(path, name));
    }
  };
  for (const path of paths) walk(path);
  return latest;
};

const run = (args) => {
  const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// npm writes node_modules/.package-lock.json at the end of every install, so a lock file
// or a package.json newer than it means the dependencies have changed since.
const manifests = [
  at('package-lock.json'),
  at('package.json'),
  ...readdirSync(at('packages')).map((name) => at('packages', name, 'package.json')),
];
const installed = changed(at('node_modules', '.package-lock.json'));
if (installed === 0 || Math.max(...manifests.map(changed)) > installed) {
  console.log('Installing what StateCraft needs. This takes a minute the first time...');
  run(['install']);
}

const built = changed(at('packages', 'web', 'dist', 'index.html'));
const sources = newest(at('packages', 'web'), at('packages', 'protocol', 'src'));
if (built === 0 || sources > built) {
  console.log('Building the app...');
  run(['run', 'build']);
}

run(['run', 'start', '-w', '@statecraft/server', '--', ...process.argv.slice(2)]);
