(function () {
  "use strict";

  // =========================================================
  // 0) Global flags (to avoid auto-start during hydration)
  // =========================================================
  let __hydrating = false;
  let __hydrated = false;

  // =========================================================
  // 1) Always send cookie with every fetch from this page
  // =========================================================
  (() => {
    const _fetch = window.fetch;
    window.fetch = (input, init = {}) => {
      init = init || {};
      if (!init.credentials) init.credentials = "include";
      if (init.body && typeof init.body === "string") {
        init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
      }
      return _fetch(input, init);
    };
  })();

  // =========================================================
  // 2) State
  // =========================================================
  let currentLang = "en";
  let sessionId = null;
  let currentStep = "intake";            // intake | assessment | report | teaching
  let currentMCQ = null;                 // آخر سؤال MCQ وصل من السيرفر
  let isProcessing = false;
  let awaitingCustomInput = false;
  let teachingActive = false;

  // =========================================================
  // 3) DOM
  // =========================================================
  const html = document.documentElement;
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const headerLogoutBtn = document.getElementById("headerLogoutBtn");
  const floatingBtn = document.getElementById("floatingNewAssessmentBtn");

  // =========================================================
  // 4) Local persistence (only for UI HTML + a few flags)
  // =========================================================
  const CHAT_PERSIST_KEY = "chat_state_v1";

  function persistChatState() {
    try {
      const state = {
        sessionId: sessionId ?? null,
        currentStep: currentStep ?? null,
        teachingActive: !!teachingActive,
        currentLang: currentLang || "ar",
        chatHTML: chatMessages ? chatMessages.innerHTML : ""
      };
      localStorage.setItem(CHAT_PERSIST_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("persistChatState failed:", e);
    }
  }

  function hydrateChatFromStorage() {
    try {
      const raw = localStorage.getItem(CHAT_PERSIST_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);

      if (typeof state.sessionId !== "undefined") sessionId = state.sessionId;
      if (typeof state.currentStep !== "undefined") currentStep = state.currentStep;
      if (typeof state.teachingActive !== "undefined") teachingActive = !!state.teachingActive;
      if (typeof state.currentLang !== "undefined") currentLang = state.currentLang;

      if (state.chatHTML && chatMessages) {
        chatMessages.innerHTML = state.chatHTML;
        setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 0);
        return true;
      }
      return false;
    } catch (e) {
      console.warn("hydrateChatFromStorage failed:", e);
      return false;
    }
  }

  function clearPersistedChatState() {
    try { localStorage.removeItem(CHAT_PERSIST_KEY); } catch {}
  }

  function startPersistenceObserver() {
    if (!chatMessages) return;
    const persistObserver = new MutationObserver(() => {
      persistChatState();
    });
    persistObserver.observe(chatMessages, { childList: true, subtree: true });
    window.addEventListener("beforeunload", persistChatState);
  }

  // =========================================================
  // 5) Init
  // =========================================================
  init();

  async function init() {
    // Auth
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

    // Language from header utils
    if (window.HeaderUtils) {
      HeaderUtils.initHeaderLanguageSwitch('#lang-switch');
      currentLang = HeaderUtils.getCurrentLang();
      html.setAttribute("lang", currentLang === "ar" ? "ar" : "en");
      html.classList.toggle("lang-ar", currentLang === "ar");
      html.classList.toggle("lang-en", currentLang !== "ar");
    }

    // Restore UI HTML (only visuals)
    const restored = hydrateChatFromStorage();

    // Wire UI
    setupSendButton();
    setupInputHandlers();
    setupLogout();
    startPersistenceObserver();

    // Show New Assessment button
    if (floatingBtn) {
      floatingBtn.style.display = "inline-flex";
      // (still keep old handler hidden below, but we override with delegation later)
      setupNewAssessmentButton();
    }

    // *** Single source of truth: hydrate from server ***
    await hydrateFromServer(restored);
  }

  // =========================================================
  // 6) Server-driven Hydration (single path)
  // =========================================================
  async function hydrateFromServer(restored) {
    try {
      __hydrating = true;

      const resp = await fetch("/api/session/state");
      const st = await resp.json();

      if (!st || st.ok === false) {
        __hydrating = false;
        // fallback: start intake
        startIntakeFlow();
        return;
      }

      if (st.sessionId) {
        try { localStorage.setItem("sessionId", st.sessionId); } catch {}
        sessionId = st.sessionId;
      }

      currentStep = st.phase || "intake";

      // ===== Switch by phase =====
      if (st.phase === "assessment") {
        const cq = st.assessment?.currentQuestion || null;

        if (cq) {
          // Transform server cq -> our addMCQQuestion shape
          const level = cq.level || st.assessment?.level || "L1";
          // Prefer exact server step if available; fallback to simple calc
          const qNum = st.assessment?.stepWithinLevel || (((st.assessment?.progress?.asked ?? 0) % 2) + 1);
          const mcq = {
            level,
            questionNumber: qNum,
            totalQuestions: 2,
            prompt: cq.prompt || "",
            choices: Array.isArray(cq.choices) ? cq.choices : []
          };
          currentMCQ = mcq;
          addMCQQuestion(mcq);
          __hydrated = true; __hydrating = false;
          return;
        }

        // No currentQuestion but phase=assessment → request next immediately
        showTypingIndicator();
        try {
          const r = await fetch("/api/assess/next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId })
          });
          const j = await r.json();
          hideTypingIndicator();

          if (j && (j.kind === "question" || j.prompt)) {
            const level = j.level || "L1";
            const qNum = j.questionNumber || 1;
            const totalQ = j.totalQuestions || 2;
            const prompt = j.prompt || j.question || "";
            const choices = j.choices || j.options || [];

            const mcq = { level, questionNumber: qNum, totalQuestions: totalQ, prompt, choices };
            currentMCQ = mcq;
            addMCQQuestion(mcq);
          }
        } catch (err) {
          hideTypingIndicator();
          console.error("[Hydration -> next] error:", err);
        }

        __hydrated = true; __hydrating = false;
        return;
      }

      if (st.phase === "report" && st.report) {
        // Preferred: show narrative; fallback to short line
        const narrative = st.report.narrative || "";
        const score = st.report.scorePercent ?? null;
        if (narrative || score !== null) {
          const msg = (currentLang === "ar")
            ? `نتيجتك: ${score || 0}%\n${narrative}`
            : `Your score: ${score || 0}%\n${narrative}`;
          addSystemMessage(msg.trim());
        }
        addStartTeachingCTA();
        updateProgress(2, true);
        __hydrated = true; __hydrating = false;
        return;
      }

      if (st.phase === "teaching" && st.teaching) {
        // Replay transcript
        if (Array.isArray(st.teaching.transcript)) {
          for (const m of st.teaching.transcript) {
            if (m.role === "assistant") addSystemMessage(m.content || "");
            else if (m.role === "user") addUserMessage(m.content || "");
          }
        }
        teachingActive = true;
        currentStep = "teaching";
        __hydrated = true; __hydrating = false;
        return;
      }

      // intake / idle → start intake normally (but without any extra local greetings)
      __hydrating = false;
      startIntakeFlow();
    } catch (err) {
      console.error("[hydrateFromServer] failed:", err);
      __hydrating = false;
      // fallback: start intake
      startIntakeFlow();
    }
  }

  // =========================================================
  // 7) Logout
  // =========================================================
  function setupLogout() {
    if (!headerLogoutBtn) return;
    headerLogoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        clearPersistedChatState();
        window.location.href = "/";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });
  }

  // =========================================================
  // 8) Input / Send
  // =========================================================
  function setupSendButton() {
    if (!sendBtn) return;
    sendBtn.addEventListener("click", sendMessage);
  }

  function setupInputHandlers() {
    if (chatInput) {
      chatInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter" && !isProcessing) {
          sendMessage();
        }
      });
    }

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
        dropdowns.forEach((dropdown) => dropdown.classList.remove("active"));
      }
    });
  }

  function removeInteractiveUI() {
    document.querySelectorAll(".choice-chips, .dropdown-container").forEach((el) => el.remove());
  }

  function isOtherValue(txt) {
    const v = (txt || "").toString().trim().toLowerCase();
    return v === "other" || v === "أخرى" || v === "اخري" || v === "اخرى";
  }

  // =========================================================
  // 9) Intake Flow
  // =========================================================
  async function startIntakeFlow() {
    showTypingIndicator();
    try {
      const response = await fetch("/api/intake/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: currentLang }),
      });

      const data = await response.json();
      sessionId = data.sessionId;
      hideTypingIndicator();

      if (data.done && data.skipIntake) {
        if (data.message) addSystemMessage(data.message);
        currentStep = "assessment";
        updateProgress(1);
        setTimeout(() => startAssessment({ render: true }), 300);
        return;
      }

      renderIntakeStep(data);
    } catch (error) {
      console.error("Error starting intake:", error);
      hideTypingIndicator();
      addSystemMessage(
        currentLang === "ar"
          ? "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى."
          : "Sorry, an error occurred. Please try again."
      );
    }
  }

  async function sendMessage() {
    const message = chatInput ? chatInput.value.trim() : "";
    if (!message || isProcessing) return;

    isProcessing = true;
    addUserMessage(message);
    if (chatInput) chatInput.value = "";

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
        body: JSON.stringify({ sessionId, lang: currentLang, answer }),
      });

      const data = await response.json();
      hideTypingIndicator();

      if (data.error) {
        if (data.message) addSystemMessage(data.message);
        return;
      }

      if (data.done) {
        if (data.message) addSystemMessage(data.message);
        currentStep = "assessment";
        updateProgress(1);
        setTimeout(() => startAssessment({ render: true }), 300);
        return;
      }

      renderIntakeStep(data);
    } catch (error) {
      console.error("Error in intake:", error);
      hideTypingIndicator();
      addSystemMessage(
        currentLang === "ar"
          ? "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى."
          : "Sorry, an error occurred. Please try again."
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
          body: JSON.stringify({ sessionId, lang: currentLang }),
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

  // =========================================================
  // 10) Assessment
  // =========================================================
  async function startAssessment(options = { render: true }) {
    const render = options?.render !== false;

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

      if (render) {
        addMCQQuestion(mcq);
      }
    } catch (error) {
      console.error("Error getting assessment question:", error);
      hideTypingIndicator();
      addSystemMessage(
        currentLang === "ar"
          ? "عذراً، حدث خطأ في التقييم."
          : "Sorry, an error occurred during assessment."
      );
    }
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

  async function submitMCQAnswer(userAnswer) {
    showTypingIndicator();

    try {
      const response = await fetch("/api/assess/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userChoiceIndex: userAnswer }),
      });

      const result = await response.json();
      hideTypingIndicator();

      if (result.nextAction === "complete" || result.nextAction === "stop") {
        currentStep = "report";
        updateProgress(2);
        setTimeout(() => generateReport(), 300);
      } else {
        setTimeout(() => startAssessment({ render: true }), 400);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      hideTypingIndicator();
      addSystemMessage(
        currentLang === "ar"
          ? "عذراً، حدث خطأ في معالجة الإجابة."
          : "Sorry, an error occurred processing your answer."
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

      if (report && typeof report.message === "string" && report.message.trim()) {
        addSystemMessage(report.message.trim());
        addStartTeachingCTA();
      }

      updateProgress(2, true);
    } catch (error) {
      console.error("Error generating report:", error);
      hideTypingIndicator();
      addSystemMessage(
        currentLang === "ar"
          ? "عذراً، حدث خطأ في إنشاء التقرير."
          : "Sorry, an error occurred generating your report."
      );
    }
  }

  // =========================================================
  // 11) Teaching
  // =========================================================
  async function sendTeachingMessage(text) {
    showTypingIndicator();
    try {
      const resp = await fetch("/api/teach/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text }),
      });
      const data = await resp.json();
      hideTypingIndicator();

      if (data && data.message) {
        addSystemMessage(data.message);
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

  // =========================================================
  // 12) UI helpers
  // =========================================================
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
    searchInput.placeholder = currentLang === "ar" ? "ابحث عن دولة..." : "Search countries...";

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
        item.style.display = country.includes(searchTerm) ? "block" : "none";
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
      L1: currentLang === "ar" ? "المستوى الأول - الأساسيات" : "Level 1 - Foundations",
      L2: currentLang === "ar" ? "المستوى الثاني - التطبيق" : "Level 2 - Core Applied",
      L3: currentLang === "ar" ? "المستوى الثالث - المهني" : "Level 3 - Professional",
    };

    container.innerHTML = `
      <div class="mcq-header">
        <span class="mcq-level">${levelNames[mcq.level] || levelNames.L1}</span>
        <span class="mcq-number">${
          currentLang === "ar"
            ? \`السؤال \${mcq.questionNumber || 1} من \${mcq.totalQuestions || 2}\`
            : \`Question \${mcq.questionNumber || 1} of \${mcq.totalQuestions || 2}\`
        }</span>
      </div>
      <div class="mcq-question">${escapeHtml(mcq.prompt || "")}</div>
      <div class="mcq-choices">
        ${(mcq.choices || [])
          .map(
            (choice, index) => `
            <div class="mcq-choice" data-idx="${index}">
              <div class="choice-letter">${String.fromCharCode(65 + index)}</div>
              <span>${escapeHtml(choice)}</span>
            </div>`
          )
          .join("")}
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
    if (progressFill) {
      progressFill.style.width = completed ? "100%" : (progress + "%");
    }
  }

  function scrollToBottom() {
    if (!chatMessages) return;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // =========================================================
  // 13) Floating New Assessment Button (legacy handler)
  //      — kept, but real "new" below via delegation
  // =========================================================
  function setupNewAssessmentButton() {
    if (!floatingBtn) return;

    floatingBtn.addEventListener("click", async () => {
      // legacy local-only start (kept as soft fallback)
      clearPersistedChatState();

      try {
        if (teachingActive) {
          await fetch("/api/teach/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, autoSave: true })
          }).catch(() => {});
        }
      } catch {}

      try { if (chatMessages) chatMessages.innerHTML = ""; } catch {}
      try {
        currentStep = "assessment";
        teachingActive = false;
        isProcessing = false;
        awaitingCustomInput = false;
        currentMCQ = null;
      } catch {}

      try { sessionId = null; } catch {}

      // NOTE: We don't inject any welcome text here anymore
      // Real new-assessment is wired below via /api/assess/new
    });
  }

  // =========================================================
  // 14) TRUE "New Assessment" (server-side reset)
  // =========================================================
  document.addEventListener("click", async (ev) => {
    const trigger = ev.target.closest("#new-assessment, #btn-new-assessment, [data-action='new-assessment']");
    if (!trigger) return;

    ev.preventDefault();
    try {
      const r = await fetch("/api/assess/new", { method: "POST" });
      const j = await r.json();
      if (!j || !j.ok) throw new Error("Server refused new assessment");

      // Clean UI & local flags
      try { if (chatMessages) chatMessages.innerHTML = ""; } catch {}
      try { localStorage.setItem("sessionId", j.sessionId || ""); } catch {}
      currentStep = "intake";
      currentMCQ = null;
      isProcessing = false;
      teachingActive = false;

      // Hydration from server right away (preferred)
      __hydrated = false; __hydrating = true;
      const st = await fetch("/api/session/state").then(x => x.json());

      if (st?.phase === "assessment") {
        const cq = st.assessment?.currentQuestion;
        if (cq) {
          const level = cq.level || st.assessment?.level || "L1";
          const qNum = st.assessment?.stepWithinLevel || (((st.assessment?.progress?.asked ?? 0) % 2) + 1);
          const mcq = {
            level,
            questionNumber: qNum,
            totalQuestions: 2,
            prompt: cq.prompt || "",
            choices: Array.isArray(cq.choices) ? cq.choices : []
          };
          currentMCQ = mcq;
          addMCQQuestion(mcq);
          __hydrated = true; __hydrating = false;
          return;
        }
        // ask next if none
        const r2 = await fetch("/api/assess/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId })
        });
        const j2 = await r2.json();
        const level = j2.level || "L1";
        const qNum = j2.questionNumber || 1;
        const totalQ = j2.totalQuestions || 2;
        const prompt = j2.prompt || j2.question || "";
        const choices = j2.choices || j2.options || [];
        const mcq = { level, questionNumber: qNum, totalQuestions: totalQ, prompt, choices };
        currentMCQ = mcq;
        addMCQQuestion(mcq);
        __hydrated = true; __hydrating = false;
        return;
      }

      if (st?.phase === "intake" || st?.phase === "idle") {
        renderIntakeStep?.(st);
        __hydrated = true; __hydrating = false;
        return;
      }

      // fallback
      location.reload();
    } catch (err) {
      console.error("[New Assessment] error:", err);
      const lang = currentLang || "ar";
      addSystemMessage(lang === "ar" ? "حصل خطأ أثناء بدء تقييم جديد." : "Failed to start a new assessment.");
      persistChatState();
    }
  });

})();
