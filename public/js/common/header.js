(function () {
  "use strict";

  const LABELS = {
    en: {
      dashboard: "Dashboard",
      chat: "Chat",
      login: "Login",
      signup: "Sign up",
      logout: "Logout",
      language: "العربية",
    },
    ar: {
      dashboard: "لوحة التحكم",
      chat: "الشات",
      login: "تسجيل الدخول",
      signup: "إنشاء حساب",
      logout: "تسجيل الخروج",
      language: "English",
    },
  };

  function createLink(href, className, icon, labelKey) {
    const a = document.createElement("a");
    a.href = href;
    a.className = className;
    a.innerHTML = `<i class="${icon}"></i><span data-label="${labelKey}"></span>`;
    return a;
  }

  function buildHeader(mode) {
    const header = document.createElement("header");
    header.className = "chat-header";

    header.innerHTML = `
      <div class="header-inner">
        <a href="index.html" class="brand-link" aria-label="Home">
          <img src="assets/imp-logo.jpeg" alt="IMP logo" class="brand-logo" />
        </a>

        <nav class="header-nav" aria-label="Main navigation"></nav>

        <div class="header-actions">
          <button class="lang-btn" type="button" id="langSwitch">
            <i class="fa-solid fa-language"></i>
            <span class="lang-text"></span>
          </button>
        </div>
      </div>
    `;

    const nav = header.querySelector(".header-nav");
    const actions = header.querySelector(".header-actions");
    const langBtn = header.querySelector("#langSwitch");

    if (mode === "private") {
      const dashLink = createLink("dashboard.html", "header-link", "fa-solid fa-chart-line", "dashboard");
      const chatLink = createLink("app.html", "header-link", "fa-solid fa-comments", "chat");
      nav.appendChild(dashLink);
      nav.appendChild(chatLink);

      const logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "header-logout";
      logoutBtn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i><span data-label="logout"></span>`;
      logoutBtn.addEventListener("click", function () {
        if (window.LA_AUTH && typeof window.LA_AUTH.logout === "function") {
          window.LA_AUTH.logout();
        } else {
          window.location.href = "index.html";
        }
      });
      actions.insertBefore(logoutBtn, langBtn);
    } else if (mode === "public-home") {
      const loginLink = createLink("login.html", "header-login", "fa-solid fa-right-to-bracket", "login");
      const signupLink = createLink("signup.html", "header-signup", "fa-solid fa-user-plus", "signup");
      actions.insertBefore(loginLink, langBtn);
      actions.insertBefore(signupLink, langBtn);
    }

    function syncLangButton(lang) {
      const cur = LABELS[lang] ? lang : "en";
      langBtn.querySelector(".lang-text").textContent = LABELS[cur].language;
      header.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");

      header.querySelectorAll("[data-label]").forEach((node) => {
        const key = node.getAttribute("data-label");
        const text = LABELS[cur][key] || LABELS.en[key] || "";
        node.textContent = text;
      });
    }

    langBtn.addEventListener("click", function () {
      const cur = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
      const next = cur === "ar" ? "en" : "ar";
      if (window.LA_I18N) window.LA_I18N.setLocale(next);
    });

    window.addEventListener("la:locale-changed", function (ev) {
      syncLangButton(ev?.detail?.lang || "en");
    });

    // تهيئة أولية
    const initial = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
    syncLangButton(initial);

    return header;
  }

  function initUnifiedHeader() {
    const body = document.body;
    const mode = body.getAttribute("data-header") || "public-home";

    if (document.querySelector(".chat-header")) return;

    const header = buildHeader(mode);
    body.insertBefore(header, body.firstChild);
    body.classList.add("has-topbar");

    // اضبط المتغيرات بناءً على ارتفاع الهيدر الفعلي (ديناميكي على كل الصفحات)
    const syncHeaderMetrics = () => {
      const rect = header.getBoundingClientRect();
      const height = Math.ceil(rect.height);
      const offset = height ; // مسافة أمان بسيطة تحت الهيدر
      const root = document.documentElement;
      root.style.setProperty("--header-height", `${height}px`);
      root.style.setProperty("--header-offset", `${offset}px`);
    };

    syncHeaderMetrics();

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => syncHeaderMetrics());
      resizeObserver.observe(header);
    }
    window.addEventListener("resize", syncHeaderMetrics);

    window.addEventListener("la:locale-changed", syncHeaderMetrics);

    if (mode === "public-auth") {
      const inCardBrand = document.querySelector(".auth-brand");
      if (inCardBrand) inCardBrand.style.display = "none";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    try {
      initUnifiedHeader();
    } catch (e) {
      console.error("Header init error", e);
    }
  });
})();
