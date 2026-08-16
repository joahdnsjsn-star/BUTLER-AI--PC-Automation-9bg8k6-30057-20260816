/**
 * Guard — the visual containment wrapper.
 *
 * <Guard name="home.hero"> renders its children inside an error boundary that:
 *   • catches any render/lifecycle crash and instantly renders nothing
 *     (a broken widget disappears instead of white-screening the tab),
 *   • reports the crash to the sentinel,
 *   • retries ONCE for transient faults (animation driver races etc.),
 *   • and after repeated crashes the sentinel bans the name permanently —
 *     from then on the widget is skipped on every launch, forever.
 *
 * Also exports `useMotionTier()` / `useFx()` so decorative animation loops
 * can stand down when the JS thread is struggling.
 *
 * React Native only. No web APIs.
 * © 2026 Andrej Sladkovic — Butler AI — ALL RIGHTS RESERVED
 */
import React, { Component, ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { sentinel, MotionTier } from '@/services/sentinel';

interface GuardProps {
  /** Stable id — used for the permanent quarantine record. */
  name: string;
  children: ReactNode;
  /** Rendered instead of the children after a crash. Default: nothing. */
  fallback?: ReactNode;
  /** Set false for load-bearing UI that must retry rather than vanish. */
  removable?: boolean;
}

interface GuardState { dead: boolean; retried: boolean }

export class Guard extends Component<GuardProps, GuardState> {
  state: GuardState = { dead: false, retried: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<GuardState> {
    return { dead: true };
  }

  componentDidCatch(error: Error) {
    const banned = sentinel.reportCrash(this.props.name, error);
    // One quick retry for a first-time, non-banned fault: most RN visual
    // crashes are animation/layout races that succeed on remount.
    if (!banned && !this.state.retried) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.setState({ dead: false, retried: true });
      }, 900);
    }
  }

  componentWillUnmount() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  render() {
    const { name, children, fallback = null, removable = true } = this.props;
    // Permanently removed by an earlier session — never mount it again.
    if (removable && sentinel.isBanned(name)) return <>{fallback}</>;
    if (this.state.dead) return <>{fallback}</>;
    return <>{children}</>;
  }
}

/** Functional helper: wrap a component once and reuse it everywhere. */
export function withGuard<P extends object>(
  name: string,
  Wrapped: React.ComponentType<P>,
  fallback?: ReactNode,
): React.FC<P> {
  const Guarded: React.FC<P> = (props) => (
    <Guard name={name} fallback={fallback}>
      <Wrapped {...props} />
    </Guard>
  );
  return Guarded;
}

function subscribe(cb: () => void) { return sentinel.subscribe(cb); }

/** Live motion budget. Re-renders when the sentinel downgrades/upgrades. */
export function useMotionTier(): MotionTier {
  return useSyncExternalStore(
    subscribe,
    () => sentinel.motionTier(),
    () => 'FULL' as MotionTier,
  );
}

/**
 * True while decorative animation loops may run.
 * Usage: `const fx = useFx(); useEffect(() => { if (!fx) return; loop.start(); }, [fx]);`
 */
export function useFx(): boolean {
  return useMotionTier() === 'FULL';
}

/** True once a named visual has been permanently removed. */
export function useBanned(name: string): boolean {
  const [banned, setBanned] = useState(() => sentinel.isBanned(name));
  useEffect(() => sentinel.subscribe(() => setBanned(sentinel.isBanned(name))), [name]);
  return banned;
}

export default Guard;
