(function () {
  "use strict";

  const profileInputs = {
    name: document.getElementById("regName"),
    email: document.getElementById("regEmail"),
    phone: document.getElementById("regPhone"),
    country: document.getElementById("intakeCountry"),
    age_band: document.getElementById("intakeAge"),
    job_nature: document.getElementById("intakeJobNature"),
    experience_years_band: document.getElementById("intakeExp"),
    job_title_exact: document.getElementById("intakeTitle"),
    sector: document.getElementById("intakeSector"),
    learning_reason: document.getElementById("intakeReason"),
  };

  const saveState = document.getElementById("profileSaveState");
  const assessCards = document.getElementById("assessCards");
  const tutorialCards = document.getElementById("tutorialCards");
  const assessSort = document.getElementById("assessSort");
  const tutorialSort = document.getElementById("tutorialSort");

  const tutorialModal = document.getElementById("tutorialModal");
  const tutorialLog = document.getElementById("tutorialLog");
  const tutorialTitle = document.getElementById("tutorialTitle");
  const closeTutorialModal = document.getElementById("closeTutorialModal");

  function formatDate(str) {
    if (!str) return "";
    try {
      return new Date(str).toLocaleString();
    } catch (_) {
      return str;
    }
  }

  function setActivePanel(target) {
    document.querySelectorAll(".pill-btn").forEach((btn) => {
      const active = btn.getAttribute("data-target") === target;
      btn.classList.toggle("active", active);
    });
    document.querySelectorAll(".dash-panel").forEach((panel) => {
      const active = panel.getAttribute("data-panel") === target;
      panel.classList.toggle("hidden", !active);
    });
  }

  document.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActivePanel(btn.getAttribute("data-target"));
    });
  });

  function fillProfile(data) {
    const intake = data?.intake || {};
    const user = data?.user || {};
    profileInputs.name.value = user.name || "";
    profileInputs.email.value = user.email || "";
    profileInputs.phone.value = user.phone || "";
    profileInputs.country.value = intake.country || "";
    profileInputs.age_band.value = intake.age_band || "";
    profileInputs.job_nature.value = intake.job_nature || "";
    profileInputs.experience_years_band.value = intake.experience_years_band || "";
    profileInputs.job_title_exact.value = intake.job_title_exact || "";
    profileInputs.sector.value = intake.sector || "";
    profileInputs.learning_reason.value = intake.learning_reason || "";
  }

  let saveTimer = null;
  function scheduleProfileSave() {
    saveState.textContent = "Saving...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProfile, 400);
  }

  async function saveProfile() {
    const payload = {
      name: profileInputs.name.value || null,
      email: profileInputs.email.value || null,
      phone: profileInputs.phone.value || null,
      intake: {
        country: profileInputs.country.value || "",
        age_band: profileInputs.age_band.value || "",
        job_nature: profileInputs.job_nature.value || "",
        experience_years_band: profileInputs.experience_years_band.value || "",
        job_title_exact: profileInputs.job_title_exact.value || "",
        sector: profileInputs.sector.value || "",
        learning_reason: profileInputs.learning_reason.value || "",
      },
    };

    try {
      const resp = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error("save failed");
      saveState.textContent = "Saved";
      setTimeout(() => (saveState.textContent = ""), 1200);
    } catch (err) {
      console.error(err);
      saveState.textContent = "Error";
    }
  }

  Object.values(profileInputs).forEach((input) => {
    input?.addEventListener("input", scheduleProfileSave);
  });

  function buildAssessmentCard(item) {
    const card = document.createElement("div");
    card.className = "glass-card assess-card";
    const percent = item.percent || 0;
    const correct = item.correct_count || 0;
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.innerHTML = `<span style="width:${percent}%"></span>`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <p class="muted">${formatDate(item.finished_at)}</p>
          <h3>${percent}%</h3>
          <p class="muted">${correct} / 6</p>
        </div>
        <div class="chip">${percent >= 80 ? "🔥" : percent >= 50 ? "✅" : "📌"}</div>
      </div>
    `;
    card.appendChild(bar);
    return card;
  }

  function renderAssessments(list) {
    assessCards.innerHTML = "";
    if (!list.length) {
      assessCards.innerHTML = `<div class="empty">No assessments yet</div>`;
      return;
    }
    list.forEach((item) => assessCards.appendChild(buildAssessmentCard(item)));
  }

  function buildTutorialCard(item) {
    const card = document.createElement("div");
    card.className = "glass-card tutorial-card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <p class="muted">${formatDate(item.finished_at || item.created_at)}</p>
          <h3>${(item.chat_session_id || "").slice(0, 8)}</h3>
        </div>
        <div class="card-actions">
          <button class="icon-btn view" data-id="${item.chat_session_id}"><i class="fa-solid fa-up-right-from-square"></i></button>
          <button class="icon-btn danger" data-delete="${item.chat_session_id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    return card;
  }

  function renderTutorials(list) {
    tutorialCards.innerHTML = "";
    if (!list.length) {
      tutorialCards.innerHTML = `<div class="empty">No tutorials yet</div>`;
      return;
    }
    list.forEach((item) => tutorialCards.appendChild(buildTutorialCard(item)));
  }

  async function loadAssessments() {
    const sort = assessSort.value;
    const resp = await fetch(`/api/dashboard/assessments?sort=${encodeURIComponent(sort)}`);
    const data = await resp.json();
    renderAssessments(data.items || []);
  }

  async function loadTutorials() {
    const sort = tutorialSort.value;
    const resp = await fetch(`/api/dashboard/tutorials?sort=${encodeURIComponent(sort)}`);
    const data = await resp.json();
    renderTutorials(data.items || []);
  }

  async function loadOverview() {
    try {
      const resp = await fetch("/api/dashboard/overview");
      const data = await resp.json();
      fillProfile(data);
      renderAssessments(data.assessments || []);
      renderTutorials(data.tutorials || []);
    } catch (err) {
      console.error("overview", err);
    }
  }

  tutorialCards.addEventListener("click", async (e) => {
    const viewId = e.target.closest("button.view")?.getAttribute("data-id") || e.target.getAttribute?.("data-id");
    const delId = e.target.closest("button.danger")?.getAttribute("data-delete") || e.target.getAttribute?.("data-delete");

    if (viewId) {
      await openTutorial(viewId);
    } else if (delId) {
      await deleteTutorial(delId);
      await loadTutorials();
    }
  });

  async function openTutorial(id) {
    try {
      const resp = await fetch(`/api/dashboard/tutorials/${id}`);
      const data = await resp.json();
      tutorialLog.innerHTML = "";
      (data.messages || []).forEach((msg) => {
        const row = document.createElement("div");
        row.className = `tutorial-row ${msg.sender === "user" ? "user" : "assistant"}`;
        row.textContent = msg.content;
        tutorialLog.appendChild(row);
      });
      tutorialTitle.textContent = `Session ${id.slice(0, 8)}`;
      tutorialModal.classList.remove("hidden");
    } catch (err) {
      console.error("open tutorial", err);
    }
  }

  async function deleteTutorial(id) {
    try {
      await fetch(`/api/dashboard/tutorials/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("delete tutorial", err);
    }
  }

  closeTutorialModal.addEventListener("click", () => tutorialModal.classList.add("hidden"));
  tutorialModal.addEventListener("click", (e) => {
    if (e.target === tutorialModal) tutorialModal.classList.add("hidden");
  });

  assessSort.addEventListener("change", loadAssessments);
  tutorialSort.addEventListener("change", loadTutorials);

  document.addEventListener("DOMContentLoaded", loadOverview);
})();
