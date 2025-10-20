(function () {
    "use strict";

    // State management
    let currentLang = "en";

    // DOM elements
    const langButtons = document.querySelectorAll(".lang-btn");
    const html = document.documentElement;

    // Initialize
    init();

    function init() {
        setupLanguageToggle();
        checkAuthState();
    }

    function setupLanguageToggle() {
        langButtons.forEach((btn) => {
            btn.addEventListener("click", function () {
                const lang = this.getAttribute("data-lang");
                switchLanguage(lang);
            });
        });
    }

    function switchLanguage(lang) {
        currentLang = lang;

        // Update button states
        langButtons.forEach((btn) => {
            if (btn.getAttribute("data-lang") === lang) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update language attribute and class
        html.setAttribute("lang", lang === "ar" ? "ar" : "en");
        html.classList.toggle("lang-ar", lang === "ar");
        html.classList.toggle("lang-en", lang !== "ar");

        // Toggle content visibility
        const allContent = document.querySelectorAll("[data-lang-content]");
        allContent.forEach((el) => {
            if (el.getAttribute("data-lang-content") === lang) {
                el.classList.remove("hidden");
            } else {
                el.classList.add("hidden");
            }
        });
    }

    // Check authentication state and update header
    async function checkAuthState() {
        try {
            const response = await fetch("/api/me");
            if (response.ok) {
                // User is logged in
                const authButtonsLoggedOut = document.getElementById("authButtonsLoggedOut");
                const userMenuLoggedIn = document.getElementById("userMenuLoggedIn");
                
                if (authButtonsLoggedOut) authButtonsLoggedOut.style.display = "none";
                if (userMenuLoggedIn) userMenuLoggedIn.style.display = "flex";
            } else {
                // User is logged out
                const authButtonsLoggedOut = document.getElementById("authButtonsLoggedOut");
                const userMenuLoggedIn = document.getElementById("userMenuLoggedIn");
                
                if (authButtonsLoggedOut) authButtonsLoggedOut.style.display = "flex";
                if (userMenuLoggedIn) userMenuLoggedIn.style.display = "none";
            }
        } catch (error) {
            // Assume logged out on error
            const authButtonsLoggedOut = document.getElementById("authButtonsLoggedOut");
            const userMenuLoggedIn = document.getElementById("userMenuLoggedIn");
            
            if (authButtonsLoggedOut) authButtonsLoggedOut.style.display = "flex";
            if (userMenuLoggedIn) userMenuLoggedIn.style.display = "none";
        }
    }

    // Handle logout from header
    const headerLogoutBtn = document.getElementById("headerLogoutBtn");
    if (headerLogoutBtn) {
        headerLogoutBtn.addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
            } catch (error) {
                console.error("Logout failed:", error);
            }
        });
    }
})();
