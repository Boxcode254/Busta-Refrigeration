import { getMonitoringConfig } from "./config.js";

const CONSENT_EVENT_NAME = "busta:consent:changed";
const CONSENT_UPDATE_EVENT_NAME = "busta:consent:update";

let consentBridgeInitialized = false;
let consentState = null;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes", "granted", "allow", "allowed"].includes(value.toLowerCase());
  }

  return false;
}

/**
 * @param {string} key
 * @returns {string | null}
 */
function safeReadStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // Storage is optional and may be blocked.
  }
}

/**
 * @param {ReturnType<typeof getMonitoringConfig>} config
 * @returns {{ analytics: boolean, errorTracking: boolean }}
 */
function getDefaultConsentState(config) {
  const mode = (config.defaultConsent || "").toLowerCase();
  const grantedByDefault = mode === "granted" || mode === "all";

  return {
    analytics: grantedByDefault,
    errorTracking: grantedByDefault
  };
}

/**
 * @param {ReturnType<typeof getMonitoringConfig>} config
 * @returns {{ analytics: boolean, errorTracking: boolean }}
 */
function readInitialConsentState(config) {
  const fallbackState = getDefaultConsentState(config);
  const serialized = safeReadStorage(config.consentStorageKey);

  if (!serialized) {
    return fallbackState;
  }

  try {
    const parsed = JSON.parse(serialized);

    return {
      analytics: toBoolean(parsed.analytics),
      errorTracking: toBoolean(parsed.errorTracking)
    };
  } catch (_error) {
    return fallbackState;
  }
}

/**
 * @param {{ analytics?: unknown, errorTracking?: unknown }} partialState
 * @returns {{ analytics?: boolean, errorTracking?: boolean }}
 */
function normalizePartialConsent(partialState = {}) {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(partialState, "analytics")) {
    updates.analytics = toBoolean(partialState.analytics);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, "errorTracking")) {
    updates.errorTracking = toBoolean(partialState.errorTracking);
  }

  return updates;
}

/**
 * @param {{ analytics?: unknown, errorTracking?: unknown }} partialState
 */
function publishConsentChange(partialState = {}) {
  window.dispatchEvent(
    new CustomEvent(CONSENT_EVENT_NAME, {
      detail: {
        state: getConsentState(),
        updates: normalizePartialConsent(partialState)
      }
    })
  );
}

/**
 * @returns {{ analytics: boolean, errorTracking: boolean }}
 */
export function getConsentState() {
  if (!consentState) {
    initConsentBridge();
  }

  return {
    analytics: Boolean(consentState.analytics),
    errorTracking: Boolean(consentState.errorTracking)
  };
}

/**
 * @param {{ analytics?: unknown, errorTracking?: unknown }} partialState
 * @returns {{ analytics: boolean, errorTracking: boolean }}
 */
export function updateConsentState(partialState = {}) {
  const config = getMonitoringConfig();
  const currentState = getConsentState();
  const updates = normalizePartialConsent(partialState);

  consentState = {
    analytics:
      typeof updates.analytics === "boolean" ? updates.analytics : Boolean(currentState.analytics),
    errorTracking:
      typeof updates.errorTracking === "boolean"
        ? updates.errorTracking
        : Boolean(currentState.errorTracking)
  };

  safeWriteStorage(config.consentStorageKey, JSON.stringify(consentState));
  publishConsentChange(partialState);

  return getConsentState();
}

export function hasAnalyticsConsent() {
  return getConsentState().analytics;
}

export function hasErrorTrackingConsent() {
  return getConsentState().errorTracking;
}

/**
 * Adds a global bridge so consent can be controlled by a CMP or custom UI.
 */
export function initConsentBridge() {
  if (consentBridgeInitialized) {
    return;
  }

  consentBridgeInitialized = true;

  const config = getMonitoringConfig();
  consentState = readInitialConsentState(config);

  if (typeof window.__BUSTA_CONSENT__ === "object" && window.__BUSTA_CONSENT__) {
    updateConsentState(window.__BUSTA_CONSENT__);
  }

  window.addEventListener(CONSENT_UPDATE_EVENT_NAME, (event) => {
    const detail = event && event.detail ? event.detail : {};
    updateConsentState(detail);
  });

  window.BustaMonitoringConsent = {
    getState: () => getConsentState(),
    grantAll: () => updateConsentState({ analytics: true, errorTracking: true }),
    revokeAll: () => updateConsentState({ analytics: false, errorTracking: false }),
    update: (partialState) => updateConsentState(partialState)
  };
}
