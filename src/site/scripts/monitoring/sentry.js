import * as Sentry from "@sentry/browser";

let sentryInitialized = false;

/**
 * @param {import("@sentry/browser").Event | null | undefined} event
 * @returns {boolean}
 */
function isIgnoredNoise(event) {
  if (!event) {
    return false;
  }

  const message = event.message || "";
  if (/ResizeObserver loop limit exceeded/i.test(message)) {
    return true;
  }

  if (/Script error/i.test(message)) {
    return true;
  }

  const exceptionValues = event.exception && event.exception.values ? event.exception.values : [];
  return exceptionValues.some((entry) =>
    /ResizeObserver loop completed with undelivered notifications/i.test(entry.value || "")
  );
}

/**
 * @param {{ dsn: string, environment: string, release: string, pageType: string }} config
 * @returns {boolean}
 */
export function initSentry(config) {
  if (sentryInitialized) {
    return true;
  }

  if (!config || !config.dsn) {
    return false;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || undefined,
    beforeSend(event) {
      if (isIgnoredNoise(event)) {
        return null;
      }

      return {
        ...event,
        tags: {
          ...(event.tags || {}),
          page_type: config.pageType
        }
      };
    }
  });

  Sentry.setTag("page_type", config.pageType);
  sentryInitialized = true;
  return true;
}

/**
 * @param {string} message
 * @param {Record<string, any>} [data]
 * @param {"info" | "warning" | "error"} [level]
 */
export function addSentryBreadcrumb(message, data = {}, level = "info") {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "monitoring",
    message,
    data,
    level
  });
}

/**
 * @param {Error | unknown} error
 * @param {{ tags?: Record<string, string>, extra?: Record<string, any> }} [context]
 */
export function captureSentryException(error, context = {}) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.captureException(error, context);
}

export function isSentryInitialized() {
  return sentryInitialized;
}
