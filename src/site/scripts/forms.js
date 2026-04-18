import { queryAll } from "./dom.js";
import { trackLeadEvent } from "./analytics.js";
import { getCms, getElementFormContainer, getWebcard } from "./runtime.js";

let csrfToken = null;
let csrfPromise = null;

/**
 * Initialize form enhancements: captcha reveal and CSRF token bridge.
 */
export function initForms() {
  initCaptchaReveal();
  initAccessibleValidation();

  if (shouldPrefetchCsrf()) {
    void ensureCsrfToken();
  }

  patchFormContainer();
}

/**
 * Reveal captcha once a horizontal form is interacted with.
 */
function initCaptchaReveal() {
  if (document.body.classList.contains("edit")) {
    return;
  }

  const forms = queryAll(".horizontal-form");
  forms.forEach((formElement) => {
    if (formElement.dataset.captchaRevealBound === "1") {
      return;
    }

    formElement.dataset.captchaRevealBound = "1";
    formElement.addEventListener("click", () => {
      trackFormStart(formElement);
      queryAll(".ed-form-captcha", formElement).forEach((captchaElement) => {
        captchaElement.classList.add("show");
      });
    });
  });
}

/**
 * @param {Element} form
 * @returns {string}
 */
function getFormIdentifier(form) {
  const explicitId = (form.getAttribute("id") || "").trim();
  if (explicitId) {
    return explicitId;
  }

  const name = (form.getAttribute("name") || "").trim();
  if (name) {
    return name;
  }

  return "contact_form";
}

/**
 * @param {Element} form
 */
function trackFormStart(form) {
  if (form.dataset.leadFormStarted === "1") {
    return;
  }

  form.dataset.leadFormStarted = "1";
  trackLeadEvent("contact_form_started", {
    form_id: getFormIdentifier(form)
  });
}

/**
 * @param {HTMLFormElement} form
 */
function observeFormSubmissionFeedback(form) {
  const container = form.closest(".ed-form-container");
  if (!container || container.dataset.leadObserverBound === "1") {
    return;
  }

  container.dataset.leadObserverBound = "1";

  let lastTrackedStatus = "";
  const formId = getFormIdentifier(form);

  const observer = new MutationObserver(() => {
    const successNode = container.querySelector(".wv-success");
    if (successNode && lastTrackedStatus !== "success") {
      lastTrackedStatus = "success";
      trackLeadEvent("contact_form_submit_success", {
        form_id: formId
      });
      return;
    }

    const failureNode = container.querySelector(".wv-failure");
    if (failureNode && lastTrackedStatus !== "failure") {
      lastTrackedStatus = "failure";
      trackLeadEvent("contact_form_submit_failure", {
        form_id: formId
      });
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true
  });
}

/**
 * @returns {string}
 */
function getApiBase() {
  if (window.location && window.location.origin && window.location.origin !== "null") {
    return `${window.location.origin}/api.php`;
  }

  const webcard = getWebcard();
  if (webcard && webcard.apiHost) {
    const protocol = window.location && window.location.protocol && window.location.protocol !== "file:"
      ? window.location.protocol
      : "https:";

    const normalizedHost = String(webcard.apiHost).replace(/\/api\.php\/?$/, "");
    return `${protocol}//${normalizedHost}/api.php`;
  }

  return "/api.php";
}

/**
 * @returns {boolean}
 */
function shouldPrefetchCsrf() {
  if (!window.location) {
    return true;
  }

  if (window.location.protocol === "file:") {
    return false;
  }

  const host = (window.location.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    return false;
  }

  return true;
}

/**
 * Ensure CSRF token is fetched once and then reused.
 *
 * @returns {Promise<string | null>}
 */
function ensureCsrfToken() {
  if (csrfToken) {
    return Promise.resolve(csrfToken);
  }

  if (csrfPromise) {
    return csrfPromise;
  }

  csrfPromise = fetch(`${getApiBase()}/form_container/csrf`, {
    method: "GET",
    credentials: "include"
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Unable to fetch CSRF token.");
      }

      return response.json();
    })
    .then((result) => {
      csrfToken = result && result.token ? result.token : null;
      return csrfToken;
    })
    .catch(() => {
      csrfToken = null;
      return null;
    });

  return csrfPromise;
}

