(function () {
    "use strict";

    // State management
    let currentLang = "en";
    let currentSection = "landing";
    let sessionId = null;
    let currentStep = "intake";
    let currentMCQ = null;
    let isProcessing = false;
    let awaitingCustomInput = false;
    let teachingActive = false; // وضع الشرح شغال/لأ
    function removeInteractiveUI() {
        // يشيل أي اختيارات ظاهرة قبل الانتقال للسؤال التالي
        document
            .querySelectorAll(".choice-chips, .dropdown-container")
            .forEach((el) => el.remove());
    }

    function isOtherValue(txt) {
        const v = (txt || "").toString().trim().toLowerCase();
        return v === "other" || v === "أخرى" || v === "اخري" || v === "اخرى";
    }

    // DOM elements
    const langButtons = document.querySelectorAll(".lang-btn");
    const html = document.documentElement;
    const startBtn = document.getElementById("startBtn");
    const landingSection = document.getElementById("landingSection");
    const chatSection = document.getElementById("chatSection");
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    function setSessionId(id) {
        if (!id) return;
        sessionId = id;
        try {
            localStorage.setItem("chatSessionId", id);
        } catch (e) {
            console.warn("Failed to persist sessionId", e);
        }
    }

    function getStoredSessionId() {
        try {
            return localStorage.getItem("chatSessionId");
        } catch (e) {
            return null;
        }
    }

    function parsePersistedContent(raw) {
        if (typeof raw !== "string") return { _type: "text", text: "" };
        try {
            const obj = JSON.parse(raw);
            if (obj && obj._type) return obj;
        } catch (_) {
            // plain text
        }
        return { _type: "text", text: raw };
    }

    function renderPersistedMessages(messages) {
        (messages || []).forEach((m) => {
            const parsed = parsePersistedContent(m?.content || "");
            if (parsed._type === "mcq" && parsed.payload) {
                currentMCQ = parsed.payload;
                addMCQQuestion(parsed.payload);
                return;
            }

            const txt = (parsed.text || "").toString();
            if (!txt) return;
            if ((m?.sender || "") === "user") addUserMessage(txt);
            else addSystemMessage(txt);
        });

        const mcqs = chatMessages.querySelectorAll(".mcq-container");
        mcqs.forEach((el, idx) => {
            if (idx !== mcqs.length - 1) {
                el.classList.add("mcq-locked");
            }
        });
    }

    function renderPendingIntakeInteraction(step) {
        if (!step) return;
        removeInteractiveUI();
        if (step.autoNext) {
            (async () => {
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
                } catch (err) {
                    hideTypingIndicator();
                    console.error("Failed to auto-advance intake", err);
                }
            })();
            return;
        }
        if (step.type === "chips" && step.options) {
            addChoiceChips(step.options);
        } else if (step.type === "country" && step.options) {
            addDropdown(step.options);
        }
    }

    function applyStateFromServer(state) {
        if (!state) return;
        if (state.sessionId) setSessionId(state.sessionId);
        currentStep = state.currentStep || currentStep;
        if (state.lang) {
            currentLang = state.lang;
            switchLanguage(currentLang);
        }

        if (currentStep === "intake") {
            if (state.pendingIntakeStep) {
                renderPendingIntakeInteraction(state.pendingIntakeStep);
            } else if (!chatMessages.children.length) {
                startIntakeFlow();
            }
            return;
        }

        if (currentStep === "assessment" && state.assessment?.currentQuestion) {
            if (!chatMessages.querySelector(".mcq-container")) {
                currentMCQ = state.assessment.currentQuestion;
                addMCQQuestion(currentMCQ);
            }
            return;
        }

        if (currentStep === "assessment" && state.assessment?.awaitingNextQuestion) {
            if (!isProcessing) {
                startAssessment();
            }
            return;
        }

        if (currentStep === "report" && state.report?.message) {
            if (!chatMessages.textContent.includes(state.report.message)) {
                addSystemMessage(state.report.message);
            }
            currentStep = "report";
            chatMessages.querySelectorAll(".mcq-container").forEach((el) => el.classList.add("mcq-locked"));
            return;
        }

        if (currentStep === "teaching") {
            teachingActive = true;
        }

        if (currentStep !== "assessment") {
            chatMessages.querySelectorAll(".mcq-container").forEach((el) => el.classList.add("mcq-locked"));
        }
    }

    // === AUTH GUARD + LOAD PERSISTED CHAT ===
    async function authGuardAndLoad() {
        try {
            const meResp = await fetch("/api/auth/me");
            if (!meResp.ok) {
                window.location.href = "/login.html";
                return false;
            }
            const me = await meResp.json();
            const langFromProfile = me?.user?.locale;
            if (window.LA_I18N && langFromProfile) {
                window.LA_I18N.setLocale(langFromProfile);
            }
            if (langFromProfile) {
                currentLang = langFromProfile;
                switchLanguage(currentLang);
            }
        } catch (err) {
            window.location.href = "/login.html";
            return false;
        }

        try {
            const chatResp = await fetch("/api/chat/current");
            if (chatResp.ok) {
                const data = await chatResp.json();
                if (data.session?.id) setSessionId(data.session.id);
                if (Array.isArray(data.messages)) {
                    renderPersistedMessages(data.messages);
                }
                applyStateFromServer(data.state);
            }
        } catch (e) {
            console.warn("Failed to load persisted chat:", e);
        }

        return true;
    }


    // Initialize
    (async function init() {
      // 0) حماية الصفحة + تحميل الرسائل (لو فشل → هيحوّل لـ login.html)
      const ok = await authGuardAndLoad();
      if (!ok) return;

      // 1) لغة/أزرار عامة
      setupLanguageToggle();
      setupSendButton();
      setupInputHandlers();

      // 2) لو الصفحة فيها Landing + زر Start (زي index.html القديمة) فعّل الزر
      if (startBtn && landingSection) {
        setupStartButton();
        return; // في الحالة دي هنستنى الضغط على Start
      }

      // 3) أما في app.html (لا يوجد landing/start) → شغّل الشات فورًا
      if (chatSection) chatSection.classList.add("active");
      currentSection = "chat";
      updateProgress(0);

      // لو ما فيش رسائل ولسه في مرحلة الـ intake نبدأ التدفق
      if (!chatMessages.children.length && currentStep === "intake") {
        startIntakeFlow();
      }
    })();

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

        // Keep layout LTR always; just switch language attribute and helper class
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

        // Update input placeholder
        if (chatInput) {
            chatInput.placeholder =
                lang === "ar"
                    ? chatInput.getAttribute("data-placeholder-ar")
                    : chatInput.getAttribute("data-placeholder-en");
        }
    }

    function setupStartButton() {
      if (!startBtn) return;
      startBtn.addEventListener("click", function() {
        landingSection && (landingSection.style.display = "none");
        chatSection && chatSection.classList.add("active");
        currentSection = "chat";
        updateProgress(0);
        startIntakeFlow();
      });
    }


    function setupSendButton() {
        sendBtn.addEventListener("click", sendMessage);
    }

    function setupInputHandlers() {
        chatInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter" && !isProcessing) {
                sendMessage();
            }
        });

        // Choice chips delegation
        document.addEventListener("click", function (e) {
            if (e.target.classList.contains("choice-chip") && !isProcessing) {
                handleChoiceSelection(e.target);
            }
        });

        // MCQ choice delegation
        document.addEventListener("click", function (e) {
            if (e.target.closest(".mcq-choice") && !isProcessing) {
                handleMCQSelection(e.target.closest(".mcq-choice"));
            }
        });

        // Dropdown delegation
        document.addEventListener("click", function (e) {
            if (e.target.classList.contains("dropdown-item") && !isProcessing) {
                handleDropdownSelection(e.target);
            }
        });

        // Close dropdown on outside click
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".dropdown-container")) {
                const dropdowns = document.querySelectorAll(".dropdown-list");
                dropdowns.forEach((dropdown) =>
                    dropdown.classList.remove("active"),
                );
            }
        });
    }

    async function startIntakeFlow() {
        showTypingIndicator();
        try {
            const existingSession = sessionId || getStoredSessionId();
            const response = await fetch("/api/intake/next", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lang: currentLang,
                    sessionId: existingSession || undefined,
                }),
            });

            const data = await response.json();
            console.log("[CLIENT] Initial intake response:", data);

            if (data.sessionId) setSessionId(data.sessionId);
            hideTypingIndicator();

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
            if (data.sessionId) setSessionId(data.sessionId);

            hideTypingIndicator();

            // Handle validation error
            if (data.error) {
                if (data.message) {
                    addSystemMessage(data.message);
                } else {
                    console.error(
                        "[CLIENT] Error response missing message:",
                        data,
                    );
                }
                return;
            }

            // Handle completion
            if (data.done) {
                if (data.message) {
                    addSystemMessage(data.message);
                }
                currentStep = "assessment";
                updateProgress(1);
                setTimeout(() => startAssessment(), 1000);
                return;
            }

            // Render next step
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
        // Validate prompt exists
        if (!data.prompt) {
            console.error("[CLIENT] Missing prompt in intake step:", data);
            return;
        }

        // Show prompt message
        addSystemMessage(data.prompt);
        // لو الرسالة افتتاحية فقط، نطلب الخطوة التالية فورًا (بدون انتظار إدخال)
        if (data.autoNext) {
            // استدعاء فوري للخطوة التالية بنفس الجلسة
            showTypingIndicator();
            try {
                const resp = await fetch("/api/intake/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId, // نفس الجلسة اللي رجعت مع الافتتاحية
                        lang: currentLang, // اللغة الحالية
                    }),
                });
                const nextData = await resp.json();
                hideTypingIndicator();
                renderIntakeStep(nextData); // نعرض سؤال الاسم كرسالة منفصلة
            } catch (e) {
                hideTypingIndicator();
                console.error("Error fetching next step after opening:", e);
            }
            return; // ننهي هنا لأننا هنكمّل بعرض الخطوة التالية
        }

        // Render input based on type
        if (data.type === "chips" && data.options) {
            addChoiceChips(data.options);
        } else if (data.type === "country" && data.options) {
            addDropdown(data.options);
        }
        // For 'text' type, user will use the default input box
    }

    async function handleChoiceSelection(chip) {
        // إشعار بصري على الاختيار
        const siblings = chip.parentElement.querySelectorAll(".choice-chip");
        siblings.forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");

        // أخفِ قائمة الاختيارات فورًا
        const container = chip.closest(".choice-chips");
        if (container) container.remove();

        const choice = chip.textContent.trim();

        // لو "Other/أخرى": ما نبعتش للخادم الآن
        if (isOtherValue(choice) && currentStep === "intake") {
            awaitingCustomInput = true;
            // رسالة إرشادية قصيرة حسب اللغة
            addSystemMessage(
                currentLang === "ar"
                    ? "اكتب اختيارك المناسب في الصندوق."
                    : "Type your specific answer in the box.",
            );
            chatInput.focus();
            return; // ننتظر إدخال المستخدم النصّي
        }

        // غير ذلك: نكمّل عادي
        isProcessing = true;
        addUserMessage(choice);

        if (currentStep === "intake") {
            await handleIntakeAnswer(choice);
        }

        isProcessing = false;
    }

    async function handleMCQSelection(choice) {
        const container = choice.closest(".mcq-container");
        if (container && container.classList.contains("mcq-locked")) return;
        // Visual feedback
        const siblings = choice.parentElement.querySelectorAll(".mcq-choice");
        siblings.forEach((c) => c.classList.remove("selected"));
        choice.classList.add("selected");

        isProcessing = true;
        const idx = parseInt(choice.getAttribute("data-idx"), 10);
        const choiceLabelOnly = (
            choice.querySelector("span")?.textContent || ""
        ).trim();

        // اللي يظهر للمستخدم في فقاعة الشات = نص الاختيار فقط (بدون A/B)
        addUserMessage(choiceLabelOnly);

        // اللي يتبعت للسيرفر = فهرس الاختيار فقط (رقم)
        await submitMCQAnswer(idx);
        isProcessing = false;
    }

    async function handleDropdownSelection(item) {
        const country = item.getAttribute("data-country");
        const dropdown = item.parentElement;
        const search = dropdown.previousElementSibling;

        // عيّن القيمة وأغلق القائمة
        search.value = country;
        dropdown.classList.remove("active");

        // اخفِ حاوية القائمة بالكامل فورًا
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
        // ملاحظة: الآن userAnswer هو فهرس الاختيار (رقم 0..N)،
        // وليس نص الاختيار.

        showTypingIndicator();

        try {
            const response = await fetch("/api/assess/answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    userChoiceIndex: userAnswer, // ← نبعت الفهرس فقط
                }),
            });

            const result = await response.json();
            hideTypingIndicator();

            // لا نعرض "صح/غلط" للمستخدم؛ فقط نكمل التدفق
            if (result.nextAction === "complete") {
                currentStep = "report";
                updateProgress(2);
                setTimeout(() => generateReport(), 1000);
            } else if (result.nextAction === "stop") {
                currentStep = "report";
                updateProgress(2);
                setTimeout(() => generateReport(), 1000);
            } else {
                // سؤال تالي
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

            // 1) اعرض الفقرة السردية (لو موجودة) كرسالة من المساعد
            if (
                report &&
                typeof report.message === "string" &&
                report.message.trim()
            ) {
                addSystemMessage(report.message.trim());
                addStartTeachingCTA();
            }

            // 2) اختَر الأسماء البشرية إن كانت موجودة؛ وإلا ارجع للأكواد كـ fallback
            const strengthsToShow =
                Array.isArray(report.strengths_display) &&
                report.strengths_display.length
                    ? report.strengths_display
                    : report.strengths;

            const gapsToShow =
                Array.isArray(report.gaps_display) && report.gaps_display.length
                    ? report.gaps_display
                    : report.gaps;

            // 3) مرّر نسخة محسّنة إلى addFinalReport بدون تعديل الدالة الأصلية
            const uiReport = {
                ...report,
                strengths: strengthsToShow,
                gaps: gapsToShow,
            };

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
            } else {
                addSystemMessage(
                    currentLang === "ar"
                        ? "تمام، نكمل."
                        : "Alright, let’s continue.",
                );
            }
        } catch (e) {
            hideTypingIndicator();
            addSystemMessage(
                currentLang === "ar"
                    ? "حصلت مشكلة في الشرح."
                    : "There was a problem during teaching.",
            );
        }
    }

    // UI helper functions
    // --- Normalize tutor text: collapse blank lines & enforce '---' as single divider ---
    function normalizeTutorText(raw) {
        let t = (raw ?? "").toString();

        // 1) Normalize line endings
        t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // 2) Standardize any dash-only divider lines to exactly '---'
        //    (lines made only of dashes/spaces -> '---')
        t = t.replace(/^[ \t]*-{3,}[ \t]*$/gm, '---');

        // 3) Ensure '---' is the ONLY separator: no extra blank lines before/after
        //    Any amount of newlines/spaces around '---' => exactly '\n---\n'
        t = t.replace(/\n*\s*---\s*\n*/g, '\n---\n');

        // 4) Collapse 3+ consecutive newlines anywhere to just 2 (i.e., one blank line)
        t = t.replace(/\n{3,}/g, '\n\n');

        // 5) Trim edges (and also remove extra leading/trailing blank lines)
        t = t.trim();

        return t;
    }

    // === Markdown-lite formatter for tutor messages (safe) ===
    // Supports only: ### heading, ## heading, and **bold**. Everything else stays escaped/plain.
    function formatTutorMessage(text) {
        // 0) normalize paragraph spacing & '---' divider BEFORE escaping
        const normalized = normalizeTutorText(text || "");

        // 1) escape all HTML coming from the model (safety first)
        const safe = escapeHtml(normalized);

        // 2) headings first (match per-line)
        //    - handle #### before ### to avoid double-processing (kept as in original)
        let html = safe
           .replace(/^####\s+(.+)$/gm, '<div class="rt-h3">$1</div>')
           .replace(/^###\s+(.+)$/gm, '<div class="msg-h3" dir="auto">$1</div>')
           .replace(/^##\s+(.+)$/gm, '<div class="msg-h2" dir="auto">$1</div>');

        // 3) bold (**...**) — non-greedy
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        return html;
    }
    function addUserMessage(text) {
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
    }

    function addSystemMessage(text) {
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

    function addMCQQuestion(mcq) {
        const container = document.createElement("div");
        container.className = "mcq-container";

        const levelNames = {
            L1:
                currentLang === "ar"
                    ? "المستوى الأول - الأساسيات"
                    : "Level 1 - Foundations",
            L2:
                currentLang === "ar"
                    ? "المستوى الثاني - التطبيق"
                    : "Level 2 - Core Applied",
            L3:
                currentLang === "ar"
                    ? "المستوى الثالث - المهني"
                    : "Level 3 - Professional",
        };

        container.innerHTML = `
            <div class="mcq-header">
                <span class="mcq-level">${levelNames[mcq.level]}</span>
                <span class="mcq-number">${currentLang === "ar" ? `السؤال ${mcq.questionNumber} من ${mcq.totalQuestions}` : `Question ${mcq.questionNumber} of ${mcq.totalQuestions}`}</span>
            </div>
            <div class="mcq-question">${escapeHtml(mcq.prompt)}</div>
            <div class="mcq-choices">
${mcq.choices
    .map(
        (choice, index) => `
  <div class="mcq-choice" data-idx="${index}">
    <div class="choice-letter">${String.fromCharCode(65 + index)}</div>
    <span>${escapeHtml(choice)}</span>
  </div>
`,
    )
    .join("")}

            </div>
        `;
        // علّم عناصر النص بالاتجاه التلقائي واللغة الحالية
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

    function addFinalReport(report) {
        const container = document.createElement("div");
        container.className = "report-card";

        const levelClass = report.stats_level.toLowerCase();
        const levelText =
            currentLang === "ar"
                ? {
                      beginner: "مبتدئ",
                      intermediate: "متوسط",
                      advanced: "متقدم",
                  }[levelClass]
                : report.stats_level;

        const strengthsTitle =
            currentLang === "ar" ? "نقاط قوتك" : "Your Strengths";
        const gapsTitle =
            currentLang === "ar" ? "فرص النمو" : "Growth Opportunities";
        const resultsTitle =
            currentLang === "ar" ? "نتائج تقييمك" : "Your Assessment Results";

        container.innerHTML = `
            <div class="report-header">
                <div class="level-badge ${levelClass}">${levelText} ${currentLang === "ar" ? "المستوى" : "Level"}</div>
                <h2 class="report-title">${resultsTitle}</h2>
                <p class="report-message">${escapeHtml(report.message)}</p>
            </div>

            <div class="report-section">
                <div class="section-title">
                    <div class="section-icon strengths">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <span>${strengthsTitle}</span>
                </div>
                <div class="item-list">
                    ${report.strengths
                        .map(
                            (strength) => `
                        <div class="item">
                            <i class="fas fa-circle item-icon"></i>
                            <span>${escapeHtml(strength)}</span>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            </div>

            <div class="report-section">
                <div class="section-title">
                    <div class="section-icon gaps">
                        <i class="fas fa-lightbulb"></i>
                    </div>
                    <span>${gapsTitle}</span>
                </div>
                <div class="item-list">
                    ${report.gaps
                        .map(
                            (gap) => `
                        <div class="item">
                            <i class="fas fa-circle item-icon"></i>
                            <span>${escapeHtml(gap)}</span>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            </div>
        `;

        chatMessages.appendChild(container);
        scrollToBottom();
    }
    function addStartTeachingCTA() {
        // احذف أي CTA قديم علشان ما يتكرّرش
        document.querySelectorAll(".teaching-cta").forEach((el) => el.remove());

        // هانضيف الزر داخل محتوى آخر رسالة system (اللي فيها التقرير)
        const bubbles = Array.from(
            document.querySelectorAll(".message-bubble.system"),
        );
        const last = bubbles[bubbles.length - 1];
        if (!last) return;

        const content = last.querySelector(".message-content");
        if (!content) return;

        // الحاوية الجديدة (داخل فقاعة التقرير)
        const wrap = document.createElement("div");
        wrap.className = "teaching-cta"; // ستايل خاص بالزر

        const btn = document.createElement("button");
        btn.className = "teach-cta-btn";
        btn.textContent =
            currentLang === "ar" ? "ابدأ الشرح" : "Start explanation";

        btn.addEventListener("click", async () => {
            btn.disabled = true;
            showTypingIndicator();
            try {
                const resp = await fetch("/api/teach/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId }),
                });
                const data = await resp.json();
                hideTypingIndicator();
                btn.disabled = false;

                // فعّل وضع الشرح
                teachingActive = true;
                currentStep = "teaching";

                // رسالة الافتتاح
                if (data && data.message) {
                    addSystemMessage(data.message);
                } else {
                    addSystemMessage(
                        currentLang === "ar"
                            ? "بدأنا الشرح."
                            : "Teaching started.",
                    );
                }
            } catch (e) {
                hideTypingIndicator();
                btn.disabled = false;
                addSystemMessage(
                    currentLang === "ar"
                        ? "تعذّر بدء الشرح."
                        : "Failed to start teaching.",
                );
            }
        });

        wrap.appendChild(btn);
        content.appendChild(wrap); // <<< الأهم: جوّا message-content مش جنب الأفاتار
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
        if (indicator) {
            indicator.remove();
        }
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

        if (completed) {
            progressFill.style.width = "100%";
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
})();