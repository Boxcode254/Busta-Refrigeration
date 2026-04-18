import { queryAll, queryOne } from "./dom.js";

const SKIP_LINK_ID = "skip-to-main-content";
const MAIN_CONTENT_ID = "main-content";

/**
 * Initializes shared accessibility enhancements across all pages.
 */
export function initAccessibility() {
  ensureMainLandmark();
  ensureSkipLink();
  addLabelsToIconOnlyLinks();
  enhanceNonSemanticControls();
  annotateCarousels();
  repairLowContrastBrandText();
}

function ensureMainLandmark() {
  const existingMain = queryOne(`#${MAIN_CONTENT_ID}`) || queryOne("main") || queryOne('[role="main"]');
  if (existingMain) {
    existingMain.id = existingMain.id || MAIN_CONTENT_ID;
    if (existingMain.tagName.toLowerCase() !== "main") {
      existingMain.setAttribute("role", "main");
    }
    return;
  }

  const target =
    queryOne(".ed-element.ed-container.wv-boxed.wv-spacer:not(.back-button)") ||
    queryOne(".ed-element.ed-headline") ||
    document.body.firstElementChild;

  if (!target) {
    return;
  }

  target.id = MAIN_CONTENT_ID;
  target.setAttribute("role", "main");
}

function ensureSkipLink() {
  if (queryOne(`#${SKIP_LINK_ID}`)) {
    return;
  }

  const skipLink = document.createElement("a");
  skipLink.id = SKIP_LINK_ID;
  skipLink.className = "skip-link";
  skipLink.href = `#${MAIN_CONTENT_ID}`;
  skipLink.textContent = "Skip to main content";

  const firstFocusable = document.body.firstElementChild;
  if (firstFocusable) {
    document.body.insertBefore(skipLink, firstFocusable);
    return;
  }

  document.body.appendChild(skipLink);
}

function addLabelsToIconOnlyLinks() {
  const links = queryAll("a");

  links.forEach((link) => {
    const hasVisibleText = Boolean((link.textContent || "").replace(/\s+/g, "").length);
    const hasGraphicContent = Boolean(link.querySelector("svg, i, img, picture"));

    if (hasVisibleText || !hasGraphicContent) {
      return;
    }

    if (link.hasAttribute("aria-label")) {
      return;
    }

    const label = deriveLinkLabel(link);
    if (label) {
      link.setAttribute("aria-label", label);
    }

    if (link.target === "_blank" && !link.rel) {
      link.rel = "noopener noreferrer";
    }
  });
}

function deriveLinkLabel(link) {
  const href = (link.getAttribute("href") || "").trim();

  if (href.startsWith("tel:")) {
    return "Call us";
  }

  if (href.startsWith("mailto:")) {
    return "Send us an email";
  }

  if (/wa\.me|whatsapp/i.test(href)) {
    return "Chat with us on WhatsApp";
  }

  if (link.closest(".back-to-top-button-icon") || href === "#") {
    return "Back to top";
  }

  if (link.closest(".logo")) {
    return "Go to homepage";
  }

  if (link.closest(".regenerate")) {
    return "Regenerate captcha";
  }

  return "Open link";
}

function enhanceNonSemanticControls() {
  const menuTriggers = queryAll(".menu-trigger");
  menuTriggers.forEach((trigger) => {
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    if (!trigger.hasAttribute("aria-label")) {
      trigger.setAttribute("aria-label", "Open navigation menu");
    }
  });

  queryAll(".back-to-top-button-icon a").forEach((link) => {
    if (!link.hasAttribute("aria-label")) {
      link.setAttribute("aria-label", "Back to top");
    }
  });
}

function annotateCarousels() {
  const carousels = queryAll('.slider-container[aria-roledescription="carousel"]');

  carousels.forEach((carousel, index) => {
    carousel.setAttribute("role", "region");
    if (!carousel.hasAttribute("aria-label")) {
      const heading = findNearestHeadingText(carousel);
      carousel.setAttribute("aria-label", heading || `Image carousel ${index + 1}`);
    }

    const parameters = carousel.getAttribute("data-parameters") || "";
    if (/&quot;autoplay&quot;:true/.test(parameters) && !carousel.hasAttribute("aria-live")) {
      carousel.setAttribute("aria-live", "off");
    }
  });
}

function findNearestHeadingText(node) {
  let current = node.parentElement;
  while (current) {
    const heading = current.querySelector("h1, h2, h3, h4");
    if (heading && heading.textContent) {
      return heading.textContent.trim();
    }
    current = current.parentElement;
  }

  return "";
}

function repairLowContrastBrandText() {
  const textNodes = queryAll("p, span, a, h1, h2, h3, h4, h5, h6, li, strong, em, label");

  textNodes.forEach((node) => {
    const text = (node.textContent || "").trim();
    if (!text) {
      return;
    }

    const styles = window.getComputedStyle(node);
    const fg = parseRgbColor(styles.color);
    const bg = getEffectiveBackgroundColor(node);

    if (!fg || !bg) {
      return;
    }

    const ratio = contrastRatio(fg, bg);
    const fontSize = Number.parseFloat(styles.fontSize || "16");
    const fontWeight = Number.parseInt(styles.fontWeight || "400", 10);
    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const minimumRatio = isLargeText ? 3 : 4.5;

    if (ratio >= minimumRatio) {
      return;
    }

    if (isColorClose(fg, [251, 190, 26])) {
      node.style.color = "#6b3f00";
      return;
    }

    if (isColorClose(fg, [93, 154, 232])) {
      node.style.color = "#1f4f8f";
    }
  });
}

function parseRgbColor(color) {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function getEffectiveBackgroundColor(node) {
  let current = node;

  while (current && current !== document.documentElement) {
    const bgColor = window.getComputedStyle(current).backgroundColor;
    const parsed = parseRgbColor(bgColor);

    if (parsed && bgColor !== "rgba(0, 0, 0, 0)") {
      return parsed;
    }

    current = current.parentElement;
  }

  return [255, 255, 255];
}

function isColorClose(actual, expected) {
  return (
    Math.abs(actual[0] - expected[0]) <= 8 &&
    Math.abs(actual[1] - expected[1]) <= 8 &&
    Math.abs(actual[2] - expected[2]) <= 8
  );
}

function contrastRatio(a, b) {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}