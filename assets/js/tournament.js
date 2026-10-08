
/**
 * ChillPill Gaming Cafe — Tournament Management System
 * Handles: create/edit tournaments, registrations, draw generation,
 *          match scoring, standings, and homepage toggle.
 */
(function initTournamentModule() {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────
  let tournaments = [];
  let currentTournament = null;
  let tPlayers = [];
  let tMatches = [];

  // ── Status helpers ───────────────────────────────────────────────────────
  const STATUS_LABEL = {
    draft: "Draft",
    registration_open: "Registration Open",
    registration_closed: "Registration Closed",
    ongoing: "Ongoing",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  const STATUS_CLASS = {
    draft: "bg-slate-700 text-slate-300",
    registration_open: "bg-green-500/20 text-green-300 border border-green-500/40",
    registration_closed: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
    ongoing: "bg-sky-500/20 text-sky-300 border border-sky-500/40",
    completed: "bg-[#d8ff45]/20 text-[#d8ff45] border border-[#d8ff45]/40",
    cancelled: "bg-red-500/20 text-red-300 border border-red-500/40"
  };
  const FORMAT_LABEL = { knockout: "Direct Knockout", group_stage: "Group Stage + Knockout" };

  // ── Utility ───────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove("hidden"); document.body.style.overflow = "hidden"; }
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add("hidden"); document.body.style.overflow = ""; }
  }

  // ── Fetch all tournaments ─────────────────────────────────────────────────
  async function fetchTournaments() {
    if (!window.sb) return;
    const { data, error } = await window.sb.from("tournaments").select("*").order("created_at", { ascending: false });
    if (error) { console.warn("[CP] Tournaments fetch error:", error); return; }
    tournaments = data || [];
    renderTournamentList();
  }

  // ── Render tournament list ────────────────────────────────────────────────
  function renderTournamentList() {
    const list = document.getElementById("tournament-list");
    if (!list) return;
    if (!tournaments.length) {
      list.innerHTML = '<p class="text-sm text-slate-400 italic">No tournaments yet — create one to get started.</p>';
      return;
    }
    list.innerHTML = tournaments.map(t => `
      <div class="panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-[#d8ff45]/10 border border-[#d8ff45]/30 flex items-center justify-center shrink-0">
            <i data-lucide="trophy" width="18" height="18" class="text-[#d8ff45]"></i>
          </div>
          <div>
            <p class="font-bold">${esc(t.name)}</p>
            <p class="text-xs text-slate-400 mt-0.5">${esc(t.game)} &middot; ${FORMAT_LABEL[t.format] || t.format} &middot; ${t.max_players} players</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${t.show_on_homepage ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40">&#127758; On Homepage</span>' : ""}
          <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${STATUS_CLASS[t.status] || "bg-slate-700 text-slate-400"}">${STATUS_LABEL[t.status] || t.status}</span>
          <button class="open-tournament-btn text-xs font-bold text-slate-300 border border-slate-600 rounded-lg px-3 py-1.5 hover:border-[#d8ff45] hover:text-[#d8ff45] transition" data-tid="${t.id}">
            Manage &rarr;
          </button>
        </div>
      </div>`).join("");
    if (window.lucide) lucide.createIcons({ nodes: [list] });
    list.querySelectorAll(".open-tournament-btn").forEach(btn => {
      btn.addEventListener("click", () => openTournamentDetail(btn.dataset.tid));
    });
  }

  // ── Open tournament detail ────────────────────────────────────────────────
  async function openTournamentDetail(tid) {
    const t = tournaments.find(x => x.id === tid);
    if (!t) return;
    currentTournament = t;
    document.getElementById("tournament-list").classList.add("hidden");
    document.getElementById("tournament-detail-panel").classList.remove("hidden");
    document.getElementById("btn-create-tournament")?.classList.add("hidden");

    // Fill header
    document.getElementById("td-name").textContent = t.name;
    document.getElementById("td-game").textContent = `${t.game}  \u00b7  Start: ${t.start_date ? new Date(t.start_date).toLocaleDateString("en-IN") : "TBD"}`;
    const sb = document.getElementById("td-status-badge");
    sb.textContent = STATUS_LABEL[t.status] || t.status;
    sb.className = `text-[11px] font-bold px-2.5 py-0.5 rounded-full ${STATUS_CLASS[t.status] || "bg-slate-700 text-slate-300"}`;
    document.getElementById("td-format-badge").textContent = FORMAT_LABEL[t.format] || t.format;
    const meta = document.getElementById("td-meta");
    meta.innerHTML = [
      `<span>${t.max_players} slots</span>`,
      t.entry_fee > 0 ? `<span>Rs ${t.entry_fee} entry fee</span>` : "<span>Free Entry</span>",
      t.registration_deadline ? `<span>Reg. deadline: ${new Date(t.registration_deadline).toLocaleDateString("en-IN")}</span>` : ""
    ].filter(Boolean).join('<span class="text-slate-700">&middot;</span>');

    const hpBtn = document.getElementById("td-toggle-homepage");
    if (hpBtn) {
      hpBtn.textContent = t.show_on_homepage ? "\uD83C\uDF10 Shown — Hide from Homepage" : "Show on Homepage";
      hpBtn.onclick = () => toggleHomepage(t);
    }

    await loadTournamentData(tid);
    switchTournamentTab("registrations");
  }

  async function loadTournamentData(tid) {
    if (!window.sb) return;
    const [{ data: players }, { data: matches }] = await Promise.all([
      window.sb.from("tournament_players").select("*").eq("tournament_id", tid).order("created_at"),
      window.sb.from("tournament_matches").select("*").eq("tournament_id", tid).order("round_number").order("match_number")
    ]);
    tPlayers = players || [];
    tMatches = matches || [];
    renderRegistrationsTab();
    renderBracketTab();
    renderMatchesTab();
    renderStandingsTab();
    renderPrizesTab();
  }

  // ── Back button ──────────────────────────────────────────────────────────
  document.getElementById("td-back-btn")?.addEventListener("click", () => {
    currentTournament = null;
    tPlayers = [];
    tMatches = [];
    document.getElementById("tournament-list").classList.remove("hidden");
    document.getElementById("tournament-detail-panel").classList.add("hidden");
    document.getElementById("btn-create-tournament")?.classList.remove("hidden");
    fetchTournaments();
  });

  // ── Tab switching (updated to include broadcast) ─────────────────────────
  function switchTournamentTab(tab) {
    ["registrations", "bracket", "matches", "standings", "prizes", "broadcast"].forEach(t => {
      const panel = document.getElementById(`ttab-${t}`);
      const btn = document.querySelector(`[data-ttab="${t}"]`);
      if (panel) panel.classList.toggle("hidden", t !== tab);
      if (btn) {
        btn.classList.toggle("border-[#d8ff45]", t === tab);
        btn.classList.toggle("text-[#d8ff45]", t === tab);
        btn.classList.toggle("border-transparent", t !== tab);
        btn.classList.toggle("text-slate-400", t !== tab);
      }
    });
    if (tab === "broadcast") initBroadcastTab();
  }
  document.querySelectorAll(".tournament-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTournamentTab(btn.dataset.ttab));
  });

  // ── BROADCAST TAB ─────────────────────────────────────────────────────────
  const BC_QR_STORAGE_KEY = "chillpill_tournament_qr";
  let bcQrDataUrl = null;         // current QR image data URL
  let bcAllCustomers = [];        // { name, phone } deduped from records
  let bcSelectedPhones = new Set();

  function getBroadcastQrKey() {
    return `${BC_QR_STORAGE_KEY}_${currentTournament?.id || "default"}`;
  }

  function loadBroadcastQr() {
    try {
      const stored = localStorage.getItem(getBroadcastQrKey());
      if (stored) {
        bcQrDataUrl = stored;
        const img = document.getElementById("bc-qr-img");
        const inline = document.getElementById("bc-qr-inline-img");
        const preview = document.getElementById("bc-qr-preview");
        const placeholder = document.getElementById("bc-qr-placeholder");
        if (img) img.src = stored;
        if (inline) inline.src = stored;
        if (preview) preview.classList.remove("hidden");
        if (placeholder) placeholder.classList.add("hidden");
      } else {
        bcQrDataUrl = null;
        const preview = document.getElementById("bc-qr-preview");
        const placeholder = document.getElementById("bc-qr-placeholder");
        const inlineWrap = document.getElementById("bc-qr-preview-inline");
        if (preview) preview.classList.add("hidden");
        if (placeholder) placeholder.classList.remove("hidden");
        if (inlineWrap) inlineWrap.classList.add("hidden");
      }
    } catch (_) {}
  }

  function saveBroadcastQr(dataUrl) {
    try { localStorage.setItem(getBroadcastQrKey(), dataUrl); } catch (_) {}
  }

  function clearBroadcastQr() {
    try { localStorage.removeItem(getBroadcastQrKey()); } catch (_) {}
    bcQrDataUrl = null;
    const preview = document.getElementById("bc-qr-preview");
    const placeholder = document.getElementById("bc-qr-placeholder");
    const inlineWrap = document.getElementById("bc-qr-preview-inline");
    const img = document.getElementById("bc-qr-img");
    const inlineImg = document.getElementById("bc-qr-inline-img");
    if (preview) preview.classList.add("hidden");
    if (placeholder) placeholder.classList.remove("hidden");
    if (inlineWrap) inlineWrap.classList.add("hidden");
    if (img) img.src = "";
    if (inlineImg) inlineImg.src = "";
  }

  function buildBroadcastMessage() {
    const t = currentTournament;
    if (!t) return "";
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBD";
    const formatLabel = FORMAT_LABEL[t.format] || t.format || "—";
    const regLink = (document.getElementById("bc-reg-link")?.value || "").trim();
    const extraNotes = (document.getElementById("bc-extra-notes")?.value || "").trim();

    let msg = "";
    msg += `🎮 *${t.name}* — ${t.game}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📅 *Start Date:* ${fmtDate(t.start_date)}\n`;
    if (t.registration_deadline) msg += `⏰ *Register By:* ${fmtDate(t.registration_deadline)}\n`;
    msg += `🏆 *Format:* ${formatLabel}\n`;
    msg += `👥 *Max Players:* ${t.max_players || "—"}\n`;
    if (t.entry_fee > 0) {
      msg += `💰 *Entry Fee:* Rs ${t.entry_fee}\n`;
    } else {
      msg += `🆓 *Entry:* Free\n`;
    }

    if (t.prize_pool) {
      msg += `\n🏅 *Prize Pool:*\n${t.prize_pool}\n`;
    }

    if (t.rules) {
      msg += `\n📋 *Rules & Format:*\n${t.rules}\n`;
    }

    if (regLink) {
      msg += `\n🔗 *Register Here:*\n${regLink}\n`;
    }

    if (t.entry_fee > 0) {
      msg += `\n💳 *Payment:* Scan the QR code shared below to pay the entry fee and confirm your spot.\n`;
    }

    if (extraNotes) {
      msg += `\n📍 *Details:*\n${extraNotes}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📲 Reply to this message or visit us at ChillPill Gaming Cafe to register!\n`;
    msg += `_ChillPill Gaming Cafe — Let's Game!_ 🎯`;

    return msg;
  }

  async function loadBroadcastCustomers() {
    const listEl = document.getElementById("bc-customer-list");
    if (!window.sb || !listEl) return;

    // Fetch unique customers with phone numbers from records table
    const { data, error } = await window.sb
      .from("records")
      .select("customer_name, customer_phone")
      .not("customer_phone", "is", null)
      .neq("customer_phone", "")
      .neq("customer_phone", "-")
      .order("customer_name", { ascending: true });

    if (error) {
      listEl.innerHTML = `<p class="text-xs text-rose-400 col-span-full text-center py-4">Could not load customers: ${error.message}</p>`;
      return;
    }

    // Deduplicate by phone
    const seen = new Map();
    (data || []).forEach(r => {
      const phone = (r.customer_phone || "").trim();
      if (phone && !seen.has(phone)) {
        seen.set(phone, r.customer_name || "Unknown");
      }
    });

    bcAllCustomers = [...seen.entries()].map(([phone, name]) => ({ name, phone }));
    renderBroadcastCustomerList();
  }

  function renderBroadcastCustomerList() {
    const listEl = document.getElementById("bc-customer-list");
    const countEl = document.getElementById("bc-selected-count");
    if (!listEl) return;

    const search = (document.getElementById("bc-customer-search")?.value || "").toLowerCase();
    const filtered = bcAllCustomers.filter(c =>
      !search || c.name.toLowerCase().includes(search) || c.phone.includes(search)
    );

    if (!filtered.length) {
      listEl.innerHTML = `<p class="text-sm text-slate-500 italic col-span-full text-center py-6">${bcAllCustomers.length ? "No customers match your search." : "No customers with phone numbers found in records."}</p>`;
    } else {
      listEl.innerHTML = filtered.map(c => {
        const selected = bcSelectedPhones.has(c.phone);
        return `<label class="flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none
          ${selected ? "border-[#d8ff45]/50 bg-[#d8ff45]/5" : "border-slate-700 hover:border-slate-500"}">
          <input type="checkbox" class="bc-phone-check w-4 h-4 accent-[#d8ff45] shrink-0" value="${c.phone}" ${selected ? "checked" : ""}>
          <div class="min-w-0">
            <p class="text-xs font-semibold text-slate-200 truncate">${esc(c.name)}</p>
            <p class="text-[11px] text-slate-500 mono">${esc(c.phone)}</p>
          </div>
        </label>`;
      }).join("");

      listEl.querySelectorAll(".bc-phone-check").forEach(chk => {
        chk.addEventListener("change", () => {
          if (chk.checked) bcSelectedPhones.add(chk.value);
          else bcSelectedPhones.delete(chk.value);
          renderBroadcastCustomerList();
        });
      });
    }

    if (countEl) {
      countEl.textContent = `${bcSelectedPhones.size} recipient${bcSelectedPhones.size !== 1 ? "s" : ""} selected`;
    }
  }

  function initBroadcastTab() {
    loadBroadcastQr();
    loadBroadcastCustomers();

    // QR upload
    const qrInput = document.getElementById("bc-qr-input");
    if (qrInput && !qrInput._bcWired) {
      qrInput._bcWired = true;
      qrInput.addEventListener("change", () => {
        const file = qrInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          bcQrDataUrl = e.target.result;
          saveBroadcastQr(bcQrDataUrl);
          const img = document.getElementById("bc-qr-img");
          const inlineImg = document.getElementById("bc-qr-inline-img");
          if (img) img.src = bcQrDataUrl;
          if (inlineImg) inlineImg.src = bcQrDataUrl;
          document.getElementById("bc-qr-preview")?.classList.remove("hidden");
          document.getElementById("bc-qr-placeholder")?.classList.add("hidden");
          showToast("QR code uploaded and saved.");
        };
        reader.readAsDataURL(file);
        qrInput.value = "";
      });
    }

    // QR clear
    const qrClearBtn = document.getElementById("bc-qr-clear");
    if (qrClearBtn && !qrClearBtn._bcWired) {
      qrClearBtn._bcWired = true;
      qrClearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearBroadcastQr();
        showToast("QR code removed.");
      });
    }

    // Preview button
    const previewBtn = document.getElementById("bc-preview-btn");
    if (previewBtn && !previewBtn._bcWired) {
      previewBtn._bcWired = true;
      previewBtn.addEventListener("click", () => {
        const msg = buildBroadcastMessage();
        const previewEl = document.getElementById("bc-message-preview");
        if (previewEl) previewEl.textContent = msg;
        // Show QR preview inline
        const inlineWrap = document.getElementById("bc-qr-preview-inline");
        const inlineImg = document.getElementById("bc-qr-inline-img");
        if (bcQrDataUrl && inlineWrap && inlineImg) {
          inlineImg.src = bcQrDataUrl;
          inlineWrap.classList.remove("hidden");
        } else if (inlineWrap) {
          inlineWrap.classList.add("hidden");
        }
      });
    }

    // Search
    const searchInput = document.getElementById("bc-customer-search");
    if (searchInput && !searchInput._bcWired) {
      searchInput._bcWired = true;
      searchInput.addEventListener("input", renderBroadcastCustomerList);
    }

    // Select All
    const selectAll = document.getElementById("bc-select-all");
    if (selectAll && !selectAll._bcWired) {
      selectAll._bcWired = true;
      selectAll.addEventListener("click", () => {
        const search = (document.getElementById("bc-customer-search")?.value || "").toLowerCase();
        const filtered = bcAllCustomers.filter(c =>
          !search || c.name.toLowerCase().includes(search) || c.phone.includes(search)
        );
        filtered.forEach(c => bcSelectedPhones.add(c.phone));
        renderBroadcastCustomerList();
      });
    }

    // Deselect All
    const deselectAll = document.getElementById("bc-deselect-all");
    if (deselectAll && !deselectAll._bcWired) {
      deselectAll._bcWired = true;
      deselectAll.addEventListener("click", () => {
        bcSelectedPhones.clear();
        renderBroadcastCustomerList();
      });
    }

    // Send via WhatsApp
    const sendBtn = document.getElementById("bc-send-whatsapp");
    if (sendBtn && !sendBtn._bcWired) {
      sendBtn._bcWired = true;
      sendBtn.addEventListener("click", () => {
        if (!bcSelectedPhones.size) return showToast("Please select at least one recipient.");
        const msg = buildBroadcastMessage();
        if (!msg) return showToast("No tournament loaded.");

        const encodedMsg = encodeURIComponent(msg);
        const phones = [...bcSelectedPhones];

        // Open WhatsApp links one by one (browser will open each)
        let delay = 0;
        phones.forEach(phone => {
          const cleaned = phone.replace(/\D/g, "");
          // Prepend country code 977 for Nepal if not already
          const intlPhone = cleaned.startsWith("977") ? cleaned : `977${cleaned}`;
          setTimeout(() => {
            window.open(`https://wa.me/${intlPhone}?text=${encodedMsg}`, "_blank");
          }, delay);
          delay += 600; // 600ms gap between each to avoid popup blockers
        });

        // If QR code exists, remind to share it separately
        if (bcQrDataUrl) {
          showToast(`Opened ${phones.length} WhatsApp chat${phones.length > 1 ? "s" : ""}. Remember to also share the QR code image in each chat!`);
        } else {
          showToast(`Opened ${phones.length} WhatsApp chat${phones.length > 1 ? "s" : ""}.`);
        }
      });
    }

    if (window.lucide) lucide.createIcons({ nodes: [document.getElementById("ttab-broadcast")] });
  }

  // ── Status change buttons ─────────────────────────────────────────────────
  document.querySelectorAll(".td-status-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!currentTournament || !window.sb) return;
      const newStatus = btn.dataset.tstatus;
      const { error } = await window.sb.from("tournaments").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", currentTournament.id);
      if (error) return showToast("Could not update: " + error.message);
      currentTournament.status = newStatus;
      const idx = tournaments.findIndex(x => x.id === currentTournament.id);
      if (idx !== -1) tournaments[idx].status = newStatus;
      // Refresh badge
      const sb = document.getElementById("td-status-badge");
      sb.textContent = STATUS_LABEL[newStatus] || newStatus;
      sb.className = `text-[11px] font-bold px-2.5 py-0.5 rounded-full ${STATUS_CLASS[newStatus] || "bg-slate-700 text-slate-300"}`;
      showToast(`Status set to: ${STATUS_LABEL[newStatus]}`);
    });
  });

  // ── Toggle homepage visibility ────────────────────────────────────────────
  async function toggleHomepage(t) {
    if (!window.sb) return;
    const val = !t.show_on_homepage;
    const { error } = await window.sb.from("tournaments").update({ show_on_homepage: val, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return showToast("Error: " + error.message);
    currentTournament.show_on_homepage = val;
    const idx = tournaments.findIndex(x => x.id === t.id);
    if (idx !== -1) tournaments[idx].show_on_homepage = val;
    const hpBtn = document.getElementById("td-toggle-homepage");
    if (hpBtn) hpBtn.textContent = val ? "\uD83C\uDF10 Shown — Hide from Homepage" : "Show on Homepage";
    showToast(val ? "Tournament is now visible on the homepage!" : "Tournament hidden from homepage.");
  }

  // ── REGISTRATIONS TAB ────────────────────────────────────────────────────
  function renderRegistrationsTab() {
    const list = document.getElementById("td-registrations-list");
    const empty = document.getElementById("td-reg-empty");
    const count = document.getElementById("td-reg-count");
    const summary = document.getElementById("td-reg-summary");
    if (!list) return;

    const total = tPlayers.length;
    const confirmed = tPlayers.filter(p => p.status === "confirmed").length;
    const maxSlots = currentTournament?.max_players || 16;
    if (count) count.textContent = `(${total})`;
    if (summary) summary.textContent = `${total} registered · ${confirmed} confirmed · ${maxSlots - total} slots remaining`;

    const search = (document.getElementById("td-reg-search")?.value || "").toLowerCase();
    const filtered = tPlayers.filter(p =>
      !search ||
      p.player_name.toLowerCase().includes(search) ||
      (p.gamertag || "").toLowerCase().includes(search) ||
      (p.phone || "").includes(search)
    );

    if (empty) empty.classList.toggle("hidden", filtered.length > 0);
    if (!filtered.length) { list.innerHTML = ""; return; }

    list.innerHTML = filtered.map((p, i) => `
      <div class="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center text-sm">
        <span class="text-slate-500 text-xs mono w-5 text-right">${i + 1}</span>
        <div class="min-w-0">
          <p class="font-semibold truncate">${esc(p.player_name)}${p.gamertag ? ` <span class="text-xs text-slate-500 font-normal">(${esc(p.gamertag)})</span>` : ""}</p>
          <p class="text-xs text-slate-400 truncate">${esc(p.phone)}${p.group_name ? ` &middot; Grp ${esc(p.group_name)}` : ""}${p.team_name ? ` &middot; ${esc(p.team_name)}` : ""}</p>
        </div>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          p.status === "confirmed" ? "bg-green-500/20 text-green-300" :
          p.status === "eliminated" ? "bg-red-500/10 text-red-400" :
          p.status === "winner" ? "bg-[#d8ff45]/20 text-[#d8ff45]" :
          p.status === "runner_up" ? "bg-sky-500/20 text-sky-300" :
          "bg-slate-700 text-slate-400"}">${p.status}</span>
        <div class="flex gap-1 shrink-0">
          ${p.status === "registered" ? `<button class="confirm-player-btn text-[11px] font-bold text-green-300 border border-green-500/40 rounded-lg px-2 py-1 hover:bg-green-500/10 transition" data-pid="${p.id}">Confirm</button>` : ""}
        </div>
        <button class="remove-player-btn text-slate-500 hover:text-red-300 transition text-xl leading-none shrink-0" data-pid="${p.id}" title="Remove">&#215;</button>
      </div>`).join("");

    list.querySelectorAll(".confirm-player-btn").forEach(btn =>
      btn.addEventListener("click", () => updatePlayerStatus(btn.dataset.pid, "confirmed")));
    list.querySelectorAll(".remove-player-btn").forEach(btn =>
      btn.addEventListener("click", () => removePlayer(btn.dataset.pid)));
  }

  document.getElementById("td-reg-search")?.addEventListener("input", renderRegistrationsTab);

  async function updatePlayerStatus(pid, status) {
    if (!window.sb) return;
    const { error } = await window.sb.from("tournament_players").update({ status }).eq("id", pid);
    if (error) return showToast("Error: " + error.message);
    const p = tPlayers.find(x => x.id === pid);
    if (p) p.status = status;
    renderRegistrationsTab();
    showToast(`Player ${status}.`);
  }

  async function removePlayer(pid) {
    if (!confirm("Remove this player from the tournament?")) return;
    if (!window.sb) return;
    const { error } = await window.sb.from("tournament_players").delete().eq("id", pid);
    if (error) return showToast("Error: " + error.message);
    tPlayers = tPlayers.filter(x => x.id !== pid);
    renderRegistrationsTab();
    showToast("Player removed.");
  }

  // CSV Export
  document.getElementById("td-export-registrations")?.addEventListener("click", () => {
    if (!tPlayers.length) return showToast("No registrations to export.");
    const header = "Name,Gamertag,Phone,Email,Status,Group,Registered At";
    const rows = tPlayers.map(p =>
      [p.player_name, p.gamertag || "", p.phone, p.email || "", p.status, p.group_name || "", p.created_at]
        .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `${(currentTournament?.name || "tournament").replace(/\s+/g, "_")}_players.csv`;
    a.click();
  });

  // ── BRACKET / DRAW ────────────────────────────────────────────────────────
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  document.getElementById("td-generate-draw")?.addEventListener("click", async () => {
    if (!currentTournament || !window.sb) return;
    const confirmed = tPlayers.filter(p => p.status === "confirmed");
    if (confirmed.length < 4) return showToast("Need at least 4 confirmed players to generate a draw.");
    if (!confirm(`Generate draw for ${confirmed.length} confirmed players? This will delete any existing matches.`)) return;

    await window.sb.from("tournament_matches").delete().eq("tournament_id", currentTournament.id);
    tMatches = [];
    const shuffled = shuffle(confirmed);
    const tid = currentTournament.id;
    const toInsert = [];

    if (currentTournament.format === "knockout") {
      const n = shuffled.length;
      const roundName = n <= 2 ? "Final" : n <= 4 ? "Semi Final" : n <= 8 ? "Quarter Final" : "Round of 16";
      for (let i = 0; i < n; i += 2) {
        toInsert.push({
          tournament_id: tid, round_name: roundName, round_number: 1,
          match_number: Math.floor(i / 2) + 1,
          player1_id: shuffled[i].id,
          player2_id: shuffled[i + 1]?.id || null,
          status: shuffled[i + 1] ? "scheduled" : "bye"
        });
      }
    } else {
      // Group stage: groups of 4, round-robin within groups
      const groupSize = 4;
      const groupNames = "ABCDEFGH".split("");
      let mNum = 1;
      for (let g = 0; g < Math.ceil(shuffled.length / groupSize); g++) {
        const grp = shuffled.slice(g * groupSize, (g + 1) * groupSize);
        const gName = groupNames[g] || String(g + 1);
        for (const p of grp) {
          await window.sb.from("tournament_players").update({ group_name: gName }).eq("id", p.id);
          p.group_name = gName;
        }
        for (let a = 0; a < grp.length; a++) {
          for (let b = a + 1; b < grp.length; b++) {
            toInsert.push({
              tournament_id: tid, round_name: `Group ${gName}`, round_number: 1,
              match_number: mNum++, player1_id: grp[a].id, player2_id: grp[b].id, status: "scheduled"
            });
          }
        }
      }
    }

    const { data: inserted, error } = await window.sb.from("tournament_matches").insert(toInsert).select();
    if (error) return showToast("Draw error: " + error.message);
    tMatches = inserted || [];

    if (["draft", "registration_closed"].includes(currentTournament.status)) {
      await window.sb.from("tournaments").update({ status: "ongoing", updated_at: new Date().toISOString() }).eq("id", tid);
      currentTournament.status = "ongoing";
    }

    renderBracketTab();
    renderMatchesTab();
    renderStandingsTab();
    renderRegistrationsTab();
    showToast(`Draw generated! ${toInsert.length} matches scheduled.`);
  });

  function renderBracketTab() {
    const view = document.getElementById("td-bracket-view");
    if (!view) return;
    if (!tMatches.length) {
      view.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-6">No draw yet. Confirm players then click Generate Draw.</p>';
      return;
    }
    const rounds = [...new Set(tMatches.map(m => m.round_name))];
    view.innerHTML = rounds.map(rn => {
      const rMatches = tMatches.filter(m => m.round_name === rn);
      return `
        <div>
          <p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider mb-2 mt-4 first:mt-0">${esc(rn)}</p>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            ${rMatches.map(m => {
              const p1 = tPlayers.find(p => p.id === m.player1_id);
              const p2 = tPlayers.find(p => p.id === m.player2_id);
              return `
                <div class="rounded-xl border ${m.status === "completed" ? "border-[#d8ff45]/30 bg-[#d8ff45]/5" : "border-slate-700 bg-[#0f1520]"} p-3">
                  <div class="flex items-center justify-between text-[11px] mb-2">
                    <span class="text-slate-500">Match ${m.match_number}</span>
                    <span class="${m.status === "completed" ? "text-[#d8ff45] font-bold" : "text-slate-500"}">${m.status}</span>
                  </div>
                  <div class="space-y-1.5 text-sm">
                    <div class="flex justify-between ${m.winner_id === m.player1_id ? "text-[#d8ff45] font-bold" : ""}">
                      <span class="truncate">${p1 ? esc(p1.player_name) : "TBD"}</span>
                      <span class="mono ml-2 shrink-0">${m.status === "completed" ? (m.player1_score ?? 0) : "—"}</span>
                    </div>
                    <div class="flex justify-between ${m.winner_id === m.player2_id ? "text-[#d8ff45] font-bold" : ""}">
                      <span class="truncate">${p2 ? esc(p2.player_name) : m.status === "bye" ? "BYE" : "TBD"}</span>
                      <span class="mono ml-2 shrink-0">${m.status === "completed" ? (m.player2_score ?? 0) : "—"}</span>
                    </div>
                  </div>
                  ${m.winner_id ? `<p class="text-[11px] text-[#d8ff45] mt-2 font-bold">&#127942; ${esc(tPlayers.find(p => p.id === m.winner_id)?.player_name || "")}</p>` : ""}
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");
  }

  // ── MATCHES TAB ───────────────────────────────────────────────────────────
  function renderMatchesTab() {
    const list = document.getElementById("td-matches-list");
    const empty = document.getElementById("td-matches-empty");
    const filter = document.getElementById("td-match-round-filter");
    if (!list) return;

    const rounds = [...new Set(tMatches.map(m => m.round_name))];
    if (filter) {
      const cur = filter.value;
      filter.innerHTML = '<option value="all">All Rounds</option>' +
        rounds.map(r => `<option value="${esc(r)}" ${cur === r ? "selected" : ""}>${esc(r)}</option>`).join("");
    }

    const activeFilter = filter?.value || "all";
    const filtered = activeFilter === "all" ? tMatches : tMatches.filter(m => m.round_name === activeFilter);
    if (empty) empty.classList.toggle("hidden", filtered.length > 0);
    if (!filtered.length) { list.innerHTML = ""; return; }

    list.innerHTML = filtered.map(m => {
      const p1 = tPlayers.find(p => p.id === m.player1_id);
      const p2 = tPlayers.find(p => p.id === m.player2_id);
      const sched = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "TBD";
      return `
        <div class="panel rounded-xl p-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">${esc(m.round_name)}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full ${
                  m.status === "completed" ? "bg-[#d8ff45]/20 text-[#d8ff45]" :
                  m.status === "ongoing" ? "bg-sky-500/20 text-sky-300 animate-pulse" :
                  "bg-slate-700 text-slate-400"}">${m.status}</span>
                ${m.station_name ? `<span class="text-[10px] text-slate-500">${esc(m.station_name)}</span>` : ""}
                <span class="text-[10px] text-slate-500">&#128336; ${sched}</span>
              </div>
              <div class="flex items-center gap-3 text-sm">
                <span class="font-bold truncate ${m.winner_id === m.player1_id ? "text-[#d8ff45]" : ""}">${p1 ? esc(p1.player_name) : "TBD"}</span>
                <span class="mono font-black text-lg shrink-0 ${m.status === "completed" ? "text-white" : "text-slate-700"}">
                  ${m.status === "completed" ? `${m.player1_score ?? 0}&ndash;${m.player2_score ?? 0}` : "vs"}
                </span>
                <span class="font-bold truncate ${m.winner_id === m.player2_id ? "text-[#d8ff45]" : ""}">${p2 ? esc(p2.player_name) : m.status === "bye" ? "BYE" : "TBD"}</span>
              </div>
            </div>
            <div class="shrink-0">
              ${m.status !== "bye" ? `<button class="open-match-score-btn text-xs font-bold border rounded-lg px-3 py-2 transition ${
                m.status === "completed" ? "border-slate-600 text-slate-400 hover:border-sky-400 hover:text-sky-300" :
                "border-[#d8ff45]/50 text-[#d8ff45] hover:bg-[#d8ff45]/10"
              }" data-mid="${m.id}">${m.status === "completed" ? "Edit Result" : "Enter Result"}</button>` :
              '<span class="text-xs text-slate-500 italic">Bye</span>'}
            </div>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll(".open-match-score-btn").forEach(btn =>
      btn.addEventListener("click", () => openMatchScoreModal(btn.dataset.mid)));
  }

  document.getElementById("td-match-round-filter")?.addEventListener("change", renderMatchesTab);

  // ── Match score modal ─────────────────────────────────────────────────────
  function openMatchScoreModal(mid) {
    const match = tMatches.find(m => m.id === mid);
    if (!match) return;
    const p1 = tPlayers.find(p => p.id === match.player1_id);
    const p2 = tPlayers.find(p => p.id === match.player2_id);
    document.getElementById("ms-match-id").value = mid;
    document.getElementById("ms-player1-name").textContent = p1?.player_name || "Player 1";
    document.getElementById("ms-player2-name").textContent = p2?.player_name || "Player 2";
    document.getElementById("ms-player1-score").value = match.player1_score ?? "";
    document.getElementById("ms-player2-score").value = match.player2_score ?? "";
    document.getElementById("ms-station").value = match.station_name || "";
    document.getElementById("ms-scheduled").value = match.scheduled_at ? match.scheduled_at.slice(0, 16) : "";
    document.getElementById("ms-msg").textContent = "";
    openModal("match-score-modal");
  }

  document.getElementById("match-score-modal-close")?.addEventListener("click", () => closeModal("match-score-modal"));
  document.getElementById("match-score-modal")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal("match-score-modal"); });

  async function saveMatchResult(enterScore) {
    if (!window.sb) return;
    const mid = document.getElementById("ms-match-id").value;
    const match = tMatches.find(m => m.id === mid);
    if (!match) return;

    const s1 = Number(document.getElementById("ms-player1-score").value) || 0;
    const s2 = Number(document.getElementById("ms-player2-score").value) || 0;
    const station = document.getElementById("ms-station").value.trim() || null;
    const schedVal = document.getElementById("ms-scheduled").value;

    let payload = { station_name: station };
    if (schedVal) payload.scheduled_at = new Date(schedVal).toISOString();

    if (enterScore) {
      const winnerId = s1 > s2 ? match.player1_id : s2 > s1 ? match.player2_id : null;
      payload = { ...payload, player1_score: s1, player2_score: s2, winner_id: winnerId, status: "completed" };
    }

    document.getElementById("ms-msg").textContent = "Saving...";
    const { error } = await window.sb.from("tournament_matches").update(payload).eq("id", mid);
    if (error) { document.getElementById("ms-msg").textContent = "Error: " + error.message; return; }

    // Update local match
    const idx = tMatches.findIndex(m => m.id === mid);
    if (idx !== -1) tMatches[idx] = { ...tMatches[idx], ...payload };

    // Update player stats if result entered
    if (enterScore) await updatePlayerStats(match, s1, s2, payload.winner_id);

    closeModal("match-score-modal");
    renderMatchesTab();
    renderBracketTab();
    renderStandingsTab();
    showToast(enterScore ? "Match result saved!" : "Match scheduled.");
  }

  async function updatePlayerStats(match, s1, s2, winnerId) {
    if (!window.sb) return;
    const p1 = tPlayers.find(p => p.id === match.player1_id);
    const p2 = tPlayers.find(p => p.id === match.player2_id);
    if (!p1 || !p2) return;
    const draw = s1 === s2;
    const p1pts = draw ? 1 : (winnerId === p1.id ? 3 : 0);
    const p2pts = draw ? 1 : (winnerId === p2.id ? 3 : 0);
    const updates = [
      [p1.id, p1pts, s1, s2, winnerId === p1.id, draw, !draw && winnerId !== p1.id],
      [p2.id, p2pts, s2, s1, winnerId === p2.id, draw, !draw && winnerId !== p2.id]
    ];
    for (const [pid, pts, gf, ga, win, dr, loss] of updates) {
      const p = tPlayers.find(x => x.id === pid);
      if (!p) continue;
      const update = {
        points: p.points + pts, wins: p.wins + (win ? 1 : 0),
        draws: p.draws + (dr ? 1 : 0), losses: p.losses + (loss ? 1 : 0),
        goals_for: p.goals_for + gf, goals_against: p.goals_against + ga
      };
      await window.sb.from("tournament_players").update(update).eq("id", pid);
      Object.assign(p, update);
    }
  }

  document.getElementById("ms-save-result")?.addEventListener("click", () => saveMatchResult(true));
  document.getElementById("ms-save-schedule")?.addEventListener("click", () => saveMatchResult(false));

  // ── STANDINGS TAB ─────────────────────────────────────────────────────────
  function renderStandingsTab() {
    const view = document.getElementById("td-standings-view");
    if (!view) return;
    if (!tPlayers.length) { view.innerHTML = '<p class="text-sm text-slate-500 text-center py-8 italic">No players yet.</p>'; return; }

    if (currentTournament?.format === "knockout") {
      const sorted = [...tPlayers].sort((a, b) => {
        const rank = (p) => p.status === "winner" ? 0 : p.status === "runner_up" ? 1 : p.status === "eliminated" ? 3 : 2;
        return rank(a) - rank(b) || b.wins - a.wins;
      });
      view.innerHTML = renderStandingsTable(sorted, false);
    } else {
      const groups = [...new Set(tPlayers.map(p => p.group_name).filter(Boolean))].sort();
      if (!groups.length) { view.innerHTML = '<p class="text-sm text-slate-500 text-center py-8 italic">Draw not generated yet.</p>'; return; }
      view.innerHTML = groups.map(g => {
        const gp = [...tPlayers.filter(p => p.group_name === g)].sort((a, b) =>
          b.points !== a.points ? b.points - a.points :
          (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)
        );
        return `<div class="mb-6"><p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider mb-2">Group ${esc(g)}</p>${renderStandingsTable(gp, true)}</div>`;
      }).join("");
    }
  }

  function renderStandingsTable(players, isGroups) {
    const cols = isGroups ? "grid-cols-[1fr_auto_auto_auto_auto_auto_auto]" : "grid-cols-[1fr_auto_auto]";
    return `
      <div class="panel rounded-2xl overflow-hidden">
        <div class="grid ${cols} text-[11px] text-slate-500 font-semibold px-4 py-2 bg-[#0f1520] border-b border-slate-700/60 gap-2">
          <span>Player</span>
          ${isGroups ? "<span class='text-center'>P</span><span class='text-center'>W</span><span class='text-center'>D</span><span class='text-center'>L</span><span class='text-center'>GD</span><span class='text-center text-[#d8ff45]'>Pts</span>" : "<span class='text-center'>Wins</span><span>Status</span>"}
        </div>
        <div class="divide-y divide-slate-800/80">
          ${players.map((p, i) => `
            <div class="grid ${cols} px-4 py-2.5 items-center text-sm gap-2 ${p.status === "winner" ? "bg-[#d8ff45]/5" : i < 2 && isGroups ? "bg-sky-500/5" : ""}">
              <div class="flex items-center gap-2 min-w-0">
                <span class="shrink-0">${p.status === "winner" ? "&#127942;" : i === 0 && isGroups ? "&#9650;" : `${i + 1}.`}</span>
                <span class="truncate ${p.status === "winner" ? "font-bold text-[#d8ff45]" : ""}">${esc(p.player_name)}</span>
              </div>
              ${isGroups
                ? `<span class='text-center text-slate-400 text-xs'>${p.wins + p.draws + p.losses}</span>
                   <span class='text-center text-xs'>${p.wins}</span>
                   <span class='text-center text-xs'>${p.draws}</span>
                   <span class='text-center text-xs'>${p.losses}</span>
                   <span class='text-center text-xs'>${p.goals_for - p.goals_against > 0 ? "+" : ""}${p.goals_for - p.goals_against}</span>
                   <span class='text-center font-bold text-[#d8ff45]'>${p.points}</span>`
                : `<span class='text-center text-xs'>${p.wins}</span>
                   <span class='text-xs capitalize text-slate-400'>${p.status}</span>`}
            </div>`).join("")}
        </div>
      </div>`;
  }

  // ── PRIZES & RULES TAB ────────────────────────────────────────────────────
  function renderPrizesTab() {
    const prizeList = document.getElementById("td-prize-list");
    const rules = document.getElementById("td-rules-text");
    if (!currentTournament) return;
    const prizes = Array.isArray(currentTournament.prize_pool) ? currentTournament.prize_pool : [];
    if (prizeList) {
      prizeList.innerHTML = prizes.length
        ? prizes.map((p, i) => `
          <div class="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
            <span class="text-xl shrink-0">${i === 0 ? "&#129351;" : i === 1 ? "&#129352;" : i === 2 ? "&#129353;" : "&#127885;"}</span>
            <div>
              <p class="font-semibold text-sm">${esc(p.place || `#${i + 1}`)}</p>
              <p class="text-xs text-[#d8ff45] font-bold">${esc(p.reward || "TBD")}</p>
            </div>
          </div>`).join("")
        : '<p class="text-sm text-slate-500">No prizes configured.</p>';
    }
    if (rules) rules.textContent = currentTournament.rules || "No rules specified.";
  }

  // ── CREATE / EDIT TOURNAMENT MODAL ────────────────────────────────────────
  function addPrizeRow(place = "", reward = "") {
    const container = document.getElementById("tm-prize-rows");
    if (!container) return;
    if (!place) {
      const currentCount = container.querySelectorAll(".tm-prize-row").length;
      if (currentCount === 0) place = "1st Place";
      else if (currentCount === 1) place = "2nd Place";
      else if (currentCount === 2) place = "3rd Place";
      else if (currentCount === 3) place = "Semi-Finalist";
      else if (currentCount === 4) place = "Semi-Finalist";
      else place = `${currentCount + 1}th Place`;
    }
    const row = document.createElement("div");
    row.className = "tm-prize-row grid grid-cols-[140px_1fr_auto] gap-2 items-center";
    row.innerHTML = `
      <input type="text" placeholder="e.g. 1st Place, Semi-Finalist" class="form-control text-xs py-2 tm-prize-place" value="${esc(place)}">
      <input type="text" placeholder="e.g. Rs 5,000 + Trophy" class="form-control text-xs py-2 tm-prize-reward" value="${esc(reward)}">
      <button type="button" class="tm-prize-remove h-8 w-8 rounded-lg border border-slate-600 text-slate-400 hover:text-red-300 hover:border-red-400 text-lg leading-none flex items-center justify-center cursor-pointer" title="Remove prize">&#215;</button>`;
    container.appendChild(row);
  }

  function openTournamentModal(tournament = null) {
    const form = document.getElementById("tournament-form");
    if (!form) return;
    form.reset();
    document.getElementById("tm-prize-rows").innerHTML = "";
    const title = document.getElementById("tournament-modal-title");
    const label = document.getElementById("tm-submit-label");

    if (tournament) {
      title.textContent = "Edit Tournament";
      label.textContent = "Save Changes";
      document.getElementById("tm-id").value = tournament.id;
      document.getElementById("tm-name").value = tournament.name || "";
      document.getElementById("tm-game").value = tournament.game || "EA FC 25";
      document.getElementById("tm-format").value = tournament.format || "knockout";
      document.getElementById("tm-max-players").value = tournament.max_players || 16;
      document.getElementById("tm-entry-fee").value = tournament.entry_fee || 0;
      document.getElementById("tm-description").value = tournament.description || "";
      document.getElementById("tm-rules").value = tournament.rules || "";
      document.getElementById("tm-show-homepage").checked = !!tournament.show_on_homepage;
      if (tournament.registration_deadline) document.getElementById("tm-reg-deadline").value = tournament.registration_deadline.slice(0, 16);
      if (tournament.start_date) document.getElementById("tm-start-date").value = tournament.start_date.slice(0, 16);
      const prizes = Array.isArray(tournament.prize_pool) ? tournament.prize_pool : [];
      prizes.forEach(p => addPrizeRow(p.place, p.reward));
      if (!prizes.length) { addPrizeRow("1st Place", ""); addPrizeRow("2nd Place", ""); }
    } else {
      title.textContent = "New Tournament";
      label.textContent = "Create Tournament";
      document.getElementById("tm-id").value = "";
      document.getElementById("tm-game").value = "EA FC 25";
      addPrizeRow("1st Place", "");
      addPrizeRow("2nd Place", "");
    }
    document.getElementById("tournament-form-msg").textContent = "";
    openModal("tournament-modal");
  }

  // Delegated click handling on document for prize rows and modal triggers
  document.addEventListener("click", (e) => {
    const addPrizeBtn = e.target.closest("#tm-add-prize");
    if (addPrizeBtn) {
      e.preventDefault();
      addPrizeRow();
      return;
    }
    const removePrizeBtn = e.target.closest(".tm-prize-remove");
    if (removePrizeBtn) {
      e.preventDefault();
      const row = removePrizeBtn.closest(".tm-prize-row");
      if (row) row.remove();
      return;
    }
    const closeTournamentBtn = e.target.closest("#tournament-modal-close");
    if (closeTournamentBtn) {
      e.preventDefault();
      closeModal("tournament-modal");
      return;
    }
    const closeMatchBtn = e.target.closest("#match-score-modal-close");
    if (closeMatchBtn) {
      e.preventDefault();
      closeModal("match-score-modal");
      return;
    }
  });

  document.getElementById("btn-create-tournament")?.addEventListener("click", () => openTournamentModal(null));
  document.getElementById("td-edit-btn")?.addEventListener("click", () => { if (currentTournament) openTournamentModal(currentTournament); });
  document.getElementById("tournament-modal")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal("tournament-modal"); });

  document.getElementById("tournament-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!window.sb) return;
    const msg = document.getElementById("tournament-form-msg");
    msg.textContent = "Saving...";

    const prizes = [...document.querySelectorAll(".tm-prize-row")].map(row => ({
      place: row.querySelector(".tm-prize-place")?.value.trim() || "",
      reward: row.querySelector(".tm-prize-reward")?.value.trim() || ""
    })).filter(p => p.place || p.reward);

    const payload = {
      name: document.getElementById("tm-name").value.trim(),
      game: document.getElementById("tm-game").value,
      format: document.getElementById("tm-format").value,
      max_players: Number(document.getElementById("tm-max-players").value) || 16,
      entry_fee: Number(document.getElementById("tm-entry-fee").value) || 0,
      description: document.getElementById("tm-description").value.trim() || null,
      rules: document.getElementById("tm-rules").value.trim() || null,
      show_on_homepage: document.getElementById("tm-show-homepage").checked,
      prize_pool: prizes,
      registration_deadline: document.getElementById("tm-reg-deadline").value ? new Date(document.getElementById("tm-reg-deadline").value).toISOString() : null,
      start_date: document.getElementById("tm-start-date").value ? new Date(document.getElementById("tm-start-date").value).toISOString() : null,
      updated_at: new Date().toISOString()
    };

    const existingId = document.getElementById("tm-id").value;
    let error;
    if (existingId) {
      ({ error } = await window.sb.from("tournaments").update(payload).eq("id", existingId));
    } else {
      payload.created_by = window.currentStaff?.name || "Admin";
      ({ error } = await window.sb.from("tournaments").insert(payload));
    }

    if (error) { msg.textContent = "Error: " + error.message; return; }
    msg.textContent = "";
    closeModal("tournament-modal");
    showToast(existingId ? "Tournament updated!" : "Tournament created!");
    await fetchTournaments();
    if (existingId && currentTournament?.id === existingId) {
      Object.assign(currentTournament, payload);
      renderPrizesTab();
    }
  });

  // ── Expose to dashboard.js ────────────────────────────────────────────────
  window._fetchTournaments = fetchTournaments;

  // Allow homepage registration form to insert a player via site.js
  window._registerForTournament = async function(tournamentId, playerData) {
    if (!window.sb) return { success: false, error: "Not connected" };
    const { data, error } = await window.sb.from("tournament_players").insert({
      tournament_id: tournamentId, ...playerData
    }).select().single();
    return error ? { success: false, error: error.message } : { success: true, data };
  };
})();
