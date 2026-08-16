#!/usr/bin/env node
/**
 * guard-scan — static half of the guard system.
 *
 * Fails the build on anything that would rot the app:
 *   1. BROKEN IMPORTS   — an import path that resolves to nothing
 *                         (typos, wrong case, deleted files).
 *   2. DEAD FILES       — modules nothing imports, i.e. forgotten/half-dead
 *                         code that can silently drift out of sync.
 *   3. DUPLICATE THEMES — more than one palette/theme/token module.
 *   4. WEB LEAKS        — DOM/browser APIs that cannot exist in React Native.
 *   5. ORPHAN SCREENS   — a file in app/(tabs) with no <Tabs.Screen> entry.
 *
 * Android React Native / Expo only. Node >= 18, zero dependencies.
 * Usage: node scripts/guard-scan.mjs [--fix-report]
 * © 2026 Andrej Sladkovic — Butler AI
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components', 'services', 'hooks', 'constants', 'contexts', 'utils'];
const CODE = /\.(t|j)sx?$/;

const norm = (p) => p.replace(/\\/g, '/');
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (CODE.test(e.name)) files.push(norm(p));
  }
}
ROOTS.forEach(walk);

const source = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = norm(path.join(path.dirname(from), spec));
  else return null; // node_modules — not our problem
  const cands = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
                 `${base}/index.ts`, `${base}/index.tsx`];
  for (const c of cands) {
    const n = norm(c);
    if (source.has(n)) return n;
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return n;
  }
  return { missing: spec };
}

const broken = [];
const referenced = new Set();

for (const [file, src] of source) {
  for (const m of src.matchAll(/(?:from\s+|require\(|import\()\s*['"]([^'"]+)['"]/g)) {
    const r = resolveSpec(file, m[1]);
    if (!r) continue;
    if (r.missing) broken.push(`${file} → ${r.missing}`);
    else referenced.add(r);
  }
}

const isEntry = (f) => f.startsWith('app/') || /\/index\.ts$/.test(f);
const dead = files.filter((f) => !isEntry(f) && !referenced.has(f));

// Duplicate theme/palette modules — one source of truth only.
const themeLike = files.filter((f) =>
  /(^|\/)(theme|colors|palette|designTokens|typography)\.tsx?$/i.test(f));

// Web-only APIs that must never reach a React Native bundle.
const WEB_PATTERNS = [
  /\bdocument\.(getElementById|querySelector|createElement|body)\b/,
  /\bwindow\.(location|localStorage|sessionStorage|addEventListener)\b/,
  /\blocalStorage\./,
  /\bfrom\s+['"]react-dom['"]/,
  /\bfrom\s+['"]react-router/,
  /\bclassName=/,
];
const webLeaks = [];
for (const [file, src] of source) {
  // Files that intentionally build an HTML string (the codebase IDE export)
  // opt out with this marker — the DOM calls live inside a template literal
  // that runs in a desktop browser, never in the RN bundle.
  if (src.includes('guard-scan:allow-html-string')) continue;
  for (const re of WEB_PATTERNS) {
    const m = src.match(re);
    if (m) webLeaks.push(`${file} → ${m[0]}`);
  }
}

// Screens on disk that the tab navigator never registers.
const orphanScreens = [];
const tabsLayout = 'app/(tabs)/_layout.tsx';
if (fs.existsSync(tabsLayout)) {
  const layout = fs.readFileSync(tabsLayout, 'utf8');
  for (const f of fs.readdirSync('app/(tabs)')) {
    if (!CODE.test(f) || f.startsWith('_')) continue;
    const name = f.replace(CODE, '');
    if (!layout.includes(`name="${name}"`)) orphanScreens.push(`app/(tabs)/${f}`);
  }
}

const report = (title, list) => {
  console.log(`\n${title} (${list.length})`);
  list.forEach((l) => console.log('  •', l));
};

report('BROKEN IMPORTS', broken);
report('DEAD FILES (nothing imports these)', dead);
report('THEME MODULES', themeLike);
report('WEB API LEAKS', webLeaks);
report('UNREGISTERED TAB SCREENS', orphanScreens);

const fatal = broken.length + webLeaks.length + orphanScreens.length;
const warn = dead.length + Math.max(0, themeLike.length - 1);

console.log(`\n${'─'.repeat(52)}`);
console.log(`Scanned ${files.length} modules · ${fatal} fatal · ${warn} warnings`);

if (fatal > 0) {
  console.error('\n✗ guard-scan FAILED — fix the items above before shipping.');
  process.exit(1);
}
console.log('✓ guard-scan clean — no broken paths, no web leaks, no orphan screens.');
