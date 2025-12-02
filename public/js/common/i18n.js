(function () {
  "use strict";

  // Simple i18n util used across pages
  const STORAGE_KEY = "la_locale"; // learning-advisor locale
  const DEFAULT_LOCALE = "en";
  const SUPPORTED = new Set(["en", "ar"]);

  function getLocale() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.has(v) ? v : DEFAULT_LOCALE;
    } catch (_) {
      return DEFAULT_LOCALE;
    }
  }

  function setLocale(lang) {
    if (!SUPPORTED.has(lang)) lang = DEFAULT_LOCALE;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    applyLocaleToPage(lang);
  }

  function applyLocaleToPage(langArg) {
    const lang = SUPPORTED.has(langArg) ? langArg : getLocale();
    const html = document.documentElement;

    // Keep layout LTR per current design; toggle lang classes for CSS if needed
    html.setAttribute("lang", lang === "ar" ? "ar" : "en");
    html.classList.toggle("lang-ar", lang === "ar");
    html.classList.toggle("lang-en", lang !== "ar");

    // Toggle any [data-lang-content] blocks
    document.querySelectorAll("[data-lang-content]").forEach((el) => {
      const t = el.getAttribute("data-lang-content");
      if (t === lang) el.classList.remove("hidden");
      else el.classList.add("hidden");
    });

    // Inputs with language-specific placeholders (optional)
    document.querySelectorAll("[data-placeholder-en]").forEach((input) => {
      const en = input.getAttribute("data-placeholder-en");
      const ar = input.getAttribute("data-placeholder-ar") || en;
      input.setAttribute("placeholder", lang === "ar" ? ar : en);
    });
  }

  // Expose a tiny API on window.LA_I18N
  window.LA_I18N = {
    getLocale,
    setLocale,
    applyLocaleToPage,
    DEFAULT_LOCALE
  };

  // Auto-apply on DOM ready (for pages that only include i18n.js)
  document.addEventListener("DOMContentLoaded", function () {
    applyLocaleToPage(getLocale());
  });
})();