/**
 * Inject CSRF token hidden input into form if available.
 *
 * @param {unknown} formRef
 * @param {string | null} token
 */
function injectTokenField(formRef, token) {
  if (!token) {
    return;
  }

  const formElement = resolveFormElement(formRef);
  if (!formElement) {
    return;
  }

  let tokenField = formElement.querySelector('input[name="csrf_token"]');
  if (!tokenField) {
    tokenField = document.createElement("input");
    tokenField.type = "hidden";
    tokenField.name = "csrf_token";
    formElement.appendChild(tokenField);
  }

  tokenField.value = token;
}

/**
 * Patch vendor form submit to include CSRF token.
 */
function patchFormContainer() {
  const ElementFormContainer = getElementFormContainer();
  if (!ElementFormContainer || !ElementFormContainer.prototype) {
    return;
  }

  if (ElementFormContainer.prototype.__csrfPatched) {
    return;
  }

  const originalSubmit = ElementFormContainer.prototype.submit;
  if (typeof originalSubmit !== "function") {
    return;
  }

  ElementFormContainer.prototype.submit = function submitWithCsrf(...args) {
    const self = this;

    if (self.__csrfPreparing || getCms()) {
      return originalSubmit.apply(self, args);
    }

    self.__csrfPreparing = true;

    ensureCsrfToken().finally(() => {
      if (csrfToken) {
        injectTokenField(self.$form || self.form || null, csrfToken);
      }

      self.__csrfPreparing = false;
      originalSubmit.apply(self, args);
    });

    return self;
  };

  ElementFormContainer.prototype.__csrfPatched = true;
}

/**
 * Resolve either a jQuery form wrapper or a native form element.
 *
 * @param {unknown} formRef
 * @returns {HTMLFormElement | null}
 */
function resolveFormElement(formRef) {
  if (!formRef) {
    return null;
  }

  if (formRef instanceof HTMLFormElement) {
    return formRef;
  }

  if (typeof formRef === "object") {
    const maybeJquery = /** @type {{ jquery?: string; length?: number; 0?: Element }} */ (formRef);
    if (maybeJquery.jquery && maybeJquery.length && maybeJquery[0] instanceof HTMLFormElement) {
      return maybeJquery[0];
    }
  }

  return null;
}

/**
 * Adds screen-reader-friendly validation and field labels.
 */
function initAccessibleValidation() {
  const forms = queryAll(".ed-form-container form");

  forms.forEach((form) => {
    if (form.dataset.a11yValidationBound === "1") {
      return;
    }

    form.dataset.a11yValidationBound = "1";
    ensureFormLiveRegion(form);
    ensureFormLabels(form);
    observeFormSubmissionFeedback(form);

    form.addEventListener("focusin", () => {
      trackFormStart(form);
    });

    form.addEventListener(
      "invalid",
      (event) => {
        const control = event.target;
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
          return;
        }

        markFieldInvalid(control);
      },
      true
    );

    form.addEventListener("submit", (event) => {
      const formId = getFormIdentifier(form);
      trackLeadEvent("contact_form_submit_attempt", {
        form_id: formId
      });

      const invalidFields = getInvalidFields(form);
      if (!invalidFields.length) {
        announceFormStatus(form, "Submitting form");
        trackLeadEvent("contact_form_submit_valid", {
          form_id: formId
        });
        // Loading state: disable submit and show "Sending..."
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.dataset.originalText = submitBtn.textContent;
          submitBtn.textContent = "Sending…";
          submitBtn.disabled = true;
          submitBtn.classList.add("is-loading");
          // Restore on success or failure (observed by MutationObserver below)
          const container = form.closest(".ed-form-container");
          if (container) {
            const restoreBtn = new MutationObserver(() => {
              if (container.querySelector(".wv-success, .wv-failure")) {
                submitBtn.textContent = submitBtn.dataset.originalText || "Submit";
                submitBtn.disabled = false;
                submitBtn.classList.remove("is-loading");
                restoreBtn.disconnect();
              }
            });
            restoreBtn.observe(container, { childList: true, subtree: true });
          }
        }
        return;
      }

      event.preventDefault();
      invalidFields.forEach((field) => markFieldInvalid(field));
      announceFormStatus(
        form,
        `${invalidFields.length} field${invalidFields.length > 1 ? "s are" : " is"} missing or invalid. Please review and try again.`
      );
      trackLeadEvent("contact_form_validation_failed", {
        form_id: formId,
        invalid_field_count: invalidFields.length
      });
      invalidFields[0].focus();
    });

    const controls = queryAll("input, textarea, select", form);
    controls.forEach((control) => {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
        return;
      }

      control.addEventListener("input", () => clearFieldError(control));
      control.addEventListener("change", () => clearFieldError(control));
    });
  });
}

