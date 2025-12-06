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

  let syncHeaderMetrics = () => {};

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

        <button class="menu-toggle" type="button" aria-label="Toggle menu" aria-expanded="false">
          <span class="menu-toggle-icon" aria-hidden="true"></span>
        </button>

        <div class="header-menu" data-state="closed">
          <nav class="header-nav" aria-label="Main navigation"></nav>

          <div class="header-actions">
            <button class="lang-btn" type="button" id="langSwitch">
              <i class="fa-solid fa-language"></i>
              <span class="lang-text"></span>
            </button>
          </div>
        </div>
      </div>
    `;

    const nav = header.querySelector(".header-nav");
    const actions = header.querySelector(".header-actions");
    const langBtn = header.querySelector("#langSwitch");
    const menuToggle = header.querySelector(".menu-toggle");
    const menuWrapper = header.querySelector(".header-menu");

    const isMobile = () => window.matchMedia("(max-width: 991px)").matches;

    const closeMenu = () => {
      menuWrapper.classList.remove("is-open");
      header.classList.remove("menu-open");
      menuToggle?.setAttribute("aria-expanded", "false");
      menuWrapper.dataset.state = "closed";
      syncHeaderMetrics();
    };

    const toggleMenu = () => {
      const nextState = !menuWrapper.classList.contains("is-open");
      if (nextState && !isMobile()) return;
      menuWrapper.classList.toggle("is-open", nextState);
      header.classList.toggle("menu-open", nextState);
      menuToggle?.setAttribute("aria-expanded", nextState ? "true" : "false");
      menuWrapper.dataset.state = nextState ? "open" : "closed";
      syncHeaderMetrics();
    };

    header._closeMenu = closeMenu;
    header._isMobile = isMobile;
    header._menuWrapper = menuWrapper;
    header._menuToggle = menuToggle;
    header._toggleMenu = toggleMenu;

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
        closeMenu();
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

    menuToggle?.addEventListener("click", toggleMenu);

    menuWrapper?.addEventListener("click", (ev) => {
      const actionable = ev.target.closest("a, button");
      if (actionable) closeMenu();
    });

    document.addEventListener("click", (ev) => {
      if (!menuWrapper?.classList.contains("is-open")) return;
      if (!header.contains(ev.target)) closeMenu();
    });

    langBtn.addEventListener("click", function () {
      const cur = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
      const next = cur === "ar" ? "en" : "ar";
      if (window.LA_I18N) window.LA_I18N.setLocale(next);
    });

    window.addEventListener("la:locale-changed", function (ev) {
      syncLangButton(ev?.detail?.lang || "en");
      closeMenu();
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
    syncHeaderMetrics = () => {
      const rect = header.getBoundingClientRect();
      const height = Math.ceil(rect.height);
      const menuHeight = header._menuWrapper?.classList.contains("is-open")
        ? header._menuWrapper.scrollHeight
        : 0;
      const offset = header._isMobile && header._isMobile() ? height + menuHeight : height;
      const root = document.documentElement;
      root.style.setProperty("--header-height", `${height}px`);
      root.style.setProperty("--header-offset", `${offset}px`);
    };

    syncHeaderMetrics();

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => syncHeaderMetrics());
      resizeObserver.observe(header);
    }
    window.addEventListener("resize", () => {
      if (header._isMobile && !header._isMobile()) {
        header._closeMenu?.();
      }
      syncHeaderMetrics();
    });

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
