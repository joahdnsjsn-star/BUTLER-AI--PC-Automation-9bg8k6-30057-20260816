#!/usr/bin/env node
/**
 * Android-only build validation.
 *
 * Stage 1  preflight   – config invariants that historically broke the
 *                        OnSpace / device bundle ("bad application bundle").
 * Stage 2  typecheck   – tsc --noEmit
 * Stage 3  compile     – expo export --platform android (real Metro bundle)
 *
 * Any error in any stage exits with code 1 so CI fails the build.
 * Zero new dependencies: uses only Node built-ins + tools already in package.json.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.android-build-check');

const errors = [];
const warnings = [];
const t0 = Date.now();

const c = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  yellow: (s) => `\u001b[33m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

const has = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => (has(p) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : '');
const step = (n, title) => console.log(`\n${c.bold(`[${n}] ${title}`)}`);

/* ------------------------------------------------------------------ */
/* Stage 1 – preflight invariants                                      */
/* ------------------------------------------------------------------ */
step(1, 'Preflight – Expo/Android project invariants');

let pkg = {};
try {
  pkg = JSON.parse(read('package.json'));
} catch (e) {
  errors.push(`package.json is not valid JSON: ${e.message}`);
}

if (pkg.main !== 'expo-router/entry') {
  errors.push(`package.json "main" must be "expo-router/entry" (found: ${pkg.main ?? 'missing'})`);
}

// A custom index.js entry fights expo-router/entry and yields a bad bundle.
for (const f of ['index.js', 'index.ts', 'index.tsx']) {
  if (has(f)) errors.push(`${f} conflicts with the expo-router entry point – delete it`);
}

// Web-stack leftovers must never ship in the Android bundle.
for (const f of ['vite.config.ts', 'vite.config.js', 'capacitor.config.ts', 'index.html', 'next.config.js']) {
  if (has(f)) errors.push(`web-stack file "${f}" found – not allowed in the Expo/Android project`);
}

// Metro must stay vanilla.
const metroPath = ['metro.config.js', 'metro.config.cjs'].find(has);
if (!metroPath) {
  errors.push('metro.config.js is missing');
} else {
  const metro = read(metroPath);
  if (!/getDefaultConfig\(__dirname\)/.test(metro)) {
    errors.push(`${metroPath} must build on getDefaultConfig(__dirname)`);
  }
  for (const bad of ['resolveRequest', 'customSerializer', 'blockList', 'blacklistRE']) {
    if (new RegExp(`\\b${bad}\\b`).test(metro)) {
      errors.push(`${metroPath} contains "${bad}" – bundler hacks break the Android bundle`);
    }
  }
}

// Autolink exclusions while JS still imports the module = runtime crash.
if (has('react-native.config.js')) {
  const rnc = read('react-native.config.js');
  if (/dependencies\s*:/.test(rnc)) {
    errors.push('react-native.config.js declares autolink overrides – remove it');
  }
}
if (has('stubs')) errors.push('stubs/ directory found – Metro stub shims are forbidden');

// app.json must declare an Android package.
try {
  const appJson = JSON.parse(read('app.json'));
  const android = appJson?.expo?.android ?? {};
  if (!android.package) errors.push('app.json: expo.android.package is missing');
  if (typeof android.versionCode !== 'number') {
    warnings.push('app.json: expo.android.versionCode is not set – Play Store uploads need it');
  }
} catch (e) {
  errors.push(`app.json is not valid JSON: ${e.message}`);
}

// Every literal require()/import of a bare package must exist in package.json.
const deps = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);
const SRC_DIRS = ['app', 'src', 'components', 'services', 'utils', 'hooks', 'constants', 'lib', 'store', 'contexts'];
const files = [];
const walk = (dir) => {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.expo', 'android', 'ios'].includes(e.name)) continue;
      walk(full);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) {
      files.push(full);
    }
  }
};
for (const d of SRC_DIRS) walk(path.join(ROOT, d));

const IMPORT_RE = /(?:from\s+|require\(\s*)['"]([^'"]+)['"]/g;
const missing = new Map();
for (const file of files) {
  const code = fs
    .readFileSync(file, 'utf8')
    // strip comments so documentation mentioning a package never trips the scan
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~')) continue;
    if (spec.startsWith('node:')) continue;
    const parts = spec.split('/');
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (deps.has(name)) continue;
    if (fs.existsSync(path.join(ROOT, 'node_modules', name))) continue;
    if (!missing.has(name)) missing.set(name, path.relative(ROOT, file));
  }
}
for (const [name, where] of missing) {
  errors.push(`unresolved package "${name}" imported from ${where} – add it to package.json or guard the require`);
}

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'expo'))) {
  errors.push('dependencies are not installed – run "npm ci --legacy-peer-deps" before validating');
}

console.log(c.dim(`    scanned ${files.length} source files`));
if (errors.length === 0) console.log(c.green('    preflight OK'));

if (errors.length) finish();

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function run(label, cmd, args, env = {}) {
  console.log(c.dim(`    $ ${cmd} ${args.join(' ')}`));
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) errors.push(`${label} failed (exit ${res.status ?? 'signal'})`);
  return res.status === 0;
}

function finish() {
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  for (const w of warnings) console.log(c.yellow(`  ! ${w}`));
  if (errors.length) {
    console.log(c.red(c.bold(`\n  ANDROID BUILD VALIDATION FAILED (${errors.length} error${errors.length > 1 ? 's' : ''}, ${secs}s)`)));
    for (const e of errors) console.log(c.red(`  x ${e}`));
    console.log('');
    process.exit(1);
  }
  console.log(c.green(c.bold(`\n  ANDROID BUILD VALIDATION PASSED (${secs}s)\n`)));
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Stage 2 – typecheck                                                 */
/* ------------------------------------------------------------------ */
step(2, 'Typecheck – tsc --noEmit');
run('typecheck', 'npx', ['--no-install', 'tsc', '--noEmit', '--pretty', 'false']);
if (errors.length) finish();

/* ------------------------------------------------------------------ */
/* Stage 3 – Android bundle compile                                    */
/* ------------------------------------------------------------------ */
step(3, 'Compile – expo export --platform android');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
run(
  'android bundle',
  'npx',
  ['--no-install', 'expo', 'export', '--platform', 'android', '--output-dir', path.relative(ROOT, OUT_DIR), '--clear'],
  { EXPO_NO_TELEMETRY: '1', CI: '1' }
);

if (!errors.length) {
  const bundleDir = path.join(OUT_DIR, '_expo', 'static', 'js', 'android');
  const bundles = fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir).filter((f) => f.endsWith('.hbc') || f.endsWith('.js')) : [];
  if (!bundles.length) {
    errors.push('expo export produced no Android bundle');
  } else {
    for (const b of bundles) {
      const size = fs.statSync(path.join(bundleDir, b)).size;
      console.log(c.dim(`    bundle ${b} – ${(size / 1024 / 1024).toFixed(2)} MB`));
      if (size < 100 * 1024) errors.push(`Android bundle ${b} is suspiciously small (${size} bytes)`);
    }
  }
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
finish();
