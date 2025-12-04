(function () {
  "use strict";

  const state = {
    profile: null,
    assessments: [],
    tutorials: [],
    saving: false,
  };

  const fields = {};

  const selectors = {
    loading: document.getElementById("dashLoading"),
    tabs: document.querySelectorAll(".dash-tab"),
    panels: document.querySelectorAll(".dash-panel"),
    heroAssessments: document.getElementById("heroAssessments"),
    heroTutorials: document.getElementById("heroTutorials"),
    assessmentsGrid: document.getElementById("assessmentsGrid"),
    assessmentFilter: document.getElementById("assessmentFilter"),
    tutorialsGrid: document.getElementById("tutorialsGrid"),
    tutorialFilter: document.getElementById("tutorialFilter"),
    startAssessmentBtn: document.getElementById("startAssessmentBtn"),
    modal: document.getElementById("tutorialModal"),
    modalTitle: document.getElementById("modalTitle"),
    modalMessages: document.getElementById("modalMessages"),
    closeModal: document.getElementById("closeTutorialModal"),
  };

  const copy = {
    assessmentFilter: {
      en: ["Newest", "Oldest", "Highest score", "Lowest score"],
      ar: ["الأحدث", "الأقدم", "أعلى نتيجة", "أقل نتيجة"],
    },
    tutorialFilter: {
      en: ["Newest", "Oldest"],
      ar: ["الأحدث", "الأقدم"],
    },
  };

  function toggleLoading(show) {
    if (!selectors.loading) return;
    selectors.loading.classList.toggle("hidden", !show);
  }

  function debounce(fn, ms = 400) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function bindFields() {
    fields.name = document.getElementById("fieldName");
    fields.email = document.getElementById("fieldEmail");
    fields.phone = document.getElementById("fieldPhone");
    fields.locale = document.getElementById("fieldLocale");
    fields.country = document.getElementById("fieldCountry");
    fields.age = document.getElementById("fieldAge");
    fields.jobNature = document.getElementById("fieldJobNature");
    fields.experience = document.getElementById("fieldExperience");
    fields.jobTitle = document.getElementById("fieldJobTitle");
    fields.sector = document.getElementById("fieldSector");
    fields.reason = document.getElementById("fieldReason");
  }

  function hydrateProfile(profile) {
    if (!profile) return;
    state.profile = profile;
    const { user = {}, intake = {} } = profile;
    fields.name.value = user.name || "";
    fields.email.value = user.email || "";
    fields.phone.value = user.phone || "";
    fields.locale.value = user.locale === "ar" ? "ar" : "en";
    fields.country.value = intake.country || "";
    fields.age.value = intake.age_band || "";
    fields.jobNature.value = intake.job_nature || "";
    fields.experience.value = intake.experience_years_band || "";
    fields.jobTitle.value = intake.job_title_exact || "";
    fields.sector.value = intake.sector || "";
    fields.reason.value = intake.learning_reason || "";
    try { window.LA_I18N.setLocale(fields.locale.value); } catch (_) {}
  }

  const debouncedSave = debounce(async function () {
    if (!state.profile || state.saving) return;
    state.saving = true;
    const payload = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      locale: fields.locale.value,
      intake: {
        country: fields.country.value.trim(),
        age_band: fields.age.value.trim(),
        job_nature: fields.jobNature.value.trim(),
        experience_years_band: fields.experience.value.trim(),
        job_title_exact: fields.jobTitle.value.trim(),
        sector: fields.sector.value.trim(),
        learning_reason: fields.reason.value.trim(),
      },
    };
    try {
      const resp = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        hydrateProfile(data);
      }
    } catch (err) {
      console.error("save profile", err);
    } finally {
      state.saving = false;
    }
  }, 600);

  function attachAutosave() {
    Object.values(fields).forEach((el) => {
      if (!el) return;
      el.addEventListener("input", debouncedSave);
      el.addEventListener("change", debouncedSave);
    });
  }

  async function loadProfile() {
    const resp = await fetch("/api/profile");
    if (!resp.ok) throw new Error("profile load failed");
    const data = await resp.json();
    hydrateProfile(data);
  }

  function renderAssessments(list) {
    selectors.assessmentsGrid.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `<p data-lang="en">No assessments yet.</p><p class="hidden" data-lang="ar">لا توجد تقييمات بعد.</p>`;
      selectors.assessmentsGrid.appendChild(empty);
      return;
    }
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const percent = item.percent || 0;
      const date = new Date(item.finished_at).toLocaleString();
      card.innerHTML = `
        <div class="stat-head">
          <div class="stat-score">${percent}%</div>
          <div class="stat-date">${date}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
        <div class="level-breakdown">
          ${(item.levels_summary || []).map(l => `<span>${l.level}: ${l.correct}/2</span>`).join(" ")}
        </div>
      `;
      selectors.assessmentsGrid.appendChild(card);
    });
  }

  function sortAssessments() {
    const mode = selectors.assessmentFilter.value;
    const arr = [...state.assessments];
    if (mode === "newest") arr.sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));
    if (mode === "oldest") arr.sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));
    if (mode === "high") arr.sort((a, b) => (b.percent || 0) - (a.percent || 0));
    if (mode === "low") arr.sort((a, b) => (a.percent || 0) - (b.percent || 0));
    renderAssessments(arr);
  }

  async function loadAssessments() {
    const resp = await fetch("/api/assessments");
    if (!resp.ok) throw new Error("assessments fail");
    const data = await resp.json();
    state.assessments = data.assessments || [];
    selectors.heroAssessments.textContent = state.assessments.length;
    sortAssessments();
  }

  function renderTutorials(list) {
    selectors.tutorialsGrid.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `<p data-lang="en">No tutorials yet.</p><p class="hidden" data-lang="ar">لا توجد شروحات بعد.</p>`;
      selectors.tutorialsGrid.appendChild(empty);
      return;
    }
    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "tutorial-card";
      const date = new Date(item.created_at).toLocaleString();
      card.innerHTML = `
        <div class="tutorial-top">
          <div>
            <div class="tutorial-title">${item.title || "Tutorial"}</div>
            <div class="tutorial-date">${date}</div>
          </div>
          <div class="tutorial-actions">
            <button class="pill-btn" data-action="open" data-id="${item.id}"><i class="fa-solid fa-eye"></i></button>
            <button class="pill-btn danger" data-action="delete" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <p class="tutorial-preview">${item.preview || ""}</p>
      `;
      selectors.tutorialsGrid.appendChild(card);
    });
  }

  function sortTutorials() {
    const mode = selectors.tutorialFilter.value;
    const arr = [...state.tutorials];
    if (mode === "newest") arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (mode === "oldest") arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    renderTutorials(arr);
  }

  async function loadTutorials() {
    const resp = await fetch("/api/tutorials");
    if (!resp.ok) throw new Error("tutorials fail");
    const data = await resp.json();
    state.tutorials = data.tutorials || [];
    selectors.heroTutorials.textContent = state.tutorials.length;
    sortTutorials();
  }

  async function openTutorial(id) {
    const resp = await fetch(`/api/tutorials/${id}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const t = data.tutorial;
    selectors.modalTitle.textContent = t.title || "";
    selectors.modalMessages.innerHTML = "";
    (t.messages || []).forEach((m) => {
      const row = document.createElement("div");
      row.className = `modal-row ${m.sender}`;
      row.textContent = m.content;
      selectors.modalMessages.appendChild(row);
    });
    selectors.modal.classList.remove("hidden");
  }

  async function deleteTutorial(id) {
    const resp = await fetch(`/api/tutorials/${id}`, { method: "DELETE" });
    if (!resp.ok) return;
    state.tutorials = state.tutorials.filter((t) => t.id !== id);
    selectors.heroTutorials.textContent = state.tutorials.length;
    sortTutorials();
  }

  function wireTabs() {
    selectors.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        selectors.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const key = tab.dataset.tab;
        selectors.panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${key}`));
      });
    });
  }

  function wireFilters() {
    selectors.assessmentFilter.addEventListener("change", sortAssessments);
    selectors.tutorialFilter.addEventListener("change", sortTutorials);
  }

  function wireTutorialClicks() {
    selectors.tutorialsGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === "open") openTutorial(id);
      if (action === "delete") deleteTutorial(id);
    });
    selectors.closeModal.addEventListener("click", () => selectors.modal.classList.add("hidden"));
    selectors.modal.addEventListener("click", (e) => {
      if (e.target === selectors.modal) selectors.modal.classList.add("hidden");
    });
  }

  async function startNewAssessment() {
    try {
      let sessionId = null;
      try {
        const curResp = await fetch("/api/chat/current");
        if (curResp.ok) {
          const curData = await curResp.json();
          sessionId = curData?.session?.id || null;
        }
      } catch (_) {}

      const resp = await fetch("/api/chat/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (resp.ok) window.location.href = "app.html";
    } catch (e) {
      console.error("start assessment", e);
    }
  }

  function wireAssessmentButton() {
    selectors.startAssessmentBtn.addEventListener("click", startNewAssessment);
  }

  async function init() {
    bindFields();
    toggleLoading(true);
    try {
      await loadProfile();
      await Promise.all([loadAssessments(), loadTutorials()]);
      attachAutosave();
      wireTabs();
      wireFilters();
      wireTutorialClicks();
      wireAssessmentButton();
    } catch (err) {
      console.error("dashboard init", err);
    } finally {
      toggleLoading(false);
      if (window.LA_I18N) {
        window.LA_I18N.applyLocaleToPage(window.LA_I18N.getLocale());
        applyLocaleStrings(window.LA_I18N.getLocale());
        window.addEventListener("la:locale-changed", (e) => applyLocaleStrings(e.detail?.lang));
      }
    }
  }

  function applyLocaleStrings(lang) {
    const safe = lang === "ar" ? "ar" : "en";
    const af = selectors.assessmentFilter;
    const tf = selectors.tutorialFilter;
    const afOptions = copy.assessmentFilter[safe];
    const tfOptions = copy.tutorialFilter[safe];
    if (af && af.options.length === afOptions.length) {
      [...af.options].forEach((opt, idx) => opt.textContent = afOptions[idx]);
    }
    if (tf && tf.options.length === tfOptions.length) {
      [...tf.options].forEach((opt, idx) => opt.textContent = tfOptions[idx]);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
