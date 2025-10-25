    (function () {
        "use strict";

        // =========================
        // State management
        // =========================
        let currentLang = "en";
        let sessionId = null;
        let currentStep = "intake";
        let currentMCQ = null;
        let isProcessing = false;
        let awaitingCustomInput = false;
        let teachingActive = false;
        let bootstrapped = false;       // prevent double init on load
        let isRehydrating = false;      // prevent double tracking during rebuild

        // =========================
        // DOM elements
        // =========================
        const langButtons = document.querySelectorAll(".lang-btn");
        const html = document.documentElement;
        const chatMessages = document.getElementById("chatMessages");
        const chatInput = document.getElementById("chatInput");
        const sendBtn = document.getElementById("sendBtn");
        const headerLogoutBtn = document.getElementById("headerLogoutBtn");

        // =========================
        // SINGLE bootstrap only
        // =========================
        document.addEventListener("DOMContentLoaded", async () => {
            if (bootstrapped) return;
            bootstrapped = true;
            await init();
        });

        // =========================
        // Init
        // =========================
        async function init() {
            // Authentication guard: Check if user is logged in
            try {
                const response = await fetch("/api/me");
                if (!response.ok) {
                    window.location.href = "/login.html";
                    return;
                }
            } catch (error) {
                console.error("Auth check failed:", error);
                window.location.href = "/login.html";
                return;
            }

            // language boot
            if (window.HeaderUtils) {
                HeaderUtils.initHeaderLanguageSwitch('#lang-switch');
                currentLang = HeaderUtils.getCurrentLang();
            }

            setupSendButton();
            setupInputHandlers();
            setupLogout();

            // Resume UI from server state (no greetings, no restart)
            await checkSessionState();
        }

        // =========================
        // Rehydrate state from server
        // =========================
        async function checkSessionState() {
            try {
                const resp = await fetch("/api/chat/state");
                const data = await resp.json();
                if (!data || !data.ok) throw new Error("bad state");

                sessionId = data.sessionId;
                currentStep = data.phase || "intake";
                teachingActive = currentStep === "teaching";

                const list = Array.isArray(data.transcript) ? data.transcript : [];
                rehydrateTranscript(list);
            } catch (e) {
                console.error("Error loading chat state:", e);
                // Fallback to intake (first-time user)
                startIntakeFlow();
            }
        }

        // =========================
        // EXACT UI rehydration (no extra messages)
        // Filters out unwanted greetings on restore
        // =========================
        function rehydrateTranscript(items = []) {
            isRehydrating = true;
            try {
                chatMessages.innerHTML = "";

                // Known greetings we NEVER want to show on reload
                const GREETING_SNIPPETS = [
                    "Welcome back! We’ll start the assessment directly.",
                    "Welcome back! We'll start the assessment directly.",
                    "مرحبًا! هنبدأ أسئلة التقييم مباشرة.",
                    "مرحبا! هنبدأ أسئلة التقييم مباشرة."
                ];

                for (const m of items) {
                    if (!m || !m.text) continue;

                    // Skip greeting-like messages on reload
                    const txt = (m.text || "").trim();
                    const isGreeting =
                        GREETING_SNIPPETS.some(g => txt.startsWith(g));

                    if (isGreeting) {
                        // ignore greeting only during rehydrate (reload)
                        continue;
                    }

                    if (m.role === "user") {
                        addUserMessage(txt, /*track*/ false);
                    } else {
                        addSystemMessage(txt, /*track*/ false);
                    }
                }
            } finally {
                isRehydrating = false;
            }
        }

        // =========================
        // Language utils
        // =========================
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

            langButtons.forEach((btn) => {
                if (btn.getAttribute("data-lang") === lang) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });

            html.setAttribute("lang", lang === "ar" ? "ar" : "en");
            html.classList.toggle("lang-ar", lang === "ar");
            html.classList.toggle("lang-en", lang !== "ar");

            const allContent = document.querySelectorAll("[data-lang-content]");
            allContent.forEach((el) => {
                if (el.getAttribute("data-lang-content") === lang) {
                    el.classList.remove("hidden");
                } else {
                    el.classList.add("hidden");
                }
            });

            if (chatInput) {
                chatInput.placeholder =
                    lang === "ar"
                        ? chatInput.getAttribute("data-placeholder-ar")
                        : chatInput.getAttribute("data-placeholder-en");
            }
        }

        // =========================
        // Auth / logout
        // =========================
        function setupLogout() {
            headerLogoutBtn.addEventListener("click", async () => {
                try {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/";
                } catch (error) {
                    console.error("Logout failed:", error);
                }
            });
        }

        // =========================
        // Input & send
        // =========================
        function setupSendButton() {
            sendBtn.addEventListener("click", sendMessage);
        }

        function setupInputHandlers() {
            chatInput.addEventListener("keypress", function (e) {
                if (e.key === "Enter" && !isProcessing) {
                    sendMessage();
                }
            });

            document.addEventListener("click", function (e) {
                if (e.target.classList.contains("choice-chip") && !isProcessing) {
                    handleChoiceSelection(e.target);
                }
            });

            document.addEventListener("click", function (e) {
                if (e.target.closest(".mcq-choice") && !isProcessing) {
                    handleMCQSelection(e.target.closest(".mcq-choice"));
                }
            });

            document.addEventListener("click", function (e) {
                if (e.target.classList.contains("dropdown-item") && !isProcessing) {
                    handleDropdownSelection(e.target);
                }
            });

            document.addEventListener("click", function (e) {
                if (!e.target.closest(".dropdown-container")) {
                    const dropdowns = document.querySelectorAll(".dropdown-list");
                    dropdowns.forEach((dropdown) =>
                        dropdown.classList.remove("active"),
                    );
                }
            });
        }

        // =========================
        // Intake
        // =========================
        function removeInteractiveUI() {
            document
                .querySelectorAll(".choice-chips, .dropdown-container")
                .forEach((el) => el.remove());
        }

        function isOtherValue(txt) {
            const v = (txt || "").toString().trim().toLowerCase();
            return v === "other" || v === "أخرى" || v === "اخري" || v === "اخرى";
        }

        async function startIntakeFlow() {
            showTypingIndicator();
            try {
                const response = await fetch("/api/intake/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lang: currentLang }),
                });

                const data = await response.json();
                console.log("[CLIENT] Initial intake response:", data);

                sessionId = data.sessionId;
                hideTypingIndicator();

                if (data.done && data.skipIntake) {
                    if (data.message) addSystemMessage(data.message);
                    currentStep = "assessment";
                    updateProgress(1);
                    setTimeout(() => startAssessment(), 1000);
                    return;
                }

                renderIntakeStep(data);
            } catch (error) {
                console.error("Error starting intake:", error);
                hideTypingIndicator();
                addSystemMessage(
                    currentLang === "ar"
                        ? "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى."
                        : "Sorry, an error occurred. Please try again.",
                );
            }
        }

        async function sendMessage() {
            const message = chatInput.value.trim();
            if (!message || isProcessing) return;

            isProcessing = true;
            addUserMessage(message);
            chatInput.value = "";

            if (currentStep === "intake") {
                await handleIntakeAnswer(message);
            } else if (currentStep === "teaching" || teachingActive) {
                await sendTeachingMessage(message);
            }

            isProcessing = false;
        }

        async function handleIntakeAnswer(answer) {
            awaitingCustomInput = false;
            showTypingIndicator();

            try {
                const response = await fetch("/api/intake/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId,
                        lang: currentLang,
                        answer,
                    }),
                });

                const data = await response.json();
                console.log("[CLIENT] Intake response:", data);

                hideTypingIndicator();

                if (data.error) {
                    if (data.message) addSystemMessage(data.message);
                    return;
                }

                if (data.done) {
                    if (data.message) addSystemMessage(data.message);
                    currentStep = "assessment";
                    updateProgress(1);
                    setTimeout(() => startAssessment(), 1000);
                    return;
                }

                renderIntakeStep(data);
            } catch (error) {
                console.error("Error in intake:", error);
                hideTypingIndicator();
                addSystemMessage(
                    currentLang === "ar"
                        ? "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى."
                        : "Sorry, an error occurred. Please try again.",
                );
            }
        }

        async function renderIntakeStep(data) {
            removeInteractiveUI();
            if (!data.prompt) {
                console.error("[CLIENT] Missing prompt in intake step:", data);
                return;
            }

            addSystemMessage(data.prompt);

            if (data.autoNext) {
                showTypingIndicator();
                try {
                    const resp = await fetch("/api/intake/next", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            sessionId,
                            lang: currentLang,
                        }),
                    });
                    const nextData = await resp.json();
                    hideTypingIndicator();
                    renderIntakeStep(nextData);
                } catch (e) {
                    hideTypingIndicator();
                    console.error("Error fetching next step after opening:", e);
                }
                return;
            }

            if (data.type === "chips" && data.options) {
                addChoiceChips(data.options);
            } else if (data.type === "country" && data.options) {
                addDropdown(data.options);
            }
        }

        // =========================
        // MCQ Assessment
        // =========================
        async function handleChoiceSelection(chip) {
            const siblings = chip.parentElement.querySelectorAll(".choice-chip");
            siblings.forEach((c) => c.classList.remove("selected"));
            chip.classList.add("selected");

            const container = chip.closest(".choice-chips");
            if (container) container.remove();

            const choice = chip.textContent.trim();

            if (isOtherValue(choice) && currentStep === "intake") {
                awaitingCustomInput = true;
                addSystemMessage(
                    currentLang === "ar"
                        ? "اكتب اختيارك المناسب في الصندوق."
                        : "Type your specific answer in the box.",
                );
                chatInput.focus();
                return;
            }

            isProcessing = true;
            addUserMessage(choice);

            if (currentStep === "intake") {
                await handleIntakeAnswer(choice);
            }

            isProcessing = false;
        }

        async function handleMCQSelection(choice) {
            const siblings = choice.parentElement.querySelectorAll(".mcq-choice");
            siblings.forEach((c) => c.classList.remove("selected"));
            choice.classList.add("selected");

            isProcessing = true;
            const idx = parseInt(choice.getAttribute("data-idx"), 10);
            const choiceLabelOnly = (choice.querySelector("span")?.textContent || "").trim();

            addUserMessage(choiceLabelOnly);
            await submitMCQAnswer(idx);
            isProcessing = false;
        }

        async function handleDropdownSelection(item) {
            const country = item.getAttribute("data-country");
            const dropdown = item.parentElement;
            const search = dropdown.previousElementSibling;

            search.value = country;
            dropdown.classList.remove("active");

            const wrap = item.closest(".dropdown-container");
            if (wrap) wrap.remove();

            isProcessing = true;
            addUserMessage(country);

            if (currentStep === "intake") {
                await handleIntakeAnswer(country);
            }

            isProcessing = false;
        }

        async function startAssessment() {
            showTypingIndicator();

            try {
                const response = await fetch("/api/assess/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId }),
                });

                const mcq = await response.json();
                currentMCQ = mcq;

                hideTypingIndicator();
                addMCQQuestion(mcq);
            } catch (error) {
                console.error("Error getting assessment question:", error);
                hideTypingIndicator();
                addSystemMessage(
                    currentLang === "ar"
                        ? "عذراً، حدث خطأ في التقييم."
                        : "Sorry, an error occurred during assessment.",
                );
            }
        }

        async function submitMCQAnswer(userAnswer) {
            showTypingIndicator();

            try {
                const response = await fetch("/api/assess/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId,
                        userChoiceIndex: userAnswer,
                    }),
                });

                const result = await response.json();
                hideTypingIndicator();

                if (result.nextAction === "complete" || result.nextAction === "stop") {
                    currentStep = "report";
                    updateProgress(2);
                    setTimeout(() => generateReport(), 1000);
                } else {
                    setTimeout(() => startAssessment(), 800);
                }
            } catch (error) {
                console.error("Error submitting answer:", error);
                hideTypingIndicator();
                addSystemMessage(
                    currentLang === "ar"
                        ? "عذراً، حدث خطأ في معالجة الإجابة."
                        : "Sorry, an error occurred processing your answer.",
                );
            }
        }

        function addMCQQuestion(mcq) {
            const container = document.createElement("div");
            container.className = "mcq-container";

            const levelNames = {
                L1: currentLang === "ar" ? "المستوى الأول - الأساسيات" : "Level 1 - Foundations",
                L2: currentLang === "ar" ? "المستوى الثاني - التطبيق" : "Level 2 - Core Applied",
                L3: currentLang === "ar" ? "المستوى الثالث - المهني" : "Level 3 - Professional",
            };

            container.innerHTML = `
                <div class="mcq-header">
                    <span class="mcq-level">${levelNames[mcq.level]}</span>
                    <span class="mcq-number">${currentLang === "ar" ? `السؤال ${mcq.questionNumber} من ${mcq.totalQuestions}` : `Question ${mcq.questionNumber} of ${mcq.totalQuestions}`}</span>
                </div>
                <div class="mcq-question">${escapeHtml(mcq.prompt)}</div>
                <div class="mcq-choices">
    ${mcq.choices.map((choice, index) => `
      <div class="mcq-choice" data-idx="${index}">
        <div class="choice-letter">${String.fromCharCode(65 + index)}</div>
        <span>${escapeHtml(choice)}</span>
      </div>
    `).join("")}
                </div>
            `;

            const qEl = container.querySelector(".mcq-question");
            if (qEl) {
                qEl.setAttribute("dir", "auto");
                qEl.setAttribute("lang", currentLang === "ar" ? "ar" : "en");
            }
            container.querySelectorAll(".mcq-choice span").forEach((el) => {
                el.setAttribute("dir", "auto");
                el.setAttribute("lang", currentLang === "ar" ? "ar" : "en");
            });

            chatMessages.appendChild(container);
            scrollToBottom();
        }

        // =========================
        // Report & Teaching
        // =========================
        async function generateReport() {
            showTypingIndicator();

            try {
                const response = await fetch("/api/report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId }),
                });

                const report = await response.json();
                hideTypingIndicator();

                if (report && typeof report.message === "string" && report.message.trim()) {
                    addSystemMessage(report.message.trim());
                    addStartTeachingCTA();
                    showFloatingButton();
                }

                const strengthsToShow =
                    Array.isArray(report.strengths_display) && report.strengths_display.length
                        ? report.strengths_display
                        : report.strengths;

                const gapsToShow =
                    Array.isArray(report.gaps_display) && report.gaps_display.length
                        ? report.gaps_display
                        : report.gaps;

                const uiReport = { ...report, strengths: strengthsToShow, gaps: gapsToShow };
                updateProgress(2, true);
            } catch (error) {
                console.error("Error generating report:", error);
                hideTypingIndicator();
                addSystemMessage(
                    currentLang === "ar"
                        ? "عذراً، حدث خطأ في إنشاء التقرير."
                        : "Sorry, an error occurred generating your report.",
                );
            }
        }

        async function sendTeachingMessage(text) {
            showTypingIndicator();
            try {
                const resp = await fetch("/api/teach/message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId, text: text }),
                });
                const data = await resp.json();
                hideTypingIndicator();

                if (data && data.message) {
                    addSystemMessage(data.message);
                    addSaveTeachingButton(); // (سيتم إزالته في المرحلة 3 حسب المطلوب النهائي)
                } else {
                    addSystemMessage(currentLang === "ar" ? "تمام، نكمل." : "Alright, let's continue.");
                }
            } catch (e) {
                hideTypingIndicator();
                addSystemMessage(currentLang === "ar" ? "حصلت مشكلة في الشرح." : "There was a problem during teaching.");
            }
        }

        function addStartTeachingCTA() {
            document.querySelectorAll(".teaching-cta").forEach((el) => el.remove());

            const bubbles = Array.from(document.querySelectorAll(".message-bubble.system"));
            const last = bubbles[bubbles.length - 1];
            if (!last) return;

            const content = last.querySelector(".message-content");
            if (!content) return;

            const wrap = document.createElement("div");
            wrap.className = "teaching-cta";

            const explainBtn = document.createElement("button");
            explainBtn.className = "teach-cta-btn primary";
            explainBtn.textContent = currentLang === "ar" ? "ابدأ الشرح" : "Start Explanation";

            explainBtn.addEventListener("click", async () => {
                explainBtn.disabled = true;
                showTypingIndicator();
                try {
                    const resp = await fetch("/api/teach/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId }),
                    });
                    const data = await resp.json();
                    hideTypingIndicator();

                    teachingActive = true;
                    currentStep = "teaching";
                    wrap.remove();

                    if (data && data.message) {
                        addSystemMessage(data.message);
                    } else {
                        addSystemMessage(currentLang === "ar" ? "بدأنا الشرح." : "Teaching started.");
                    }
                } catch (e) {
                    hideTypingIndicator();
                    explainBtn.disabled = false;
                    addSystemMessage(currentLang === "ar" ? "تعذّر بدء الشرح." : "Failed to start teaching.");
                }
            });

            wrap.appendChild(explainBtn);
            content.appendChild(wrap);
        }

        // =========================
        // UI helpers
        // =========================
        function normalizeTutorText(raw) {
            let t = (raw ?? "").toString();
            t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            t = t.replace(/^[ \t]*-{3,}[ \t]*$/gm, '---');
            t = t.replace(/\n*\s*---\s*\n*/g, '\n---\n');
            t = t.replace(/\n{3,}/g, '\n\n');
            t = t.trim();
            return t;
        }

        function formatTutorMessage(text) {
            const normalized = normalizeTutorText(text || "");
            const safe = escapeHtml(normalized);
            let html = safe
                .replace(/^####\s+(.+)$/gm, '<div class="rt-h3">$1</div>')
                .replace(/^###\s+(.+)$/gm, '<div class="msg-h3" dir="auto">$1</div>')
                .replace(/^##\s+(.+)$/gm, '<div class="msg-h2" dir="auto">$1</div>');
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            return html;
        }

        function addUserMessage(text, track = true) {
            const bubble = document.createElement("div");
            bubble.className = "message-bubble user";
            bubble.innerHTML = `
                <div class="message-content">${escapeHtml(text)}</div>
                <div class="message-avatar">
                    <i class="fas fa-user"></i>
                </div>
            `;
            chatMessages.appendChild(bubble);
            scrollToBottom();

            if (track && !isRehydrating && sessionId) {
                try {
                    fetch("/api/chat/track", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role: "user", text, sessionId })
                    });
                } catch {}
            }
        }

        function addSystemMessage(text, track = true) {
            if (!text) {
                console.error("[CLIENT] Attempted to render blank bot message");
                return;
            }
            const bubble = document.createElement("div");
            bubble.className = "message-bubble system";
            bubble.innerHTML = `
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">${formatTutorMessage(text)}</div>
            `;
            chatMessages.appendChild(bubble);
            scrollToBottom();

            if (track && !isRehydrating && sessionId) {
                try {
                    fetch("/api/chat/track", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role: "assistant", text, sessionId })
                    });
                } catch {}
            }
        }

        function addChoiceChips(choices) {
            const container = document.createElement("div");
            container.className = "choice-chips";

            choices.forEach((choice) => {
                const chip = document.createElement("div");
                chip.className = "choice-chip";
                chip.textContent = choice;
                container.appendChild(chip);
            });

            chatMessages.appendChild(container);
            scrollToBottom();
        }

        function addDropdown(countries) {
            const container = document.createElement("div");
            container.className = "dropdown-container";

            const searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.className = "dropdown-search";
            searchInput.placeholder =
                currentLang === "ar" ? "ابحث عن دولة..." : "Search countries...";

            const dropdownList = document.createElement("div");
            dropdownList.className = "dropdown-list";

            countries.forEach((country) => {
                const item = document.createElement("div");
                item.className = "dropdown-item";
                item.setAttribute("data-country", country);
                item.textContent = country;
                dropdownList.appendChild(item);
            });

            searchInput.addEventListener("focus", () => {
                dropdownList.classList.add("active");
            });

            searchInput.addEventListener("input", function () {
                const searchTerm = this.value.toLowerCase();
                const items = dropdownList.querySelectorAll(".dropdown-item");

                items.forEach((item) => {
                    const country = item.getAttribute("data-country").toLowerCase();
                    if (country.includes(searchTerm)) {
                        item.style.display = "block";
                    } else {
                        item.style.display = "none";
                    }
                });
            });

            container.appendChild(searchInput);
            container.appendChild(dropdownList);
            chatMessages.appendChild(container);
            scrollToBottom();
        }

        function addSaveTeachingButton() {
            // NOTE: will be removed in Phase 3 (kept now to avoid breaking anything else)
            document.querySelectorAll(".save-teaching-btn-container").forEach((el) => el.remove());

            const bubbles = Array.from(document.querySelectorAll(".message-bubble.system"));
            const last = bubbles[bubbles.length - 1];
            if (!last) return;

            const content = last.querySelector(".message-content");
            if (!content) return;

            const container = document.createElement("div");
            container.className = "save-teaching-btn-container";

            const saveBtn = document.createElement("button");
            saveBtn.className = "save-teaching-btn";
            saveBtn.textContent = currentLang === "ar" ? "إنهاء الدرس وحفظه" : "End Lesson & Save";

            saveBtn.addEventListener("click", async () => {
                saveBtn.disabled = true;
                try {
                    const resp = await fetch("/api/teach/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId }),
                    });
                    const data = await resp.json();

                    if (data.ok) {
                        teachingActive = false;
                        currentStep = "report";
                        addSystemMessage(
                            data.message || (currentLang === "ar" ? "تم حفظ الدرس بنجاح!" : "Lesson saved successfully!")
                        );
                        container.remove();
                        addStartTeachingCTA();
                    } else {
                        saveBtn.disabled = false;
                        addSystemMessage(
                            data.message || (currentLang === "ar" ? "فشل حفظ الدرس" : "Failed to save lesson")
                        );
                    }
                } catch (e) {
                    saveBtn.disabled = false;
                    addSystemMessage(
                        currentLang === "ar" ? "حدث خطأ أثناء حفظ الدرس" : "An error occurred while saving the lesson"
                    );
                }
            });

            container.appendChild(saveBtn);
            content.appendChild(container);
        }

        function showTypingIndicator() {
            const bubble = document.createElement("div");
            bubble.className = "message-bubble system typing-indicator-bubble";
            bubble.innerHTML = `
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            chatMessages.appendChild(bubble);
            scrollToBottom();
        }

        function hideTypingIndicator() {
            const indicator = document.querySelector(".typing-indicator-bubble");
            if (indicator) indicator.remove();
        }

        function updateProgress(step, completed = false) {
            const steps = document.querySelectorAll(".progress-step");
            const progressFill = document.querySelector(".progress-fill");

            steps.forEach((s, index) => {
                if (index < step) {
                    s.classList.add("completed");
                    s.classList.remove("active");
                } else if (index === step) {
                    s.classList.add("active");
                    s.classList.remove("completed");
                    if (completed) {
                        s.classList.add("completed");
                        s.classList.remove("active");
                    }
                } else {
                    s.classList.remove("active", "completed");
                }
            });

            const progress = (step / (steps.length - 1)) * 100;
            progressFill.style.width = progress + "%";
            if (completed) progressFill.style.width = "100%";
        }

        function scrollToBottom() {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML;
        }

        // ==========================================
        // Floating New Assessment Button Logic
        // ==========================================
        const floatingBtn = document.getElementById("floatingNewAssessmentBtn");

        function showFloatingButton() {
            if (floatingBtn) floatingBtn.style.display = "inline-flex";
        }

        function hideFloatingButton() {
            if (floatingBtn) floatingBtn.style.display = "none";
        }

        if (floatingBtn) {
            floatingBtn.addEventListener("click", async () => {
                if (teachingActive) {
                    const confirmMsg = currentLang === "ar"
                        ? "سيتم حفظ الشرح الحالي. هل تريد البدء بتقييم جديد؟"
                        : "The current explanation will be saved. Start a new assessment?";
                    if (!confirm(confirmMsg)) return;

                    try {
                        await fetch("/api/teach/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sessionId, autoSave: true }),
                        });
                    } catch (e) {
                        console.error("Error auto-saving teaching:", e);
                    }
                }

                chatMessages.innerHTML = "";
                currentStep = "assessment";
                teachingActive = false;
                hideFloatingButton();

                addSystemMessage(currentLang === "ar" ? "جاري بدء تقييم جديد..." : "Starting a new assessment...");
                setTimeout(() => startAssessment(), 800);
            });
        }
    })();
