/**
 * Runtime helpers that isolate access to vendor-provided globals.
 */

/**
 * Run callback when DOM is ready.
 *
 * @param {() => void} callback
 */
export function onDomReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
    return;
  }

  callback();
}

/**
 * @returns {any | null}
 */
export function getViewport() {
  return typeof globalThis !== "undefined" && globalThis.viewport ? globalThis.viewport : null;
}

/**
 * @returns {any | null}
 */
export function getWebcard() {
  return typeof globalThis !== "undefined" && globalThis.webcard ? globalThis.webcard : null;
}

/**
 * @returns {any | null}
 */
export function getCms() {
  return typeof globalThis !== "undefined" && globalThis.cms ? globalThis.cms : null;
}

/**
 * @returns {any | null}
 */
export function getElementFormContainer() {
  return typeof globalThis !== "undefined" && globalThis.ElementFormContainer
    ? globalThis.ElementFormContainer
    : null;
}

/**
 * Observe viewport lifecycle events with a safe fallback to window events.
 *
 * @param {string} eventName
 * @param {() => void} handler
 */
export function observeViewport(eventName, handler) {
  const viewport = getViewport();
  if (viewport && typeof viewport.observe === "function") {
    viewport.observe(eventName, handler);
    return;
  }

  if (eventName === "scroll") {
    window.addEventListener("scroll", handler, { passive: true });
    return;
  }

  if (eventName === "resize") {
    window.addEventListener("resize", handler);
  }
}

/**
 * @returns {number}
 */
export function getScrollTop() {
  const viewport = getViewport();
  if (viewport && typeof viewport.getScrollTop === "function") {
    return viewport.getScrollTop();
  }

  return window.pageYOffset || document.documentElement.scrollTop || 0;
}

/**
 * @returns {number}
 */
export function getViewportHeight() {
  const viewport = getViewport();
  if (viewport && typeof viewport.getHeight === "function") {
    return viewport.getHeight();
  }

  return window.innerHeight || document.documentElement.clientHeight || 0;
}

/**
 * @param {Element} element
 * @returns {number}
 */
export function getOffsetTop(element) {
  if (!element) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  return rect.top + getScrollTop();
}

/**
 * Scroll to an element or numeric offset.
 *
 * @param {Element | number} target
 * @param {"top" | "center" | "bottom"} align
 * @param {number} duration
 * @param {number} offset
 */
export function scrollToTarget(target, align = "top", duration = 500, offset = 0) {
  const viewport = getViewport();
  if (viewport && typeof viewport.scrollTo === "function") {
    viewport.scrollTo(target, align, duration, offset);
    return;
  }

  let destination = 0;
  if (typeof target === "number") {
    destination = target;
  } else if (target && typeof target.getBoundingClientRect === "function") {
    destination = getOffsetTop(target);
  }

  window.scrollTo({
    top: Math.max(destination - offset, 0),
    behavior: duration > 0 ? "smooth" : "auto"
  });
}
