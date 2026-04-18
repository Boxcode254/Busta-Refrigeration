const GTAG_SCRIPT_BASE_URL = "https://www.googletagmanager.com/gtag/js?id=";

let configuredMeasurementId = "";
let ga4Initialized = false;
let scriptLoadPromise = null;

/** @type {{ name: string, params: Record<string, any> }[]} */
const queuedEvents = [];

/**
 * @param {Record<string, any>} params
 * @returns {Record<string, string | number | boolean>}
 */
function normalizeParameters(params = {}) {
  return Object.entries(params).reduce((accumulator, [key, value]) => {
    if (value === null || value === undefined) {
      return accumulator;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      accumulator[key] = value;
      return accumulator;
    }

    accumulator[key] = String(value);
    return accumulator;
  }, {});
}

function ensureGlobalGtagStub() {
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

/**
 * @param {string} measurementId
 * @returns {Promise<void>}
 */
function loadGtagScript(measurementId) {
  if (scriptLoadPromise && configuredMeasurementId === measurementId) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('[data-monitoring="ga4-script"]');
    if (existingScript) {
      resolve();
      return;
    }

    const scriptElement = document.createElement("script");
    scriptElement.async = true;
    scriptElement.src = `${GTAG_SCRIPT_BASE_URL}${encodeURIComponent(measurementId)}`;
    scriptElement.dataset.monitoring = "ga4-script";
    scriptElement.addEventListener("load", () => resolve(), { once: true });
    scriptElement.addEventListener("error", () => reject(new Error("Unable to load GA4 script")), {
      once: true
    });
    document.head.appendChild(scriptElement);
  });

  return scriptLoadPromise;
}

function flushEventQueue() {
  if (!ga4Initialized || typeof window.gtag !== "function") {
    return;
  }

  while (queuedEvents.length > 0) {
    const event = queuedEvents.shift();
    if (!event) {
      continue;
    }

    window.gtag("event", event.name, normalizeParameters(event.params));
  }
}

/**
 * @param {string} measurementId
 * @param {{ pageType: string, pagePath: string }} context
 * @returns {Promise<boolean>}
 */
export async function initGa4(measurementId, context) {
  const normalizedMeasurementId = typeof measurementId === "string" ? measurementId.trim() : "";

  if (!normalizedMeasurementId) {
    return false;
  }

  if (ga4Initialized && configuredMeasurementId === normalizedMeasurementId) {
    return true;
  }

  ensureGlobalGtagStub();
  await loadGtagScript(normalizedMeasurementId);

  configuredMeasurementId = normalizedMeasurementId;
  window.gtag("js", new Date());
  window.gtag("config", configuredMeasurementId, {
    anonymize_ip: true,
    send_page_view: false
  });

  ga4Initialized = true;
  trackGa4Event("page_view", {
    page_title: document.title,
    page_type: context.pageType,
    page_path: context.pagePath,
    page_location: window.location.href
  });
  flushEventQueue();

  return true;
}

/**
 * @param {string} eventName
 * @param {Record<string, any>} [eventParams]
 */
export function trackGa4Event(eventName, eventParams = {}) {
  const normalizedName = typeof eventName === "string" ? eventName.trim() : "";
  if (!normalizedName) {
    return;
  }

  if (!ga4Initialized || typeof window.gtag !== "function") {
    queuedEvents.push({
      name: normalizedName,
      params: eventParams
    });
    return;
  }

  window.gtag("event", normalizedName, normalizeParameters(eventParams));
}

export function isGa4Initialized() {
  return ga4Initialized;
}
