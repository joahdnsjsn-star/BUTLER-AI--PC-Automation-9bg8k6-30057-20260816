/**
 * smokeBeacon.ts — Android emulator smoke-test instrumentation.
 *
 * Emits a small set of machine-readable markers to the JS console. On device
 * every console.* call is mirrored into `adb logcat` under the ReactNativeJS
 * tag, so CI can assert on real on-device behaviour without any test runner,
 * Detox, Appium or Maestro dependency.
 *
 * Markers (all single-line, prefix + JSON payload):
 *   BUTLER_SMOKE:BOOT      — JS bundle evaluated, root layout module loaded
 *   BUTLER_SMOKE:MOUNT     — root React tree committed
 *   BUTLER_SMOKE:ROUTE_OK  — first route painted (name + ms since boot)
 *   BUTLER_SMOKE:ERROR     — any runtime error / unhandled rejection
 *   BUTLER_SMOKE:READY     — everything above succeeded; safe to pass the run
 *
 * Zero cost in production: nothing renders, nothing is stored, no timers stay
 * alive. It is only console output plus two idempotent global hooks.
 */

const PREFIX = 'BUTLER_SMOKE';
const t0 = Date.now();

let mounted = false;
let routeReported = false;
let errorCount = 0;
let hooksInstalled = false;

function emit(kind: string, payload?: Record<string, unknown>) {
  // One line, always parseable by `grep` on the CI side.
  try {
    const body = { ms: Date.now() - t0, ...(payload ?? {}) };
    console.log(`${PREFIX}:${kind} ${JSON.stringify(body)}`);
  } catch {
    console.log(`${PREFIX}:${kind} {}`);
  }
}

/** Serialise anything an error handler may hand us, without throwing. */
function describe(err: unknown): string {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; name?: string; stack?: string };
  const head = `${e.name ?? 'Error'}: ${e.message ?? String(err)}`;
  const stack = (e.stack ?? '').split('\n').slice(0, 4).join(' | ');
  return stack ? `${head} @@ ${stack}` : head;
}

/** Report a runtime error to the smoke channel. Never throws. */
export function smokeError(err: unknown, source = 'runtime') {
  errorCount += 1;
  emit('ERROR', { source, detail: describe(err), count: errorCount });
}

/**
 * Install global error capture. Idempotent; safe to call from module scope.
 * Wraps — never replaces — the existing handlers so the app's own boot guard
 * and crash logger keep working exactly as before.
 */
export function installSmokeBeacon() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  emit('BOOT', { platform: 'android' });

  const g: any = typeof global !== 'undefined' ? global : undefined;
  if (!g) return;

  // 1) Fatal + non-fatal JS errors routed through the RN global handler.
  try {
    const eu = g.ErrorUtils;
    if (eu && typeof eu.getGlobalHandler === 'function') {
      const prev = eu.getGlobalHandler();
      eu.setGlobalHandler((err: unknown, isFatal?: boolean) => {
        smokeError(err, isFatal ? 'fatal' : 'nonfatal');
        if (typeof prev === 'function') prev(err, isFatal);
      });
    }
  } catch {}

  // 2) console.error — catches React warnings that indicate a broken render.
  try {
    const prevError = console.error?.bind(console);
    console.error = (...args: any[]) => {
      const first = args[0];
      const text = typeof first === 'string' ? first : describe(first);
      // Ignore pure style/deprecation noise; only surface real failures.
      if (!/deprecat|will be removed|Warning: componentWill/i.test(text)) {
        smokeError(text, 'console');
      }
      prevError?.(...args);
    };
  } catch {}
}

/** Call once from the root layout's first effect. */
export function smokeMounted() {
  if (mounted) return;
  mounted = true;
  emit('MOUNT');
}

/**
 * Call from the first screen that actually paints. Emits ROUTE_OK, then READY
 * when the frame settled with no errors recorded — that pair is what CI greps.
 */
export function smokeFirstRoute(route: string) {
  if (routeReported) return;
  routeReported = true;
  emit('ROUTE_OK', { route });

  // Give one settle window for late errors (effects, images, async state)
  // before declaring the launch healthy.
  const timer = setTimeout(() => {
    if (errorCount === 0) emit('READY', { route });
    else emit('ERROR', { source: 'settle', detail: `${errorCount} error(s) before ready` });
  }, 1200);

  // Never keep the app awake for this.
  if (typeof (timer as any)?.unref === 'function') (timer as any).unref();
}