function ensureFormLiveRegion(form) {
  if (form.querySelector(".form-live-region")) {
    return;
  }

  const liveRegion = document.createElement("div");
  liveRegion.className = "form-live-region sr-only";
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  form.prepend(liveRegion);
}

function announceFormStatus(form, message) {
  const liveRegion = form.querySelector(".form-live-region");
  if (!liveRegion) {
    return;
  }

  liveRegion.textContent = "";
  window.setTimeout(() => {
    liveRegion.textContent = message;
  }, 10);
}

function ensureFormLabels(form) {
  const controls = queryAll("input, textarea, select", form);

  controls.forEach((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
      return;
    }

    if (control.type === "hidden") {
      return;
    }

    if (!control.id) {
      control.id = `field-${Math.random().toString(36).slice(2, 10)}`;
    }

    const existingLabel = form.querySelector(`label[for="${control.id}"]`);
    if (existingLabel || control.getAttribute("aria-label")) {
      return;
    }

    const labelText = buildLabelText(control);
    if (!labelText) {
      return;
    }

    const label = document.createElement("label");
    label.className = "sr-only";
    label.setAttribute("for", control.id);
    label.textContent = labelText;
    control.parentElement?.insertBefore(label, control);
  });
}

function buildLabelText(control) {
  const placeholder = (control.getAttribute("placeholder") || "").trim();
  if (placeholder) {
    return placeholder;
  }

  if (control.type === "checkbox") {
    return "Checkbox option";
  }

  if (control.type === "email") {
    return "Email address";
  }

  if (control.type === "tel") {
    return "Phone number";
  }

  const name = (control.getAttribute("name") || "").trim();
  if (!name) {
    return "Form field";
  }

  return name.replace(/[_\[\]]+/g, " ").trim() || "Form field";
}

function getInvalidFields(form) {
  const controls = queryAll("input, textarea, select", form);
  return controls.filter((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
      return false;
    }

    if (control.type === "hidden") {
      return false;
    }

    return !control.checkValidity();
  });
}

function markFieldInvalid(control) {
  control.setAttribute("aria-invalid", "true");

  const fieldId = control.id || `field-${Math.random().toString(36).slice(2, 10)}`;
  control.id = fieldId;

  const errorId = `${fieldId}-error`;
  let errorNode = document.getElementById(errorId);

  if (!errorNode) {
    errorNode = document.createElement("p");
    errorNode.id = errorId;
    errorNode.className = "form-error-message";
    errorNode.setAttribute("role", "alert");
    control.parentElement?.appendChild(errorNode);
  }

  errorNode.textContent = control.validationMessage || "Please complete this field.";

  const describedBy = (control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
  if (!describedBy.includes(errorId)) {
    describedBy.push(errorId);
    control.setAttribute("aria-describedby", describedBy.join(" "));
  }
}

function clearFieldError(control) {
  if (!control.checkValidity()) {
    return;
  }

  control.removeAttribute("aria-invalid");
  const errorId = `${control.id}-error`;
  const errorNode = document.getElementById(errorId);
  if (errorNode) {
    errorNode.remove();
  }

  const describedBy = (control.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter((entry) => entry && entry !== errorId);

  if (describedBy.length) {
    control.setAttribute("aria-describedby", describedBy.join(" "));
  } else {
    control.removeAttribute("aria-describedby");
  }
}
