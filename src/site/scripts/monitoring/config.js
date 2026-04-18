/**
 * Monitoring configuration sourced from Vite environment variables.
 */

const DEFAULT_CONSENT_KEY = "busta.monitoring.consent";

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @returns {{
 *   ga4MeasurementId: string,
 *   sentryDsn: string,
 *   sentryEnvironment: string,
 *   sentryRelease: string,
 *   consentStorageKey: string,
 *   defaultConsent: string
 * }}
 */
export function getMonitoringConfig() {
  const env = import.meta.env || {};

  return {
    ga4MeasurementId: cleanString(env.VITE_GA4_MEASUREMENT_ID),
    sentryDsn: cleanString(env.VITE_SENTRY_DSN),
    sentryEnvironment: cleanString(env.VITE_SENTRY_ENVIRONMENT) || "production",
    sentryRelease: cleanString(env.VITE_SENTRY_RELEASE),
    consentStorageKey: cleanString(env.VITE_MONITORING_CONSENT_KEY) || DEFAULT_CONSENT_KEY,
    defaultConsent: cleanString(env.VITE_MONITORING_DEFAULT_CONSENT) || "denied"
  };
}

/**
 * @param {ReturnType<typeof getMonitoringConfig>} [config]
 * @returns {boolean}
 */
export function hasGa4Config(config = getMonitoringConfig()) {
  return Boolean(config.ga4MeasurementId);
}

/**
 * @param {ReturnType<typeof getMonitoringConfig>} [config]
 * @returns {boolean}
 */
export function hasSentryConfig(config = getMonitoringConfig()) {
  return Boolean(config.sentryDsn);
}
