(function () {
  "use strict";

  // ========= State =========
  let currentLang = "en";
  let assessRaw = [];   // full list from API
  let assessView = [];  // filtered/sorted view
  let me = null;        // /api/me
  const qs = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));

  // ========= Init =========
  init();

  async function init() {
    // Auth guard
    try {
      const r = await fetch("/api/me");
      if (!r.ok) {
        window.location.href = "/login.html";
        return;
      }
      me = await r.json();
    } catch {
      window.location.href = "/login.html";
      return;
    }

    // Header language switch (إن وجد)
    if (window.HeaderUtils) {
      HeaderUtils.initHeaderLanguageSwitch("#lang-switch");
      currentLang = HeaderUtils.getCurrentLang();
    }

    // Accordion toggles
    setupAccordions();

    // Buttons and selects
    bindUI();

    // Load sections
    await loadProfileSection();
    await loadAssessmentsSection();
    await loadExplanationsSection();
  }

  // ========= UI Bindings =========
  function setupAccordions() {
    qsa("[data-acc-toggle]").forEach(h => {
      h.addEventListener("click", () => {
        const sec = h.closest(".dash-accordion");
        const open = sec.classList.contains("open");
        // Close others? (نخليها متعددة الفتح — مفيش مشكلة)
        if (!open) sec.classList.add("open");
        else sec.classList.remove("open");
      });
    });

    // افتح أول سكشن افتراضيًا
    const first = qs("#acc-myinfo");
    if (first) first.classList.add("open");
  }

  function bindUI() {
    // Edit profile open
    qs("#btnOpenEditProfile")?.addEventListener("click", openEditModal);

    // Assessments controls
    qs("#assessSort")?.addEventListener("change", () => renderAssessments());
    qs("#assessFilter")?.addEventListener("change", () => renderAssessments());

    // Modal close (attribute based)
    document.addEventListener("click", (e) => {
      const attr = e.target.getAttribute?.("data-close-modal");
      if (attr) closeModal(attr);
      if (e.target.classList?.contains("modal-backdrop")) {
        const id = e.target.getAttribute("data-close-modal");
        if (id) closeModal(id);
      }
    });

    // Esc closes any open modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        qsa(".modal.open").forEach(m => m.classList.remove("open"));
      }
    });

    // Submit edit profile
    qs("#editProfileForm")?.addEventListener("submit", onSaveProfile);
  }

  // ========= Profile (My Info) =========
  function getIntakeMerged(profile) {
    // السيرفر أحيانًا يحفظ intake مفصّل تحت profile.intake،
    // وأحيانًا يحفظ مفاتيح intake في الجذر أثناء /api/intake/next.
    // لذلك نجمع القيم من المكانين.
    const i = profile?.intake || {};
    return {
      country: i.country ?? profile?.country ?? "",
      age_band: i.age_band ?? profile?.age_band ?? "",
      job_nature: i.job_nature ?? profile?.job_nature ?? "",
      experience_years_band: i.experience_years_band ?? profile?.experience_years_band ?? "",
      job_title_exact: i.job_title_exact ?? profile?.job_title_exact ?? "",
      sector: i.sector ?? profile?.sector ?? "",
      learning_reason: i.learning_reason ?? profile?.learning_reason ?? "",
    };
  }

  async function loadProfileSection() {
    try {
      // me موجود من auth guard، واستخدمناه هنا فقط لنضمن آخر نسخة
      const r = await fetch("/api/me");
      if (!r.ok) throw new Error("failed");
      me = await r.json();

      const name = me.name || "-";
      const username = me.username || "-";
      const email = me.email || "-";
      const phone = me.phone || "-";

      const intake = getIntakeMerged(me?.intake ? { intake: me.intake, ...me } : me);

      // Fill view
      setText("#kv_name", name);
      setText("#kv_username", username);
      setText("#kv_email", email);
      setText("#kv_phone", phone);

      setText("#kv_country", intake.country || "-");
      setText("#kv_age_band", intake.age_band || "-");
      setText("#kv_job_nature", intake.job_nature || "-");
      setText("#kv_experience", intake.experience_years_band || "-");
      setText("#kv_job_title", intake.job_title_exact || "-");
      setText("#kv_sector", intake.sector || "-");
      setText("#kv_reason", intake.learning_reason || "-");

      // Prefill form (when opened we also refresh)
      prefillEditForm();

    } catch (e) {
      console.error("Failed to load profile:", e);
      // عرض بسيط لو عايز
    }
  }

  function prefillEditForm() {
    if (!me) return;
    const intake = getIntakeMerged(me?.intake ? { intake: me.intake, ...me } : me);

    setVal("#f_name", me.name || "");
    setVal("#f_username", me.username || "");
    setVal("#f_phone", me.phone || "");

    setVal("#f_country", intake.country || "");
    setVal("#f_age_band", intake.age_band || "");
    setVal("#f_job_nature", intake.job_nature || "");
    setVal("#f_experience", intake.experience_years_band || "");
    setVal("#f_job_title", intake.job_title_exact || "");
    setVal("#f_sector", intake.sector || "");
    setVal("#f_reason", intake.learning_reason || "");
  }

  function openEditModal() {
    prefillEditForm();
    openModal("editProfileModal");
  }

  async function onSaveProfile(e) {
    e.preventDefault();
    hide("#editProfileError"); hide("#editProfileSuccess");

    const name = val("#f_name").trim();
    const username = val("#f_username").trim();
    const phone = val("#f_phone").trim();

    const intake = {
      country: val("#f_country").trim(),
      age_band: val("#f_age_band").trim(),
      job_nature: val("#f_job_nature").trim(),
      experience_years_band: val("#f_experience").trim(),
      job_title_exact: val("#f_job_title").trim(),
      sector: val("#f_sector").trim(),
      learning_reason: val("#f_reason").trim(),
    };

    // Front validation موازي لراوت الباك
    if (username && (!/^[a-z0-9_-]+$/i.test(username) || username.length < 3 || username.length > 30)) {
      return showError("#editProfileError",
        currentLang === "ar"
          ? "اسم المستخدم يجب أن يكون 3-30 وبالحروف/الأرقام/شرطة سفلية/شرطة."
          : "Username must be 3-30 and only letters/numbers/_/-."
      );
    }

    // بناء الباي لود طبقًا لراوت PATCH /api/me
    const payload = {
      ...(name ? { name } : {}),
      ...(username ? { username } : {}),
      ...(phone !== undefined ? { phone } : {}),
      intake
    };

    toggleBtn("#btnSaveProfile", true);
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || "Update failed");
      }

      showSuccess("#editProfileSuccess",
        currentLang === "ar" ? "تم حفظ التعديلات بنجاح." : "Profile updated successfully."
      );

      // Reload view quickly
      await loadProfileSection();

      // close after small delay
      setTimeout(() => closeModal("editProfileModal"), 600);

    } catch (err) {
      showError("#editProfileError", err.message || "Update failed");
    } finally {
      toggleBtn("#btnSaveProfile", false);
    }
  }

  // ========= Assessments =========
  async function loadAssessmentsSection() {
    try {
      const r = await fetch("/api/me/assessments");
      const list = await r.json();
      assessRaw = Array.isArray(list) ? list : [];
      renderAssessments();
    } catch (e) {
      console.error("Failed to load assessments:", e);
      qs("#assessmentsList").innerHTML = `<div class="empty-state">
        <i class="fas fa-clipboard-list" style="font-size:44px;opacity:.3;"></i>
        <p data-lang-content="en">Failed to load assessments</p>
        <p class="hidden" data-lang-content="ar">تعذر تحميل التقييمات</p>
      </div>`;
    }
  }

  function renderAssessments() {
    const sortVal = val("#assessSort") || "date_desc";
    const filVal = val("#assessFilter") || "all";

    let list = [...assessRaw];

    // Filter
    if (filVal !== "all") {
      list = list.filter(a => a.status === filVal);
    }

    // Sort
    list.sort((a, b) => {
      const da = new Date(a.startedAt).getTime() || 0;
      const db = new Date(b.startedAt).getTime() || 0;
      if (sortVal === "date_desc") return db - da;
      if (sortVal === "date_asc") return da - db;
      if (sortVal === "score_desc") return (b.scorePercent || 0) - (a.scorePercent || 0);
      if (sortVal === "score_asc") return (a.scorePercent || 0) - (b.scorePercent || 0);
      return 0;
    });

    assessView = list;

    const container = qs("#assessmentsList");
    if (!list.length) {
      container.innerHTML = `<div class="empty-state">
        <i class="fas fa-clipboard-list" style="font-size:44px;opacity:.3;"></i>
        <p data-lang-content="en">No assessments yet</p>
        <p class="hidden" data-lang-content="ar">لا توجد تقييمات بعد</p>
      </div>`;
      return;
    }

    container.innerHTML = list.map(a => {
      const date = new Date(a.startedAt).toLocaleDateString();
      const pct = Math.max(0, Math.min(100, a.scorePercent || 0));
      const status = a.status === "complete" ? "Complete" : "In Progress";
      const statusAr = a.status === "complete" ? "مكتمل" : "جاري";
      return `
        <div class="assessment-item">
          <div class="assessment-header">
            <span><strong>${date}</strong></span>
            <span>
              <strong>${pct}%</strong>
              <span style="color:var(--muted-foreground); font-size:12px; margin-inline-start:8px;">
                <span data-lang-content="en">${status}</span>
                <span class="hidden" data-lang-content="ar">${statusAr}</span>
              </span>
            </span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join("");
  }

  // ========= Explanations =========
  async function loadExplanationsSection() {
    try {
      const r = await fetch("/api/me/explanations");
      const list = await r.json();

      const container = qs("#explanationsList");
      if (!Array.isArray(list) || !list.length) {
        container.innerHTML = `<div class="empty-state">
          <i class="fas fa-book-open" style="font-size:48px;opacity:.3;"></i>
          <p data-lang-content="en">No explanations yet</p>
          <p class="hidden" data-lang-content="ar">لا توجد شروحات بعد</p>
        </div>`;
        return;
      }

      container.innerHTML = list.map(e => {
        const title = e.topic || (currentLang === "ar" ? "موضوع الشرح" : "Explanation Topic");
        const snip = (e.content || "").slice(0, 120).trim();
        return `
          <div class="explain-item" data-explain-id="${e.id}" data-explain-title="${escapeHtml(title)}">
            <div class="explain-title">${escapeHtml(title)}</div>
            <div class="explain-snippet">${escapeHtml(snip)}${e.content && e.content.length > 120 ? "..." : ""}</div>
          </div>
        `;
      }).join("");

      // Click to open modal
      qsa(".explain-item", container).forEach(el => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-explain-id");
          const title = el.getAttribute("data-explain-title") || "";
          const item = list.find(x => x.id === id);
          if (!item) return;

          // Fill modal
          setText("#explainTitle", title);
          const body = qs("#explainBody");
          body.setAttribute("dir", "auto");
          body.innerHTML = escapeHtml(item.content || "");
          openModal("explainModal");
        });
      });

    } catch (e) {
      console.error("Failed to load explanations:", e);
      qs("#explanationsList").innerHTML = `<div class="empty-state">
        <i class="fas fa-book-open" style="font-size:48px;opacity:.3;"></i>
        <p data-lang-content="en">Failed to load explanations</p>
        <p class="hidden" data-lang-content="ar">تعذر تحميل الشروحات</p>
      </div>`;
    }
  }

  // ========= Modal helpers =========
  function openModal(id){ qs(`#${id}`)?.classList.add("open"); }
  function closeModal(id){ qs(`#${id}`)?.classList.remove("open"); }

  // ========= Utils =========
  function setText(sel, txt) { const el = qs(sel); if (el) el.textContent = txt ?? ""; }
  function setVal(sel, v) { const el = qs(sel); if (el) el.value = v ?? ""; }
  function val(sel){ const el = qs(sel); return el ? (el.value ?? "") : ""; }
  function hide(sel){ const el = qs(sel); if (el){ el.style.display = "none"; el.textContent = ""; } }
  function showError(sel, msg){ const el = qs(sel); if (el){ el.textContent = msg; el.style.display = "block"; } }
  function showSuccess(sel, msg){ const el = qs(sel); if (el){ el.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(msg)}`; el.style.display = "block"; } }
  function toggleBtn(sel, dis){ const el = qs(sel); if (el){ el.disabled = !!dis; } }
  function escapeHtml(s){ const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

})();
