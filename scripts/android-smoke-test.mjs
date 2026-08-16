#!/usr/bin/env node
/**
 * android-smoke-test.mjs — launch the app on a running Android emulator and
 * assert the first route renders with zero runtime errors.
 *
 * It is deliberately dependency-free (node + adb only) so it runs identically
 * on a laptop and in GitHub Actions.
 *
 * Pipeline:
 *   1. wait for an emulator/device to be fully booted
 *   2. install the debug APK (built beforehand, or pass --apk=<path>)
 *   3. clear logcat, cold-start the launcher activity
 *   4. stream logcat and wait for BUTLER_SMOKE:READY
 *   5. fail fast on BUTLER_SMOKE:ERROR, FATAL EXCEPTION, ANR, or
 *      "Attempting to call JS function on a bad application bundle"
 *   6. pull a screenshot + the full log into artifacts/ for the CI upload
 *
 * Exit code 0 = launch healthy. Anything else = broken startup.
 *
 * Usage:
 *   node scripts/android-smoke-test.mjs
 *   node scripts/android-smoke-test.mjs --apk=android/app/build/outputs/apk/debug/app-debug.apk
 *   node scripts/android-smoke-test.mjs --timeout=180
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARTIFACTS = path.join(ROOT, 'artifacts', 'android-smoke');
const PKG = readPackageId();
const ACTIVITY = `${PKG}/.MainActivity`;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const TIMEOUT_MS = Number(args.timeout ?? 150) * 1000;
const APK = args.apk ?? 'android/app/build/outputs/apk/debug/app-debug.apk';

// Any of these in logcat means the launch is dead on arrival.
const FATAL_PATTERNS = [
  /BUTLER_SMOKE:ERROR/,
  /FATAL EXCEPTION/,
  /AndroidRuntime:\s+.*Exception/,
  /Attempting to call JS function on a bad application bundle/,
  /Unable to load script/,
  /Could not connect to development server/,
  /ANR in /,
  /Process .* has died/,
];

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m\x1b[1m${s}\x1b[0m`,
  head: (s) => `\x1b[1m${s}\x1b[0m`,
};

function readPackageId() {
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    return appJson?.expo?.android?.package ?? 'com.butlerai.pc.automation';
  } catch {
    return 'com.butlerai.pc.automation';
  }
}

function adb(cliArgs, opts = {}) {
  return spawnSync('adb', cliArgs, { encoding: 'utf8', ...opts });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevice() {
  process.stdout.write(c.head('\n[1] Waiting for emulator\n'));
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const boot = adb(['shell', 'getprop', 'sys.boot_completed']);
    if (boot.status === 0 && boot.stdout.trim() === '1') {
      // Dismiss the lock screen so the activity is actually visible.
      adb(['shell', 'input', 'keyevent', '82']);
      adb(['shell', 'settings', 'put', 'global', 'window_animation_scale', '0']);
      adb(['shell', 'settings', 'put', 'global', 'transition_animation_scale', '0']);
      adb(['shell', 'settings', 'put', 'global', 'animator_duration_scale', '0']);
      console.log(c.dim('    device booted, animations disabled'));
      return true;
    }
    await sleep(2000);
  }
  return false;
}

function installApk() {
  process.stdout.write(c.head('\n[2] Installing APK\n'));
  if (!fs.existsSync(APK)) {
    console.log(c.bad(`    APK not found at ${APK}`));
    console.log(c.dim('    build it first:  npm run android:apk:debug'));
    return false;
  }
  const size = (fs.statSync(APK).size / 1024 / 1024).toFixed(1);
  console.log(c.dim(`    ${APK} (${size} MB)`));
  adb(['uninstall', PKG]); // ignore failure: not installed yet
  const res = adb(['install', '-r', '-d', '-g', APK], { maxBuffer: 1024 * 1024 * 64 });
  if (res.status !== 0 || /Failure/i.test(res.stdout + res.stderr)) {
    console.log(c.bad('    install failed'));
    console.log(c.dim((res.stdout + res.stderr).trim().slice(0, 2000)));
    return false;
  }
  console.log(c.dim(`    installed ${PKG} with permissions pre-granted`));
  return true;
}

async function launchAndWatch() {
  process.stdout.write(c.head('\n[3] Cold start + logcat assertions\n'));
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const logFile = path.join(ARTIFACTS, 'logcat.txt');
  const logStream = fs.createWriteStream(logFile);

  adb(['logcat', '-c']);
  adb(['shell', 'am', 'force-stop', PKG]);

  const tail = spawn('adb', ['logcat', '-v', 'brief', '*:W', 'ReactNativeJS:V', 'ReactNative:V', 'AndroidRuntime:E'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const seen = { boot: false, mount: false, route: null, ready: false };
  let failure = null;
  let buffer = '';

  const done = new Promise((resolve) => {
    const finish = (reason) => {
      tail.kill('SIGKILL');
      logStream.end();
      resolve(reason);
    };

    const timer = setTimeout(() => {
      failure = failure ?? `timed out after ${TIMEOUT_MS / 1000}s waiting for BUTLER_SMOKE:READY`;
      finish('timeout');
    }, TIMEOUT_MS);

    tail.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      logStream.write(text);
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.includes('BUTLER_SMOKE:BOOT') && !seen.boot) {
          seen.boot = true;
          console.log(c.ok('    ✓ JS bundle evaluated       (BOOT)'));
        }
        if (line.includes('BUTLER_SMOKE:MOUNT') && !seen.mount) {
          seen.mount = true;
          console.log(c.ok('    ✓ root tree committed       (MOUNT)'));
        }
        if (line.includes('BUTLER_SMOKE:ROUTE_OK') && !seen.route) {
          seen.route = (line.match(/"route":"([^"]+)"/) ?? [, 'unknown'])[1];
          console.log(c.ok(`    ✓ first route painted       (${seen.route})`));
        }
        if (line.includes('BUTLER_SMOKE:READY')) {
          seen.ready = true;
          console.log(c.ok('    ✓ settled with zero errors  (READY)'));
          clearTimeout(timer);
          finish('ready');
          return;
        }
        for (const p of FATAL_PATTERNS) {
          if (p.test(line)) {
            failure = line.trim().slice(0, 500);
            clearTimeout(timer);
            finish('fatal');
            return;
          }
        }
      }
    });
  });

  const start = adb(['shell', 'am', 'start', '-W', '-S', '-n', ACTIVITY]);
  if (start.status !== 0 || /Error/i.test(start.stdout + start.stderr)) {
    console.log(c.bad('    could not start the launcher activity'));
    console.log(c.dim((start.stdout + start.stderr).trim().slice(0, 1000)));
  } else {
    const total = (start.stdout.match(/TotalTime:\s*(\d+)/) ?? [])[1];
    if (total) console.log(c.dim(`    activity start: ${total} ms`));
  }

  const reason = await done;

  // Evidence for the CI artifact, useful even on success.
  try {
    adb(['shell', 'screencap', '-p', '/sdcard/butler-smoke.png']);
    adb(['pull', '/sdcard/butler-smoke.png', path.join(ARTIFACTS, 'first-route.png')], {
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch {}

  // Process must still be alive — a silent crash after READY is still a fail.
  const alive = adb(['shell', 'pidof', PKG]).stdout.trim().length > 0;
  if (reason === 'ready' && !alive) {
    failure = 'process exited immediately after the first route rendered';
  }

  fs.writeFileSync(
    path.join(ARTIFACTS, 'result.json'),
    JSON.stringify({ package: PKG, ...seen, alive, failure, reason }, null, 2),
  );

  return { seen, failure, alive, logFile };
}

async function main() {
  console.log(c.head(`\nANDROID EMULATOR SMOKE TEST — ${PKG}`));

  if (adb(['version']).status !== 0) {
    console.log(c.bad('\n  adb not found on PATH — install Android platform-tools\n'));
    process.exit(1);
  }
  if (!(await waitForDevice())) {
    console.log(c.bad('\n  no emulator became ready within 180s\n'));
    process.exit(1);
  }
  if (!installApk()) process.exit(1);

  const { seen, failure, logFile } = await launchAndWatch();

  if (failure || !seen.ready) {
    console.log(c.bad('\n  SMOKE TEST FAILED'));
    console.log(c.bad(`  x ${failure ?? 'app never reported a healthy first route'}`));
    console.log(c.dim(`\n  full logcat: ${logFile}`));
    const excerpt = fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((l) => /BUTLER_SMOKE|Exception|FATAL|ReactNativeJS/.test(l))
      .slice(-40)
      .join('\n');
    if (excerpt.trim()) console.log(c.dim(`\n${excerpt}\n`));
    process.exit(1);
  }

  console.log(c.ok(`\n  SMOKE TEST PASSED — "${seen.route}" rendered clean on the emulator\n`));
  process.exit(0);
}

main().catch((err) => {
  console.log(c.bad(`\n  smoke test crashed: ${err?.message ?? err}\n`));
  process.exit(1);
});
