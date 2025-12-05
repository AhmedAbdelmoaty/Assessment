(function () {
  "use strict";

  const STRINGS = {
    en: {
      brand: { subtitle: "Your learning cockpit" },
      nav: {
        overview: "Overview",
        info: "My Info",
        assessments: "My Assessments",
        tutorials: "My Tutorials",
        videos: "My Videos",
      },
      header: {
        title: "Dashboard",
        subtitle: "Track your profile, assessments, and tutorials in one place",
      },
      actions: {
        newAssessment: "New Assessment",
        edit: "Edit",
        save: "Save",
        cancel: "Cancel",
      },
      overview: {
        points: "Progress",
        pointsSub: "Activity streak and learning",
        average: "Average Score",
        assessments: "Assessments",
        assessmentsSub: "Completed evaluations",
        tutorials: "Tutorials",
        tutorialsSub: "Saved explanations",
        recentAssessments: "Recent assessments",
        noAssessments: "No assessments yet.",
      },
      info: {
        title: "My Info",
        full_name: "Full name",
        email: "Email",
        phone: "Phone",
        country: "Country",
        age_band: "Age band",
        job_nature: "Job nature",
        experience: "Experience band",
        job_title: "Job title",
        sector: "Sector",
        learning_reason: "Learning reason",
        helper: "Click edit to update your profile and save when done.",
      },
      assessments: {
        title: "My Assessments",
        subtitle: "Filter and review your completed assessments",
        empty: "No assessments found.",
      },
      tutorials: {
        title: "My Tutorials",
        subtitle: "Browse and open your saved explanations",
        empty: "No tutorials saved yet.",
      },
      videos: {
        title: "No videos yet",
        subtitle: "Upload or browse videos later",
        cta: "Coming soon",
      },
      filters: {
        newest: "Newest",
        oldest: "Oldest",
        highest: "Highest Score",
        lowest: "Lowest Score",
      },
      labels: {
        date: "Date",
        score: "Score",
        level: "Level",
      },
    },
    ar: {
      brand: { subtitle: "مركز التحكم التعليمي" },
      nav: {
        overview: "النظرة العامة",
        info: "معلوماتي",
        assessments: "تقييماتي",
        tutorials: "شروحاتي",
        videos: "فيديوهاتي",
      },
      header: {
        title: "لوحة التحكم",
        subtitle: "تابع بياناتك وتقييماتك وشروحاتك في مكان واحد",
      },
      actions: {
        newAssessment: "تقييم جديد",
        edit: "تعديل",
        save: "حفظ",
        cancel: "إلغاء",
      },
      overview: {
        points: "التقدم",
        pointsSub: "نشاطك ومسارك",
        average: "متوسط الدرجات",
        assessments: "عدد التقييمات",
        assessmentsSub: "التقييمات المكتملة",
        tutorials: "الشروحات",
        tutorialsSub: "الشروحات المحفوظة",
        recentAssessments: "آخر التقييمات",
        noAssessments: "لا توجد تقييمات بعد.",
      },
      info: {
        title: "معلوماتي",
        full_name: "الاسم الكامل",
        email: "البريد الإلكتروني",
        phone: "رقم الهاتف",
        country: "الدولة",
        age_band: "الفئة العمرية",
        job_nature: "طبيعة العمل",
        experience: "سنوات الخبرة",
        job_title: "المسمى الوظيفي",
        sector: "القطاع",
        learning_reason: "سبب التعلم",
        helper: "اضغط تعديل لتحديث بياناتك ثم احفظ التغييرات.",
      },
      assessments: {
        title: "تقييماتي",
        subtitle: "رتّب واستعرض تقييماتك المكتملة",
        empty: "لا توجد تقييمات حالياً.",
      },
      tutorials: {
        title: "شروحاتي",
        subtitle: "تصفح وافتح الشروحات المؤرشفة",
        empty: "لا توجد شروحات محفوظة.",
      },
      videos: {
        title: "لا يوجد فيديوهات بعد",
        subtitle: "سيتم إضافة الفيديوهات لاحقاً",
        cta: "قريباً",
      },
      filters: {
        newest: "الأحدث",
        oldest: "الأقدم",
        highest: "الأعلى",
        lowest: "الأقل",
      },
      labels: {
        date: "التاريخ",
        score: "الدرجة",
        level: "المستوى",
      },
    },
  };

  const state = {
    lang: (window.LA_I18N && window.LA_I18N.getLocale()) || "en",
    profile: null,
    assessments: [],
    tutorials: [],
    average: 0,
    editing: false,
    currentSection: "overview",
  };

  const sections = {
    overview: document.getElementById("overviewSection"),
    info: document.getElementById("infoSection"),
    assessments: document.getElementById("assessmentsSection"),
    tutorials: document.getElementById("tutorialsSection"),
    videos: document.getElementById("videosSection"),
  };

  function t(key) {
    const parts = key.split(".");
    let cur = STRINGS[state.lang] || STRINGS.en;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return cur || key;
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = t(key);
      if (value) el.textContent = value;
    });
  }

  function setActiveSection(id) {
    state.currentSection = id;
    Object.entries(sections).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== id);
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === id);
    });
  }

  function animateBar(el, value) {
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.width = `${Math.min(100, value)}%`;
    });
  }

  function getSessionId() {
    try { return localStorage.getItem("chatSessionId"); } catch { return null; }
  }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Request failed");
    return data;
  }

  async function loadProfile() {
    const profile = await fetchJSON("/api/profile");
    state.profile = profile;
    renderProfile();
  }

  function renderProfile() {
    if (!state.profile) return;
    const fields = ["full_name", "email", "phone", "country", "age_band", "job_nature", "experience", "job_title", "sector", "learning_reason"];
    fields.forEach((f) => {
      const input = document.getElementById(f);
      if (input) input.value = state.profile[f] || "";
    });
  }

  async function saveProfile() {
    const sessionId = getSessionId();
    const payload = {
      full_name: document.getElementById("full_name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      country: document.getElementById("country").value.trim(),
      age_band: document.getElementById("age_band").value.trim(),
      job_nature: document.getElementById("job_nature").value.trim(),
      experience: document.getElementById("experience").value.trim(),
      job_title: document.getElementById("job_title").value.trim(),
      sector: document.getElementById("sector").value.trim(),
      learning_reason: document.getElementById("learning_reason").value.trim(),
      sessionId,
    };
    const updated = await fetchJSON("/api/profile", { method: "PUT", body: JSON.stringify(payload) });
    state.profile = updated;
    exitEditMode();
    renderProfile();
  }

  function enterEditMode() {
    state.editing = true;
    document.getElementById("editToggle").hidden = true;
    document.getElementById("saveProfile").hidden = false;
    document.getElementById("cancelEdit").hidden = false;
    document.querySelectorAll("#profileForm input").forEach((input) => {
      input.disabled = false;
    });
  }

  function exitEditMode() {
    state.editing = false;
    document.getElementById("editToggle").hidden = false;
    document.getElementById("saveProfile").hidden = true;
    document.getElementById("cancelEdit").hidden = true;
    document.querySelectorAll("#profileForm input").forEach((input) => {
      input.disabled = true;
    });
    renderProfile();
  }

  async function loadAssessments() {
    const data = await fetchJSON("/api/assessments");
    state.assessments = data.assessments || [];
    state.average = data.average || 0;
    renderAssessments("newest");
    renderOverview();
  }

  function renderAssessments(filter) {
    const container = document.getElementById("assessmentsList");
    if (!container) return;

    const list = [...state.assessments];
    if (filter === "highest") list.sort((a, b) => (b.percent || 0) - (a.percent || 0));
    else if (filter === "lowest") list.sort((a, b) => (a.percent || 0) - (b.percent || 0));
    else if (filter === "oldest") list.sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));
    else list.sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));

    container.innerHTML = "";
    if (!list.length) {
      container.textContent = t("assessments.empty");
      container.classList.add("empty");
      return;
    }
    container.classList.remove("empty");

    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "assessment-card";
      card.innerHTML = `
        <div>
          <div class="assessment-title">${t("labels.level")}: ${item.levels_summary ? Object.keys(item.levels_summary).join(" • ") : ""}</div>
          <div class="assessment-meta">${t("labels.date")}: ${new Date(item.finished_at).toLocaleString()}</div>
        </div>
        <div class="score-pill">${item.percent || 0}%</div>
      `;
      container.appendChild(card);
    });
  }

  function renderOverview() {
    document.getElementById("statTotalPoints").textContent = state.assessments.length * 10;
    document.getElementById("statAverageScore").textContent = `${state.average || 0}%`;
    document.getElementById("statAssessments").textContent = state.assessments.length;
    document.getElementById("statTutorials").textContent = state.tutorials.length;
    document.getElementById("recentAverage").textContent = state.assessments.length ? `${state.average}%` : t("overview.noAssessments");
    animateBar(document.getElementById("avgProgress"), state.average || 0);

    const recent = document.getElementById("recentAssessments");
    recent.innerHTML = "";
    const top3 = [...state.assessments].sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at)).slice(0, 3);
    if (!top3.length) {
      recent.textContent = t("overview.noAssessments");
      recent.classList.add("empty");
      return;
    }
    recent.classList.remove("empty");
    top3.forEach((item) => {
      const row = document.createElement("div");
      row.className = "assessment-card";
      row.innerHTML = `
        <div>
          <div class="assessment-title">${t("labels.date")}: ${new Date(item.finished_at).toLocaleDateString()}</div>
          <div class="assessment-meta">${t("labels.level")}: ${item.levels_summary ? Object.keys(item.levels_summary).join(" • ") : ""}</div>
        </div>
        <div class="score-pill">${item.percent || 0}%</div>
      `;
      recent.appendChild(row);
    });
  }

  async function loadTutorials() {
    const data = await fetchJSON("/api/tutorials");
    state.tutorials = data.tutorials || [];
    renderTutorials("newest");
    renderOverview();
  }

  function renderTutorials(filter) {
    const container = document.getElementById("tutorialsList");
    if (!container) return;
    const list = [...state.tutorials];
    if (filter === "oldest") list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = "";
    if (!list.length) {
      container.textContent = t("tutorials.empty");
      container.classList.add("empty");
      return;
    }
    container.classList.remove("empty");

    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "tutorial-card";
      card.innerHTML = `
        <div>
          <div class="assessment-title">${item.title}</div>
          <div class="tutorial-preview">${new Date(item.created_at).toLocaleString()}</div>
        </div>
        <i class="fa-solid fa-chevron-${state.lang === "ar" ? "left" : "right"}"></i>
      `;
      card.addEventListener("click", () => openTutorial(item));
      container.appendChild(card);
    });
  }

  function openTutorial(tutorial) {
    const modal = document.getElementById("tutorialModal");
    document.getElementById("modalTitle").textContent = tutorial.title;
    const body = document.getElementById("modalMessages");
    body.innerHTML = "";
    (tutorial.messages || []).forEach((m) => {
      const line = document.createElement("div");
      line.className = "chat-line";
      line.innerHTML = `<span class="role">${m.role === "user" ? "👤" : "🤖"}</span> <span>${m.content}</span> <span class="time">${m.time ? new Date(m.time).toLocaleString() : ""}</span>`;
      body.appendChild(line);
    });
    modal.classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("tutorialModal").classList.add("hidden");
  }

  async function startNewAssessment() {
    const currentSessionId = getSessionId();
    const data = await fetchJSON("/api/session/new-assessment", {
      method: "POST",
      body: JSON.stringify({ currentSessionId }),
    });
    if (data?.sessionId) {
      try { localStorage.setItem("chatSessionId", data.sessionId); } catch (_) {}
      window.location.href = "/app.html";
    }
  }

  function bindNav() {
    document.getElementById("dashNav").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-section]");
      if (!btn) return;
      const section = btn.dataset.section;
      setActiveSection(section);
      if (section === "assessments" && !state.assessments.length) loadAssessments();
      if (section === "tutorials" && !state.tutorials.length) loadTutorials();
      if (section === "overview") renderOverview();
    });
  }

  function bindFilters() {
    document.getElementById("assessmentFilters").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-filter]");
      if (!btn) return;
      document.querySelectorAll("#assessmentFilters .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderAssessments(btn.dataset.filter);
    });

    document.getElementById("tutorialFilters").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-filter]");
      if (!btn) return;
      document.querySelectorAll("#tutorialFilters .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderTutorials(btn.dataset.filter);
    });
  }

  function bindProfileActions() {
    document.getElementById("editToggle").addEventListener("click", enterEditMode);
    document.getElementById("cancelEdit").addEventListener("click", exitEditMode);
    document.getElementById("saveProfile").addEventListener("click", saveProfile);
  }

  function bindModal() {
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("tutorialModal").addEventListener("click", (ev) => {
      if (ev.target.id === "tutorialModal") closeModal();
    });
  }

  function bindActions() {
    document.getElementById("newAssessmentFromHeader").addEventListener("click", startNewAssessment);
    document.getElementById("browseVideos").addEventListener("click", (ev) => ev.preventDefault());
  }

  function syncLang() {
    state.lang = (window.LA_I18N && window.LA_I18N.getLocale()) || "en";
    applyTranslations();
    renderOverview();
    renderAssessments(document.querySelector("#assessmentFilters .pill-btn.active")?.dataset.filter || "newest");
    renderTutorials(document.querySelector("#tutorialFilters .pill-btn.active")?.dataset.filter || "newest");
  }

  async function init() {
    applyTranslations();
    bindNav();
    bindFilters();
    bindProfileActions();
    bindModal();
    bindActions();
    setActiveSection("overview");

    await loadProfile();
    await loadAssessments();
    await loadTutorials();
    renderOverview();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("la:locale-changed", syncLang);
})();
