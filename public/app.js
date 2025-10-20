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

    // Initialize
    init();

    function init() {
        setupLanguageToggle();
        setupStartButton();
        setupSendButton();
        setupInputHandlers();
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
        startBtn.addEventListener("click", function () {
            landingSection.style.display = "none";
            chatSection.classList.add("active");
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
            const response = await fetch("/api/intake/next", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang: currentLang }),
            });

            const data = await response.json();
            console.log("[CLIENT] Initial intake response:", data);

            sessionId = data.sessionId;
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


    // ==================== AUTH UI FUNCTIONS ====================
    function addOTPInput(email, message, devMode) {
        removeInteractiveUI();
        addSystemMessage(message);
        
        const container = document.createElement("div");
        container.className = "auth-card";
        container.innerHTML = `
            <div class="auth-header">
                <i class="fas fa-envelope-open" style="font-size:24px;color:var(--maroon);"></i>
                <p style="margin:8px 0 0 0;font-size:14px;color:#666;">
                    ${currentLang === "ar" ? "أدخل الرمز المكون من 6 أرقام" : "Enter the 6-digit code"}
                </p>
            </div>
            <div class="otp-input-container">
                <input type="text" class="otp-input" maxlength="6" placeholder="000000" autocomplete="one-time-code" data-testid="input-otp" />
            </div>
            <button class="auth-submit-btn" id="verifyOtpBtn" data-testid="button-verify-otp">
                ${currentLang === "ar" ? "تحقق" : "Verify"}
            </button>
        `;
        
        chatMessages.appendChild(container);
        scrollToBottom();
        
        const input = container.querySelector(".otp-input");
        const btn = container.querySelector("#verifyOtpBtn");
        
        input.focus();
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && input.value.length === 6) {
                btn.click();
            }
        });
        
        btn.addEventListener("click", async () => {
            const code = input.value.trim();
            if (code.length !== 6) {
                alert(currentLang === "ar" ? "الرمز يجب أن يكون 6 أرقام" : "Code must be 6 digits");
                return;
            }
            
            btn.disabled = true;
            btn.textContent = currentLang === "ar" ? "جاري التحقق..." : "Verifying...";
            
            try {
                const res = await fetch("/api/auth/otp/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code })
                });
                
                const data = await res.json();
                
                if (!data.success) {
                    btn.disabled = false;
                    btn.textContent = currentLang === "ar" ? "تحقق" : "Verify";
                    alert(data.error || (currentLang === "ar" ? "رمز خاطئ" : "Invalid code"));
                    return;
                }
                
                container.remove();
                addSystemMessage(data.message);
                
                if (data.needsPassword) {
                    setTimeout(() => addPasswordInput(), 500);
                } else {
                    setTimeout(() => startAssessment(), 1000);
                }
            } catch (err) {
                console.error("OTP verify error:", err);
                btn.disabled = false;
                btn.textContent = currentLang === "ar" ? "تحقق" : "Verify";
                alert(currentLang === "ar" ? "حدث خطأ" : "An error occurred");
            }
        });
    }

    function addPasswordInput() {
        removeInteractiveUI();
        
        const container = document.createElement("div");
        container.className = "auth-card";
        container.innerHTML = `
            <div class="auth-header">
                <i class="fas fa-lock" style="font-size:24px;color:var(--maroon);"></i>
                <p style="margin:8px 0 0 0;font-size:14px;color:#666;">
                    ${currentLang === "ar" ? "اختر كلمة مرور (6 أحرف على الأقل)" : "Choose a password (min 6 characters)"}
                </p>
            </div>
            <div class="password-input-container">
                <input type="password" class="password-input" placeholder="••••••••" data-testid="input-password" />
            </div>
            <button class="auth-submit-btn" id="setPasswordBtn" data-testid="button-set-password">
                ${currentLang === "ar" ? "حفظ" : "Save"}
            </button>
        `;
        
        chatMessages.appendChild(container);
        scrollToBottom();
        
        const input = container.querySelector(".password-input");
        const btn = container.querySelector("#setPasswordBtn");
        
        input.focus();
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                btn.click();
            }
        });
        
        btn.addEventListener("click", async () => {
            const password = input.value.trim();
            if (password.length < 6) {
                alert(currentLang === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
                return;
            }
            
            btn.disabled = true;
            btn.textContent = currentLang === "ar" ? "جاري الحفظ..." : "Saving...";
            
            try {
                const res = await fetch("/api/auth/set-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password })
                });
                
                const data = await res.json();
                
                if (!data.success) {
                    btn.disabled = false;
                    btn.textContent = currentLang === "ar" ? "حفظ" : "Save";
                    alert(data.error || (currentLang === "ar" ? "حدث خطأ" : "An error occurred"));
                    return;
                }
                
                container.remove();
                addSystemMessage(data.message);
                updateProgress(1);
                setTimeout(() => startAssessment(), 1000);
            } catch (err) {
                console.error("Set password error:", err);
                btn.disabled = false;
                btn.textContent = currentLang === "ar" ? "حفظ" : "Save";
                alert(currentLang === "ar" ? "حدث خطأ" : "An error occurred");
            }
        });
    }

    function addLoginUI() {
        removeInteractiveUI();
        addSystemMessage(currentLang === "ar" ? "مرحبًا بعودتك! سجل دخولك للمتابعة" : "Welcome back! Please log in to continue");
        
        const container = document.createElement("div");
        container.className = "auth-card";
        container.innerHTML = `
            <div class="auth-header">
                <i class="fas fa-user-circle" style="font-size:24px;color:var(--maroon);"></i>
                <p style="margin:8px 0 0 0;font-size:14px;color:#666;">
                    ${currentLang === "ar" ? "تسجيل الدخول" : "Login"}
                </p>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input type="email" class="login-input" id="loginEmail" placeholder="${currentLang === "ar" ? "البريد الإلكتروني" : "Email"}" data-testid="input-login-email" />
                <input type="password" class="login-input" id="loginPassword" placeholder="${currentLang === "ar" ? "كلمة المرور" : "Password"}" data-testid="input-login-password" />
            </div>
            <button class="auth-submit-btn" id="loginBtn" data-testid="button-login">
                ${currentLang === "ar" ? "دخول" : "Login"}
            </button>
        `;
        
        chatMessages.appendChild(container);
        scrollToBottom();
        
        const emailInput = container.querySelector("#loginEmail");
        const passwordInput = container.querySelector("#loginPassword");
        const btn = container.querySelector("#loginBtn");
        
        emailInput.focus();
        [emailInput, passwordInput].forEach(input => {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") btn.click();
            });
        });
        
        btn.addEventListener("click", async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            if (!email || !password) {
                alert(currentLang === "ar" ? "يرجى ملء جميع الحقول" : "Please fill in all fields");
                return;
            }
            
            btn.disabled = true;
            btn.textContent = currentLang === "ar" ? "جاري تسجيل الدخول..." : "Logging in...";
            
            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, lang: currentLang })
                });
                
                const data = await res.json();
                
                if (!data.success) {
                    btn.disabled = false;
                    btn.textContent = currentLang === "ar" ? "دخول" : "Login";
                    alert(data.error || (currentLang === "ar" ? "بيانات خاطئة" : "Invalid credentials"));
                    return;
                }
                
                container.remove();
                addSystemMessage(currentLang === "ar" ? "أهلاً بك!" : "Welcome back!");
                
                // Load user progress and continue
                window.location.href = "/dashboard";
            } catch (err) {
                console.error("Login error:", err);
                btn.disabled = false;
                btn.textContent = currentLang === "ar" ? "دخول" : "Login";
                alert(currentLang === "ar" ? "حدث خطأ" : "An error occurred");
            }
        });
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
                
                // Check if OTP verification is required
                if (data.requiresOTP) {
                    setTimeout(() => addOTPInput(data.email, data.message || "", data.devMode), 500);
                    return;
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
                body: JSON.stringify({}),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                hideTypingIndicator();
                
                // Handle authentication error
                if (response.status === 401) {
                    addSystemMessage(
                        currentLang === "ar"
                            ? "يرجى تسجيل الدخول أولاً"
                            : "Please log in first"
                    );
                    setTimeout(() => {
                        window.location.href = "/login.html";
                    }, 1500);
                    return;
                }
                
                // Handle intake not completed
                if (response.status === 409 && errorData.error === "intake_not_completed") {
                    addSystemMessage(
                        errorData.message || (currentLang === "ar"
                            ? "يرجى إكمال بيانات الملف أولاً"
                            : "Please complete intake first")
                    );
                    return;
                }
                
                // Generic error
                addSystemMessage(
                    errorData.message || (currentLang === "ar"
                        ? "عذراً، حدث خطأ في التقييم."
                        : "Sorry, an error occurred during assessment.")
                );
                return;
            }

            const mcq = await response.json();
            currentMCQ = mcq;

            hideTypingIndicator();
            addMCQQuestion(mcq);
        } catch (error) {
            console.error("Error getting assessment question:", error);
            hideTypingIndicator();
            addSystemMessage(
                currentLang === "ar"
                    ? "عذراً، حدث خطأ في الاتصال بالخادم."
                    : "Sorry, a network error occurred.",
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
                addRetakeButton();
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
    function addRetakeButton() {
        const bubbles = Array.from(document.querySelectorAll(".message-bubble.system"));
        const last = bubbles[bubbles.length - 1];
        if (!last) return;
        
        const content = last.querySelector(".message-content");
        if (!content) return;
        
        const wrap = document.createElement("div");
        wrap.className = "retake-cta";
        wrap.style.marginTop = "16px";
        
        const btn = document.createElement("button");
        btn.className = "retake-btn";
        btn.setAttribute("data-testid", "button-retake");
        btn.innerHTML = `<i class="fas fa-redo"></i> ${currentLang === "ar" ? "إعادة التقييم بمستوى أصعب" : "Retake with Harder Questions"}`;
        
        btn.addEventListener("click", async () => {
            if (!confirm(currentLang === "ar" ? "هل تريد إعادة التقييم بمستوى أصعب؟" : "Start a new assessment with harder questions?")) {
                return;
            }
            
            btn.disabled = true;
            showTypingIndicator();
            
            try {
                const res = await fetch("/api/assess/retake", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId })
                });
                
                const data = await res.json();
                
                if (!data.success) {
                    hideTypingIndicator();
                    alert(data.error || (currentLang === "ar" ? "حدث خطأ" : "An error occurred"));
                    btn.disabled = false;
                    return;
                }
                
                sessionId = data.sessionId;
                currentStep = "assessment";
                hideTypingIndicator();
                addSystemMessage(data.message);
                setTimeout(() => startAssessment(), 1000);
            } catch (err) {
                console.error("Retake error:", err);
                hideTypingIndicator();
                alert(currentLang === "ar" ? "حدث خطأ" : "An error occurred");
                btn.disabled = false;
            }
        });
        
        wrap.appendChild(btn);
        content.appendChild(wrap);
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
