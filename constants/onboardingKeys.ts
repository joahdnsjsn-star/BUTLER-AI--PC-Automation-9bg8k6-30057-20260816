/**
 * Butler AI — Onboarding & Consent Storage Keys · v4 CANONICAL
 * ──────────────────────────────────────────────────────────────
 *
 * Single source of truth for every AsyncStorage key related to
 * onboarding, consent, and first-launch state.
 *
 * READ CONTRACT
 *   • services/onboardingState.ts is the ONLY module that reads
 *     these keys. It understands '1', 'true', 'done', 'onboarded'.
 *
 * WRITE CONTRACT
 *   • services/onboardingState.ts markOnboardingDone() writes ALL_ONBOARDING_WRITE_KEYS.
 *   • app/(tabs)/onboarding.tsx calls markOnboardingDone() on FINISH/SKIP.
 *
 * NEVER rename a key in place — bump to _v3, _v4, etc. so users
 * with the old key are still recognised as onboarded.
 */

// ── PRIMARY ONBOARDED FLAGS ────────────────────────────────────────
/** v2 contract — canonical key, set to '1' on FINISH or SKIP. */
export const ONBOARDING_DONE_KEY         = '@butler_onboarding_done_v2';
/** Legacy v1 contract — still honoured by isOnboardingDone(). */
export const WELCOME_COMPLETE_KEY        = '@butler_welcome_complete_v1';

// ── EXPLICIT CONSENTS (each set to '1') ───────────────────────────
export const TERMS_ACCEPTED_KEY          = '@butler_terms_accepted_v1';
export const PRIVACY_ACCEPTED_KEY        = '@butler_privacy_accepted_v1';
export const AGE_CONFIRMED_KEY           = '@butler_age_confirmed_v1';
export const LAN_CONSENT_KEY             = '@butler_lan_consent_v1';
export const REMOTE_EXEC_CONSENT_KEY     = '@butler_remote_exec_consent_v1';
export const CAMERA_CONSENT_KEY          = '@butler_camera_consent_v1';
/** Acceptance of the 4 server-privacy facts on step 8 (Server Privacy). */
export const SERVER_PRIVACY_ACCEPTED_KEY = '@butler_server_privacy_accepted_v1';

// ── CONSENT VERSION ───────────────────────────────────────────────
/** Bumped whenever consent copy changes — forces re-acceptance. */
export const CONSENT_VERSION             = '1.0.0';
/** Stores the consent version the user accepted. */
export const CONSENT_KEY                 = '@butler_consent_version';

// ── DIAGNOSTIC / OBSERVABILITY ────────────────────────────────────
/** Stamped to 'onboarded' on FINISH — used by external diagnostics. */
export const STABLE_STATE_KEY            = '@butler_stable_state';

// ── HELPER: every key/value pair written on FINISH ────────────────
// Value is '1' for booleans — onboarding.tsx and isOnboardingDone()
// both treat '1' as truthy (along with 'true', 'done', 'onboarded').
export const ALL_ONBOARDING_WRITE_KEYS: Array<[string, string]> = [
  [ONBOARDING_DONE_KEY,         '1'],
  [WELCOME_COMPLETE_KEY,        '1'],
  [TERMS_ACCEPTED_KEY,          '1'],
  [PRIVACY_ACCEPTED_KEY,        '1'],
  [AGE_CONFIRMED_KEY,           '1'],
  [LAN_CONSENT_KEY,             '1'],
  [REMOTE_EXEC_CONSENT_KEY,     '1'],
  [CAMERA_CONSENT_KEY,          '1'],
  [SERVER_PRIVACY_ACCEPTED_KEY, '1'],
  [CONSENT_KEY,                 CONSENT_VERSION],
  [STABLE_STATE_KEY,            'onboarded'],
];
