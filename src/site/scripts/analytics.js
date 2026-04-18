import { getMonitoringConfig, hasGa4Config, hasSentryConfig } from "./monitoring/config.js";
import {
  hasAnalyticsConsent,
  hasErrorTrackingConsent,
  initConsentBridge
} from "./monitoring/consent.js";
import { initGa4, trackGa4Event } from "./monitoring/ga4.js";
import {
  addSentryBreadcrumb,
  captureSentryException,
  initSentry,
  isSentryInitialized
} from "./monitoring/sentry.js";
import { initWebVitalsReporting } from "./monitoring/vitals.js";

let ga4Bootstrapped = false;
let sentryBootstrapped = false;
let webVitalsBootstrapped = false;
let clickTrackingBound = false;
let consentEventBound = false;

/**
 * @returns {{ pageType: string, pagePath: string }}
 */
function getPageContext() {
  const pathname = window.location ? window.location.pathname || "/" : "/";
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  switch (normalizedPath) {
    case "/":
    case "/index.html":
      return { pageType: "home", pagePath: "/" };
    case "/projects-clients":
    case "/projects-clients/index.html":
      return { pageType: "projects_clients", pagePath: "/projects-clients" };
    case "/spares-components":
    case "/spares-components/index.html":
      return { pageType: "spares_components", pagePath: "/spares-components" };
    case "/privacy":
    case "/privacy/index.html":
      return { pageType: "privacy", pagePath: "/privacy" };
    case "/legal-notice":
    case "/legal-notice/index.html":
      return { pageType: "legal_notice", pagePath: "/legal-notice" };
    default:
      return { pageType: "content", pagePath: normalizedPath };
  }
}

/**
 * @param {Element | null} anchor
 * @returns {string}
 */
function getAnchorLabel(anchor) {
  if (!anchor) {
    return "link";
  }

  const ariaLabel = (anchor.getAttribute("aria-label") || "").trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  const title = (anchor.getAttribute("title") || "").trim();
  if (title) {
    return title;
  }

  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  if (text) {
    return text;
  }

  const nestedImage = anchor.querySelector("img");
  if (nestedImage) {
    const alt = (nestedImage.getAttribute("alt") || "").trim();
    if (alt) {
      return alt;
    }
  }

  return "link";
}

/**
 * @param {string} href
 * @returns {string}
 */
function toAbsoluteHref(href) {
  try {
    return new URL(href, window.location.href).href;
  } catch (_error) {
    return href;
  }
}

/**
 * @param {Record<string, any>} params
 */
function addSentryBreadcrumbForEvent(eventName, params) {
  if (!isSentryInitialized()) {
    return;
  }

  addSentryBreadcrumb(eventName, params);
}

/**
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 * @param {string} [category]
 */
export function trackEvent(eventName, params = {}, category = "engagement") {
  const pageContext = getPageContext();
  const payload = {
    event_category: category,
    page_type: pageContext.pageType,
    page_path: pageContext.pagePath,
    ...params
  };

  if (hasAnalyticsConsent()) {
    trackGa4Event(eventName, payload);
  }

  addSentryBreadcrumbForEvent(eventName, payload);
}

/**
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 */
export function trackLeadEvent(eventName, params = {}) {
  trackEvent(eventName, params, "lead");
}

/**
 * @param {Error | unknown} error
 * @param {Record<string, any>} [extra]
 */
export function reportClientError(error, extra = {}) {
  const pageContext = getPageContext();
  captureSentryException(error, {
    tags: {
      page_type: pageContext.pageType
    },
    extra
  });
}

async function bootstrapGa4IfAllowed() {
  if (ga4Bootstrapped || !hasAnalyticsConsent()) {
    return;
  }

  const monitoringConfig = getMonitoringConfig();
  if (!hasGa4Config(monitoringConfig)) {
    return;
  }

  const pageContext = getPageContext();
  ga4Bootstrapped = await initGa4(monitoringConfig.ga4MeasurementId, pageContext);

  if (ga4Bootstrapped && !webVitalsBootstrapped) {
    initWebVitalsReporting((eventName, params) => {
      trackEvent(eventName, params, "performance");
    });
    webVitalsBootstrapped = true;
  }
}

function bootstrapSentryIfAllowed() {
  if (sentryBootstrapped || !hasErrorTrackingConsent()) {
    return;
  }

  const monitoringConfig = getMonitoringConfig();
  if (!hasSentryConfig(monitoringConfig)) {
    return;
  }

  const pageContext = getPageContext();
  sentryBootstrapped = initSentry({
    dsn: monitoringConfig.sentryDsn,
    environment: monitoringConfig.sentryEnvironment,
    release: monitoringConfig.sentryRelease,
    pageType: pageContext.pageType
  });
}

function trackAnchorInteraction(anchorElement) {
  if (!(anchorElement instanceof HTMLAnchorElement)) {
    return;
  }

  const rawHref = (anchorElement.getAttribute("href") || "").trim();
  if (!rawHref || rawHref.startsWith("#")) {
    return;
  }

  const href = rawHref.toLowerCase();
  const linkLabel = getAnchorLabel(anchorElement);
  const pageContext = getPageContext();

  if (href.startsWith("tel:")) {
    trackLeadEvent("contact_phone_click", {
      link_label: linkLabel,
      phone_target: rawHref.replace(/^tel:/i, "")
    });
    return;
  }

  if (href.startsWith("mailto:")) {
    trackLeadEvent("contact_email_click", {
      link_label: linkLabel,
      email_target: rawHref.replace(/^mailto:/i, "")
    });
    return;
  }

  if (/wa\.me|whatsapp/i.test(href)) {
    trackLeadEvent("contact_whatsapp_click", {
      link_label: linkLabel,
      destination_url: toAbsoluteHref(rawHref)
    });
    return;
  }

  if (/\.pdf(?:$|\?)/i.test(rawHref)) {
    trackEvent("document_download", {
      link_label: linkLabel,
      document_url: toAbsoluteHref(rawHref),
      document_type: "pdf"
    }, "content");
    return;
  }

  if (anchorElement.closest(".ed-gallery")) {
    trackEvent("gallery_item_open", {
      link_label: linkLabel,
      destination_url: toAbsoluteHref(rawHref),
      gallery_context: pageContext.pageType
    }, "content");
    return;
  }

  if (
    anchorElement.classList.contains("cta-button") ||
    anchorElement.classList.contains("ed-button") ||
    anchorElement.closest(".ed-button")
  ) {
    trackEvent("cta_click", {
      cta_label: linkLabel,
      destination_url: toAbsoluteHref(rawHref)
    }, "lead");
  }
}

function bindClickTracking() {
  if (clickTrackingBound) {
    return;
  }

  clickTrackingBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest("a");
    trackAnchorInteraction(anchor);
  });
}

function bindConsentListener() {
  if (consentEventBound) {
    return;
  }

  consentEventBound = true;
  window.addEventListener("busta:consent:changed", () => {
    void bootstrapGa4IfAllowed();
    bootstrapSentryIfAllowed();
  });
}

/**
 * Initializes consent-gated monitoring integrations.
 */
export function initAnalytics() {
  if (document.body.dataset.analyticsInitialized === "1") {
    return;
  }

  document.body.dataset.analyticsInitialized = "1";

  initConsentBridge();
  bindConsentListener();
  bindClickTracking();

  void bootstrapGa4IfAllowed();
  bootstrapSentryIfAllowed();
}
