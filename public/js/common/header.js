(function () {
  "use strict";

  // يبني نفس بنية الهيدر القديم (نفس الكلاسات) علشان يرث CSS كما هو
  function buildLegacyHeader(mode) {
    const header = document.createElement("div");
    header.className = "chat-header";

    header.innerHTML = `
      <div class="header-inner">
        <div class="header-left">
          <a href="index.html" class="brand-link" aria-label="Home">
            <img src="assets/imp-logo.jpeg" alt="IMP logo" class="brand-logo">
          </a>
        </div>

        <div class="header-right">
          <nav class="header-nav"></nav>

          <div class="lang-toggle">
            <!-- زر لغة واحد بدل زرين -->
            <button class="lang-btn" id="langSwitch">
              <i class="fa-solid fa-language"></i>
              <span class="lang-text">English</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const nav = header.querySelector(".header-nav");
    const langBtn = header.querySelector("#langSwitch");
    const langText = header.querySelector(".lang-text");

    function syncLangButton() {
      const cur = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
      langText.textContent = cur === "ar" ? "English" : "العربية";
    }

    langBtn.addEventListener("click", function () {
      const cur = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
      const next = cur === "ar" ? "en" : "ar";
      if (window.LA_I18N) window.LA_I18N.setLocale(next);
      syncLangButton();
    });

    if (mode === "public-home") {
      // زر Login صغير في الهيدر
      const loginLink = document.createElement("a");
      loginLink.href = "login.html";
      loginLink.className = "lang-btn header-login";
      loginLink.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Login</span>`;
      header.querySelector(".header-right")
            .insertBefore(loginLink, header.querySelector(".lang-toggle"));
    } else if (mode === "public-auth") {
      // لا شيء إضافي — شعار + زر لغة فقط
    } else if (mode === "private") {
      const chatLink = document.createElement("a");
      chatLink.href = "app.html";
      chatLink.className = "lang-btn header-link";
      chatLink.innerHTML = `<i class="fa-solid fa-comments"></i> <span>${
        document.documentElement.classList.contains("lang-ar") ? "الشات" : "Chat"
      }</span>`;

      const dashLink = document.createElement("a");
      dashLink.href = "dashboard.html";
      dashLink.className = "lang-btn header-link";
      dashLink.innerHTML = `<i class="fa-solid fa-chart-line"></i> <span>${
        document.documentElement.classList.contains("lang-ar") ? "لوحة التحكم" : "Dashboard"
      }</span>`;

      nav.appendChild(chatLink);
      nav.appendChild(dashLink);

      const logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "lang-btn header-logout";
      logoutBtn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i> <span>${
        document.documentElement.classList.contains("lang-ar") ? "تسجيل الخروج" : "Logout"
      }</span>`;
      logoutBtn.addEventListener("click", function () {
        if (window.LA_AUTH && typeof window.LA_AUTH.logout === "function") {
          window.LA_AUTH.logout();
        } else {
          window.location.href = "index.html";
        }
      });

      header.querySelector(".header-right")
            .insertBefore(logoutBtn, header.querySelector(".lang-toggle"));
    }

    syncLangButton();
    return header;
  }

  function initUnifiedHeader() {
    const body = document.body;
    const mode = body.getAttribute("data-header") || "public-home";

    // لو لسه كتلة الهيدر القديمة موجودة في الصفحة، منفضّل ما نضيفش واحد جديد
    if (document.querySelector(".chat-header")) return;

    const header = buildLegacyHeader(mode);
    body.insertBefore(header, body.firstChild);

    if (mode === "public-auth") {
      const inCardBrand = document.querySelector(".auth-brand");
      if (inCardBrand) inCardBrand.style.display = "none";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    try { initUnifiedHeader(); } catch (e) { console.error("Header init error", e); }
  });
})();
