/**
 * Generic DOM utilities shared by feature modules.
 */

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {Element[]}
 */
export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {Element | null}
 */
export function queryOne(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * @param {Element | null} element
 * @param {string} classNames
 */
export function addClasses(element, classNames) {
  if (!element) {
    return;
  }

  splitClassNames(classNames).forEach((name) => element.classList.add(name));
}

/**
 * @param {Element | null} element
 * @param {string} classNames
 */
export function removeClasses(element, classNames) {
  if (!element) {
    return;
  }

  splitClassNames(classNames).forEach((name) => element.classList.remove(name));
}

/**
 * @param {Element | null} element
 * @param {string} classNames
 */
export function toggleClasses(element, classNames) {
  if (!element) {
    return;
  }

  splitClassNames(classNames).forEach((name) => element.classList.toggle(name));
}

/**
 * @param {Element[]} elements
 * @param {string} classNames
 */
export function removeClassesFromAll(elements, classNames) {
  elements.forEach((element) => removeClasses(element, classNames));
}

/**
 * @param {string} classNames
 * @returns {string[]}
 */
export function splitClassNames(classNames) {
  return classNames
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @param {string} hash
 * @returns {Element | null}
 */
export function getHashTarget(hash) {
  if (!hash || !hash.startsWith("#")) {
    return null;
  }

  const id = hash.slice(1);
  if (!id) {
    return null;
  }

  return document.getElementById(id) || document.querySelector(hash);
}
