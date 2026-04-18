import { queryAll, queryOne, removeClasses, removeClassesFromAll, toggleClasses } from "./dom.js";

const MENU_OPEN_CLASSES = "open open-menu";

/**
 * Initialize menu toggles and close behavior for each menu wrapper.
 *
 * @param {string} wrapperSelector
 */
export function initMenus(wrapperSelector = ".menu-wrapper") {
  enableIosActiveFix();

  const wrappers = queryAll(wrapperSelector);
  wrappers.forEach((wrapper) => initMenuWrapper(wrapper));
}

/**
 * Make :active pseudo classes work on iOS.
 */
function enableIosActiveFix() {
  document.addEventListener("touchstart", function noop() {}, false);
}

/**
 * @param {Element} wrapper
 */
function initMenuWrapper(wrapper) {
  const body = document.body;
  const menu = queryOne(".ed-menu", wrapper);
  const menuTrigger = queryOne(".menu-trigger", wrapper);

  if (!menu || !menuTrigger || !body) {
    return;
  }

  const menuLinks = queryAll("a", menu);
  const closeTargets = [body, menu, menuTrigger];
  const menuId = menu.id || `site-menu-${Math.random().toString(36).slice(2, 10)}`;

  menu.id = menuId;
  menuTrigger.setAttribute("role", "button");
  menuTrigger.setAttribute("tabindex", "0");
  menuTrigger.setAttribute("aria-controls", menuId);
  menuTrigger.setAttribute("aria-label", menuTrigger.getAttribute("aria-label") || "Open navigation menu");
  menuTrigger.setAttribute("aria-expanded", "false");

  removeClassesFromAll(closeTargets, MENU_OPEN_CLASSES);

  const syncExpandedState = () => {
    const expanded = menu.classList.contains("open") || menu.classList.contains("open-menu");
    menuTrigger.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const toggleMenu = () => {
    toggleClasses(menuTrigger, MENU_OPEN_CLASSES);
    toggleClasses(body, MENU_OPEN_CLASSES);
    toggleClasses(menu, MENU_OPEN_CLASSES);
    syncExpandedState();
  };

  const closeMenu = () => {
    removeClassesFromAll(closeTargets, MENU_OPEN_CLASSES);
    syncExpandedState();
  };

  menuTrigger.addEventListener("click", toggleMenu);
  menuTrigger.addEventListener("keydown", (event) => {
    const isEnter = event.key === "Enter";
    const isSpace = event.key === " ";

    if (isEnter || isSpace) {
      event.preventDefault();
      toggleMenu();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeMenu();
    menuTrigger.focus();
  });

  menuLinks.forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  removeClasses(menu, "open");
  syncExpandedState();
}
