/**
 * TabErrorBoundary — Per-tab crash isolation
 *
 * Prevents a single broken tab from white-screening the entire app.
 * Shows a clean recovery screen with the tab name and error message.
 * React requires a class component for error boundaries.
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const MONO: any = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Sentinel first — it owns loop-breaking and permanent quarantine.
    try { require('@/services/sentinel').sentinel.reportCrash(`tab:${this.props.name}`, error); } catch {}
    // Route to autoErrorLogger — never crash if it isn't available
    try {
      require('@/services/autoErrorLogger').autoErrorLogger.log(
        'error',
        `Tab:${this.props.name}`,
        error.message,
        { stack: error.stack?.slice(0, 400), component: info?.componentStack?.slice(0, 300) }
      );
    } catch {}
    // Also forward to runtimeErrorMonitor for the diagnostics HUD
    try {
      require('@/services/runtimeErrorMonitor').runtimeErrorMonitor
        .reportComponentError(error, info?.componentStack);
    } catch {}
  }

  // Auto-reset for known transient/recoverable errors.
  // Animation driver conflicts reset in 1s (very fast — they are always
  // safe to retry since the animated values are recreated on mount).
  // Other transient crashes reset in 2.5s.
  componentDidUpdate(_: Props, prev: State) {
    if (!prev.error && this.state.error) {
      const msg = this.state.error?.message ?? '';
      const isAnimationCrash =
        msg.includes('Attempting to run JS driven animation') ||
        msg.includes('animated node') ||
        msg.includes('useNativeDriver');
      const isTransient =
        isAnimationCrash ||
        msg.includes('undefined is not a function') ||
        msg.includes('null is not an object') ||
        msg.includes('Cannot read prop') ||
        msg.includes('is not a function') ||
        msg.includes('Maximum update depth') ||
        msg.includes('Element type is invalid');

      if (isTransient) {
        const delay = isAnimationCrash ? 1000 : 2500;
        this._autoResetTimer = setTimeout(() => {
          this.setState({ error: null });
        }, delay);
      }
    }
  }

  // Register this boundary's reset callback globally so runtimeErrorMonitor
  // can trigger auto-reset from the fix engine.
  componentDidMount() {
    try {
      const name = this.props.name;
      const prev = (global as any).__butlerResetTabBoundary;
      (global as any).__butlerResetTabBoundary = (tabName?: string) => {
        // Reset this boundary if no tab name given, or if name matches
        if (!tabName || tabName === name || tabName === 'Core' || name === 'Core') {
          this.setState({ error: null });
        }
        // Also forward to any previously registered boundary
        try { if (prev && prev !== (global as any).__butlerResetTabBoundary) prev(tabName); } catch {}
      };
    } catch {}
  }

  componentWillUnmount() {
    if (this._autoResetTimer) clearTimeout(this._autoResetTimer);
  }

  private _autoResetTimer: ReturnType<typeof setTimeout> | null = null;

  render() {
    if (this.state.error) {
      return (
        <View style={s.container}>
          {/* Corner accents */}
          <View style={[s.corner, { top: 24, left: 24, borderTopWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[s.corner, { top: 24, right: 24, borderTopWidth: 2, borderRightWidth: 2 }]} />
          <View style={[s.corner, { bottom: 24, left: 24, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[s.corner, { bottom: 24, right: 24, borderBottomWidth: 2, borderRightWidth: 2 }]} />

          {/* Error icon */}
          <View style={s.iconBox}>
            <Text style={s.iconTxt}>⚠</Text>
          </View>

          {/* Tab name */}
          <Text style={s.tabName}>
            {this.props.name.toUpperCase()}{' '}
            <Text style={s.tabNameAccent}>TAB CRASHED</Text>
          </Text>

          {/* Error message */}
          <Text style={s.errMsg} numberOfLines={4}>
            {this.state.error.message}
          </Text>

          {/* Reload button */}
          <TouchableOpacity
            style={s.reloadBtn}
            onPress={() => this.setState({ error: null })}
            activeOpacity={0.8}
          >
            <Text style={s.reloadTxt}>↻ RELOAD TAB</Text>
          </TouchableOpacity>

          <Text style={s.hint}>
            Other tabs are unaffected · This tab will reload cleanly
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050810',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: 'rgba(0,255,136,0.3)',
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FF444460',
    backgroundColor: '#FF444412',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#FF4D5E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  iconTxt: {
    fontSize: 28,
    color: '#FF4D5E',
  },
  tabName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#DCE6F2',
    fontFamily: MONO,
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  tabNameAccent: {
    color: '#FF4D5E',
  },
  errMsg: {
    fontSize: 11,
    color: '#6B7A92',
    fontFamily: MONO,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  reloadBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(0,255,136,0.4)',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginBottom: 16,
    backgroundColor: 'rgba(0,255,136,0.06)',
    ...Platform.select({
      ios: { shadowColor: '#2FE38A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  reloadTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2FE38A',
    fontFamily: MONO,
    letterSpacing: 2,
  },
  hint: {
    fontSize: 9,
    color: '#2FE38A',
    fontFamily: MONO,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
