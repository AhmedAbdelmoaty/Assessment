(function () {
    "use strict";

    let currentLang = "en";

    // Initialize
    init();

    async function init() {
        // Authentication guard: Check if user is logged in
        try {
            const response = await fetch("/api/me");
            if (!response.ok) {
                // Not logged in, redirect to login
                window.location.href = "/login.html";
                return;
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            window.location.href = "/login.html";
            return;
        }

        // User is authenticated, proceed with setup
        setupLanguageToggle();
        setupLogout();
        loadDashboardData();
    }

    function setupLanguageToggle() {
        document.querySelectorAll(".lang-btn").forEach((btn) => {
            btn.addEventListener("click", function () {
                currentLang = this.getAttribute("data-lang");
                document
                    .querySelectorAll(".lang-btn")
                    .forEach((b) => b.classList.remove("active"));
                this.classList.add("active");

                document.documentElement.setAttribute("lang", currentLang);
                document.documentElement.classList.toggle("lang-ar", currentLang === "ar");
                document.documentElement.classList.toggle("lang-en", currentLang !== "ar");

                document.querySelectorAll("[data-lang-content]").forEach((el) => {
                    el.classList.toggle(
                        "hidden",
                        el.getAttribute("data-lang-content") !== currentLang,
                    );
                });
            });
        });
    }

    function setupLogout() {
        document.getElementById("logoutBtn").addEventListener("click", async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/";
            } catch (error) {
                console.error("Logout failed:", error);
            }
        });
    }

    async function loadDashboardData() {
        await Promise.all([
            loadProfile(),
            loadAssessments(),
            loadExplanations(),
        ]);
    }

    async function loadProfile() {
        try {
            const response = await fetch("/api/me");
            if (!response.ok) {
                window.location.href = "/login.html";
                return;
            }
            const data = await response.json();

            document.getElementById("infoName").textContent = data.name || "-";
            document.getElementById("infoEmail").textContent = data.email || "-";
            document.getElementById("infoUsername").textContent = data.username || "-";
            document.getElementById("infoPhone").textContent = data.phone || "-";
        } catch (error) {
            console.error("Failed to load profile:", error);
        }
    }

    async function loadAssessments() {
        try {
            const response = await fetch("/api/me/assessments");
            const assessments = await response.json();

            const container = document.getElementById("assessmentsList");
            if (assessments.length === 0) {
                container.innerHTML = `<div class="empty-state">
                    <i class="fas fa-clipboard-list" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p data-lang-content="en">No assessments yet</p>
                    <p class="hidden" data-lang-content="ar">لا توجد تقييمات بعد</p>
                </div>`;
                return;
            }

            container.innerHTML = assessments
                .map(
                    (a) => `
                <div class="assessment-item">
                    <div class="assessment-header">
                        <span><strong>${new Date(a.startedAt).toLocaleDateString()}</strong></span>
                        <span><strong>${a.scorePercent || 0}%</strong></span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${a.scorePercent || 0}%"></div>
                    </div>
                </div>
            `,
                )
                .join("");
        } catch (error) {
            console.error("Failed to load assessments:", error);
        }
    }

    async function loadExplanations() {
        try {
            const response = await fetch("/api/me/explanations");
            const explanations = await response.json();

            const container = document.getElementById("explanationsList");
            if (explanations.length === 0) {
                container.innerHTML = `<div class="empty-state">
                    <i class="fas fa-book-open" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p data-lang-content="en">No explanations yet</p>
                    <p class="hidden" data-lang-content="ar">لا توجد شروحات بعد</p>
                </div>`;
                return;
            }

            container.innerHTML = explanations
                .slice(0, 5)
                .map(
                    (e) => `
                <div class="assessment-item">
                    <strong>${e.topic || "Learning Topic"}</strong>
                    <p style="margin-top: 8px; color: var(--muted-foreground);">${e.content.slice(0, 100)}...</p>
                </div>
            `,
                )
                .join("");
        } catch (error) {
            console.error("Failed to load explanations:", error);
        }
    }
})();
