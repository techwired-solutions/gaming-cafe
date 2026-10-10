
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

  // ── Utility & Bracket Math ──────────────────────────────────────────────
  function getNextPowerOf2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return Math.max(2, p);
  }

  function getKnockoutRoundName(roundNumber, totalRounds) {
    const remaining = Math.pow(2, totalRounds - roundNumber + 1);
    if (remaining === 2) return "Final";
    if (remaining === 4) return "Semi Final";
    if (remaining === 8) return "Quarter Final";
    return `Round of ${remaining}`;
  }

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showToast(msg) {
    if (typeof window.showToast === "function" && window.showToast !== showToast) {
      window.showToast(msg);
      return;
    }
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = msg;
      t.classList.add("toast-show");
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove("toast-show"), 3200);
    } else {
      console.log("[Toast]", msg);
    }
  }
  if (!window.showToast) window.showToast = showToast;

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
  // QR is cafe-wide (FonePay QR doesn't change per tournament)
  const BC_QR_STORAGE_KEY = "chillpill_cafe_fonepay_qr";
  let bcQrDataUrl = null;         // current QR image data URL
  let bcAllCustomers = [];        // { name, phone } deduped from sessions
  let bcSelectedPhones = new Set();

  function getBroadcastQrKey() {
    // Single cafe-wide key — same FonePay QR for all tournaments
    return BC_QR_STORAGE_KEY;
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

  function formatPrizePoolForBroadcast(prizePool) {
    if (!prizePool) return "";
    let prizes = prizePool;
    if (typeof prizes === "string") {
      try {
        prizes = JSON.parse(prizes);
      } catch (_) {
        return prizes.trim();
      }
    }
    if (Array.isArray(prizes)) {
      if (!prizes.length) return "";
      const valid = prizes.filter(p => {
        if (!p) return false;
        if (typeof p === "string" || typeof p === "number") return String(p).trim().length > 0;
        return (p.place && String(p.place).trim()) || (p.reward && String(p.reward).trim());
      });
      if (!valid.length) return "";
      return valid.map((p, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖️";
        if (typeof p === "string" || typeof p === "number") {
          return `${medal} ${p}`;
        }
        const place = (p.place || p.position || p.rank || `#${i + 1}`).trim();
        const reward = (p.reward || p.prize || p.amount || "").trim();
        if (place && reward) return `${medal} *${place}:* ${reward}`;
        if (reward) return `${medal} ${reward}`;
        return `${medal} *${place}*`;
      }).join("\n");
    }
    if (typeof prizes === "object") {
      const entries = Object.entries(prizes).filter(([k, v]) => v != null && String(v).trim() !== "");
      if (!entries.length) return "";
      return entries.map(([k, v], i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖️";
        return `${medal} *${k}:* ${v}`;
      }).join("\n");
    }
    return String(prizes).trim();
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

    const prizeText = formatPrizePoolForBroadcast(t.prize_pool);
    if (prizeText) {
      msg += `\n🏅 *Prize Pool:*\n${prizeText}\n`;
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

    // Fetch unique customers with phone numbers from the sessions table
    const { data, error } = await window.sb
      .from("sessions")
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

  function updateBroadcastPreview() {
    const msg = buildBroadcastMessage();
    const previewEl = document.getElementById("bc-message-preview");
    if (previewEl) previewEl.textContent = msg || "Select or open a tournament to preview message...";
    // Show QR preview inline
    const inlineWrap = document.getElementById("bc-qr-preview-inline");
    const inlineImg = document.getElementById("bc-qr-inline-img");
    if (bcQrDataUrl && inlineWrap && inlineImg) {
      inlineImg.src = bcQrDataUrl;
      inlineWrap.classList.remove("hidden");
    } else if (inlineWrap) {
      inlineWrap.classList.add("hidden");
    }
  }

  function initBroadcastTab() {
    loadBroadcastQr();
    loadBroadcastCustomers();

    // Default registration link if not set
    const regInput = document.getElementById("bc-reg-link");
    if (regInput && !regInput.value) {
      try {
        const origin = window.location.origin;
        const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1);
        regInput.value = `${origin}${path}tournament.html`;
      } catch (_) {}
    }

    // Auto-update message preview on input changes
    if (regInput && !regInput._bcWired) {
      regInput._bcWired = true;
      regInput.addEventListener("input", updateBroadcastPreview);
    }
    const extraNotes = document.getElementById("bc-extra-notes");
    if (extraNotes && !extraNotes._bcWired) {
      extraNotes._bcWired = true;
      extraNotes.addEventListener("input", updateBroadcastPreview);
    }

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
          updateBroadcastPreview();
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
        updateBroadcastPreview();
        showToast("QR code removed.");
      });
    }

    // Preview button
    const previewBtn = document.getElementById("bc-preview-btn");
    if (previewBtn && !previewBtn._bcWired) {
      previewBtn._bcWired = true;
      previewBtn.addEventListener("click", updateBroadcastPreview);
    }

    // Auto-render preview immediately
    updateBroadcastPreview();

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
  let regFilter = "all"; // "all" | "confirmed" | "registered"

  function renderRegistrationsTab() {
    const list = document.getElementById("td-registrations-list");
    const empty = document.getElementById("td-reg-empty");
    const count = document.getElementById("td-reg-count");
    const summary = document.getElementById("td-reg-summary");
    if (!list) return;

    const total = tPlayers.length;
    const confirmed = tPlayers.filter(p => p.status === "confirmed").length;
    const unpaid = tPlayers.filter(p => p.status === "registered").length;
    const maxSlots = currentTournament?.max_players || 16;
    if (count) count.textContent = `(${total})`;
    if (summary) {
      summary.innerHTML = `<span class="font-bold text-white">${total}</span> registered &middot; <span class="font-bold text-green-400">${confirmed} / ${maxSlots}</span> paid &amp; confirmed &middot; <span class="font-bold text-[#d8ff45]">${Math.max(0, maxSlots - confirmed)}</span> slot${maxSlots - confirmed === 1 ? "" : "s"} open`;
    }

    const search = (document.getElementById("td-reg-search")?.value || "").toLowerCase();
    const filtered = tPlayers.filter(p => {
      if (regFilter === "confirmed" && p.status !== "confirmed") return false;
      if (regFilter === "registered" && p.status !== "registered") return false;
      return (
        !search ||
        p.player_name.toLowerCase().includes(search) ||
        (p.gamertag || "").toLowerCase().includes(search) ||
        (p.phone || "").includes(search)
      );
    });

    if (empty) empty.classList.toggle("hidden", filtered.length > 0);
    if (!filtered.length) { list.innerHTML = ""; return; }

    list.innerHTML = filtered.map((p, i) => `
      <div class="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center text-sm ${p.status === "confirmed" ? "bg-green-500/[0.04]" : ""}">
        <span class="text-slate-500 text-xs mono w-5 text-right">${i + 1}</span>
        <div class="min-w-0">
          <p class="font-semibold truncate">${esc(p.player_name)}${p.gamertag ? ` <span class="text-xs text-slate-400 font-normal">(${esc(p.gamertag)})</span>` : ""}</p>
          <p class="text-xs text-slate-400 truncate">${esc(p.phone)}${p.group_name ? ` &middot; Grp ${esc(p.group_name)}` : ""}${p.team_name ? ` &middot; ${esc(p.team_name)}` : ""}</p>
        </div>
        <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
          p.status === "confirmed" ? "bg-green-500/20 text-green-300 border border-green-500/40" :
          p.status === "eliminated" ? "bg-red-500/10 text-red-400 border border-red-500/30" :
          p.status === "winner" ? "bg-[#d8ff45]/20 text-[#d8ff45] border border-[#d8ff45]/40" :
          p.status === "runner_up" ? "bg-sky-500/20 text-sky-300 border border-sky-500/40" :
          "bg-amber-500/15 text-amber-300 border border-amber-500/30"}">
          ${p.status === "confirmed" ? "✓ Paid / Confirmed" : p.status === "registered" ? "Unpaid (Registered)" : p.status}
        </span>
        <div class="flex gap-1.5 shrink-0">
          ${p.status === "registered" ? `<button class="confirm-player-btn text-[11px] font-bold text-green-300 bg-green-500/10 border border-green-500/40 rounded-lg px-2.5 py-1 hover:bg-green-500/20 transition cursor-pointer flex items-center gap-1" data-pid="${p.id}" title="Mark entry fee paid & confirm tournament slot">✓ Confirm Paid</button>` : ""}
          ${p.status === "confirmed" ? `<button class="revoke-player-btn text-[11px] font-bold text-amber-300 border border-amber-500/40 rounded-lg px-2.5 py-1 hover:bg-amber-500/10 transition cursor-pointer" data-pid="${p.id}" title="Revert to unpaid registered">Revoke</button>` : ""}
        </div>
        <button class="remove-player-btn text-slate-500 hover:text-red-300 transition text-xl leading-none shrink-0 cursor-pointer" data-pid="${p.id}" title="Remove">&#215;</button>
      </div>`).join("");

    list.querySelectorAll(".confirm-player-btn").forEach(btn =>
      btn.addEventListener("click", () => updatePlayerStatus(btn.dataset.pid, "confirmed")));
    list.querySelectorAll(".revoke-player-btn").forEach(btn =>
      btn.addEventListener("click", () => updatePlayerStatus(btn.dataset.pid, "registered")));
    list.querySelectorAll(".remove-player-btn").forEach(btn =>
      btn.addEventListener("click", () => removePlayer(btn.dataset.pid)));
  }

  document.getElementById("td-reg-search")?.addEventListener("input", renderRegistrationsTab);

  document.querySelectorAll(".td-reg-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      regFilter = btn.dataset.filter;
      document.querySelectorAll(".td-reg-filter-btn").forEach(b => {
        const active = b.dataset.filter === regFilter;
        b.className = active
          ? "td-reg-filter-btn active rounded-lg px-2.5 py-1 text-xs font-bold border border-[#d8ff45] bg-[#d8ff45]/15 text-[#d8ff45] transition cursor-pointer"
          : "td-reg-filter-btn rounded-lg px-2.5 py-1 text-xs font-bold border border-transparent text-slate-400 hover:text-slate-200 transition cursor-pointer";
      });
      renderRegistrationsTab();
    });
  });

  async function updatePlayerStatus(pid, status) {
    if (!window.sb) return;
    const maxSlots = currentTournament?.max_players || 16;
    const confirmedCount = tPlayers.filter(p => p.status === "confirmed").length;
    if (status === "confirmed" && confirmedCount >= maxSlots) {
      if (!confirm(`Notice: All ${maxSlots} target slots are already filled by confirmed players (${confirmedCount} confirmed). Do you still want to confirm this player?`)) {
        return;
      }
    }
    const { error } = await window.sb.from("tournament_players").update({ status }).eq("id", pid);
    if (error) return showToast("Error: " + error.message);
    const p = tPlayers.find(x => x.id === pid);
    if (p) p.status = status;
    renderRegistrationsTab();
    showToast(status === "confirmed" ? "Player marked as Paid & Confirmed!" : `Player status set to ${status}.`);
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

  // ── AUTOMATIC KNOCKOUT PROGRESSION TREE ───────────────────────────────────
  async function advanceWinnerToNextRoundSlot(match, winnerId) {
    if (!currentTournament || !window.sb || !winnerId) return;
    if (currentTournament.format !== "knockout") return;

    const curRound = match.round_number || 1;
    const nextRound = curRound + 1;
    const nextMatchNum = Math.ceil(match.match_number / 2);
    const isOdd = match.match_number % 2 === 1;

    let targetMatch = tMatches.find(m => (m.round_number || 1) === nextRound && m.match_number === nextMatchNum);

    if (targetMatch) {
      const update = isOdd ? { player1_id: winnerId } : { player2_id: winnerId };
      const { error } = await window.sb.from("tournament_matches").update(update).eq("id", targetMatch.id);
      if (!error) {
        Object.assign(targetMatch, update);
      }
    } else {
      // Auto-create next round match if it wasn't pre-generated (fallback for custom brackets)
      const curRoundMatches = tMatches.filter(m => (m.round_number || 1) === curRound);
      const nextRoundCount = Math.max(1, Math.ceil(curRoundMatches.length / 2));
      const nextRoundName = nextRoundCount === 1 ? "Final" : nextRoundCount === 2 ? "Semi Final" : nextRoundCount === 4 ? "Quarter Final" : `Round of ${nextRoundCount * 2}`;

      const newMatchPayload = {
        tournament_id: currentTournament.id,
        round_name: nextRoundName,
        round_number: nextRound,
        match_number: nextMatchNum,
        player1_id: isOdd ? winnerId : null,
        player2_id: !isOdd ? winnerId : null,
        status: "scheduled"
      };

      const { data: inserted, error } = await window.sb.from("tournament_matches").insert(newMatchPayload).select().single();
      if (!error && inserted) {
        tMatches.push(inserted);
      }
    }
  }

  async function rollbackWinnerFromNextRoundSlot(match, oldWinnerId) {
    if (!currentTournament || !window.sb || !oldWinnerId) return;
    if (currentTournament.format !== "knockout") return;

    const curRound = match.round_number || 1;
    const nextRound = curRound + 1;
    const nextMatchNum = Math.ceil(match.match_number / 2);
    const isOdd = match.match_number % 2 === 1;

    const targetMatch = tMatches.find(m => (m.round_number || 1) === nextRound && m.match_number === nextMatchNum);
    if (targetMatch) {
      const update = isOdd ? { player1_id: null } : { player2_id: null };
      await window.sb.from("tournament_matches").update(update).eq("id", targetMatch.id);
      Object.assign(targetMatch, update);
    }
  }

  // ── TOURNAMENT HONORS & GOLDEN BOOT CALCULATION ─────────────────────────
  function calculateTournamentHonors() {
    const confirmed = tPlayers.filter(p => p.status !== "registered");
    if (!confirmed.length) return null;

    // 1. Champion
    let champion = confirmed.find(p => p.status === "winner");
    // 2. Runner-Up
    let runnerUp = confirmed.find(p => p.status === "runner_up");

    const finalMatch = tMatches.find(m => m.round_name?.toLowerCase() === "final" && m.status === "completed");
    if (finalMatch) {
      if (!champion && finalMatch.winner_id) {
        champion = confirmed.find(p => p.id === finalMatch.winner_id);
      }
      if (!runnerUp && finalMatch.winner_id) {
        const loserId = finalMatch.winner_id === finalMatch.player1_id ? finalMatch.player2_id : finalMatch.player1_id;
        runnerUp = confirmed.find(p => p.id === loserId);
      }
    }

    // 3. Semi-Finalists
    const semiMatches = tMatches.filter(m => m.round_name?.toLowerCase() === "semi final" && m.status === "completed");
    const semiFinalists = [];
    semiMatches.forEach(sm => {
      if (sm.winner_id) {
        const loserId = sm.winner_id === sm.player1_id ? sm.player2_id : sm.player1_id;
        const loser = confirmed.find(p => p.id === loserId);
        if (loser && !semiFinalists.some(x => x.id === loser.id)) {
          semiFinalists.push(loser);
        }
      }
    });

    // 4. Highest Goal Scorer (Golden Boot)
    const scorers = confirmed
      .filter(p => (p.goals_for || 0) > 0)
      .sort((a, b) => {
        if ((b.goals_for || 0) !== (a.goals_for || 0)) return (b.goals_for || 0) - (a.goals_for || 0);
        const playedA = (a.wins || 0) + (a.draws || 0) + (a.losses || 0);
        const playedB = (b.wins || 0) + (b.draws || 0) + (b.losses || 0);
        return playedA - playedB; // fewer matches played = superior goals-per-match
      });

    const topScorer = scorers.length > 0 ? scorers[0] : null;
    const jointTopScorers = scorers.filter(p => (p.goals_for || 0) === (topScorer?.goals_for || 0));

    return {
      champion,
      runnerUp,
      semiFinalists,
      topScorer,
      jointTopScorers,
      topGoals: topScorer?.goals_for || 0
    };
  }

  function renderHonorsCardHtml(honors) {
    if (!honors) return "";
    const champName = honors.champion ? esc(honors.champion.player_name) : "TBD";
    const champTag = honors.champion?.gamertag ? `(${esc(honors.champion.gamertag)})` : "";
    const runnerName = honors.runnerUp ? esc(honors.runnerUp.player_name) : "TBD";
    const runnerTag = honors.runnerUp?.gamertag ? `(${esc(honors.runnerUp.gamertag)})` : "";
    const semisText = honors.semiFinalists.length
      ? honors.semiFinalists.map(s => esc(s.player_name)).join(", ")
      : "In Progress (TBD)";

    let goldenBootText = "In Contention";
    let goldenBootSub = "Live goal tracking";
    if (honors.topScorer) {
      const names = honors.jointTopScorers.map(s => esc(s.player_name)).join(" & ");
      goldenBootText = `${names}`;
      const p = honors.topScorer;
      const matchesCount = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
      const gpm = matchesCount > 0 ? (p.goals_for / matchesCount).toFixed(1) : p.goals_for;
      goldenBootSub = `⚽ ${p.goals_for} Goals (${gpm} GPM) · ${matchesCount} Matches`;
    }

    return `
      <div class="panel rounded-2xl p-4 sm:p-5 mb-5 border border-[#d8ff45]/30 bg-gradient-to-br from-[#0c121d] via-[#101826] to-[#0b1019] shadow-xl">
        <div class="flex items-center justify-between mb-3.5">
          <div class="flex items-center gap-2">
            <span class="text-xl">🏆</span>
            <div>
              <h4 class="text-xs font-black uppercase tracking-wider text-white">Tournament Honors &amp; Awards</h4>
              <p class="text-[11px] text-slate-400">Podium contenders and Golden Boot highest goal scorer</p>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- 🥇 Champion -->
          <div class="rounded-xl border border-[#d8ff45]/40 bg-[#d8ff45]/5 p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#d8ff45]/20 flex items-center justify-center text-xl shrink-0">🥇</div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase tracking-wider text-[#d8ff45] font-bold">Champion (Winner)</span>
              <p class="font-extrabold text-sm text-white truncate">${champName} <span class="text-xs text-slate-400 font-normal">${champTag}</span></p>
            </div>
          </div>
          <!-- 🥈 Runner-Up -->
          <div class="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-xl shrink-0">🥈</div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase tracking-wider text-sky-400 font-bold">Finalist (Runner-Up)</span>
              <p class="font-extrabold text-sm text-white truncate">${runnerName} <span class="text-xs text-slate-400 font-normal">${runnerTag}</span></p>
            </div>
          </div>
          <!-- 🥉 Semi-Finalists -->
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">🥉</div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Semi-Finalists</span>
              <p class="font-bold text-xs text-slate-200 truncate">${semisText}</p>
            </div>
          </div>
          <!-- ⚽ Golden Boot -->
          <div class="rounded-xl border border-[#d8ff45]/40 bg-gradient-to-r from-amber-500/10 to-[#d8ff45]/10 p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#d8ff45]/20 flex items-center justify-center text-xl shrink-0">⚽</div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase tracking-wider text-[#d8ff45] font-bold">Highest Goal Scorer</span>
              <p class="font-extrabold text-sm text-white truncate">${goldenBootText}</p>
              <p class="text-[10px] text-slate-400 font-mono truncate">${goldenBootSub}</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  document.getElementById("td-generate-draw")?.addEventListener("click", async () => {
    if (!currentTournament || !window.sb) return;
    const confirmed = tPlayers.filter(p => p.status === "confirmed");
    if (confirmed.length < 2) return showToast("Need at least 2 confirmed players to conduct a draw.");

    const hasMatches = tMatches.length > 0;
    const msg = hasMatches
      ? `Generate a new draw for ${confirmed.length} confirmed players? Existing matches will be cleared and the new draw will be revealed live on the big screen.`
      : `Launch the Live Draw Ceremony for ${confirmed.length} confirmed players? Fixtures will be generated and revealed on the big screen.`;

    if (!confirm(msg)) return;

    if (hasMatches) {
      await window.sb.from("tournament_matches").delete().eq("tournament_id", currentTournament.id);
      tMatches = [];
      renderBracketTab();
      renderMatchesTab();
      renderStandingsTab();
    }

    openLiveDrawCeremony(true);
  });

  // ── BRACKET / DRAW TAB ───────────────────────────────────────────────────
  function renderBracketTab() {
    const view = document.getElementById("td-bracket-view");
    const roundBadge = document.getElementById("td-bracket-round-badge");
    if (!view) return;
    if (!tMatches.length) {
      if (roundBadge) roundBadge.textContent = "Draw Pending";
      view.innerHTML = `
        <div class="text-center py-10 px-4 border border-dashed border-slate-700/80 rounded-2xl bg-[#0b1019]/60">
          <div class="w-14 h-14 rounded-2xl bg-[#d8ff45]/15 border border-[#d8ff45]/30 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-[#d8ff45]/10">🎰</div>
          <h4 class="font-bold text-base text-white">Live Draw Ceremony Pending</h4>
          <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">Fixtures are kept confidential until drawn live! Project the wheel spin on the big screen to reveal match pairings with drama and suspense.</p>
          <button type="button" id="btn-bracket-start-ceremony" class="mt-4 px-5 py-2.5 rounded-xl font-bold text-xs bg-[#d8ff45] text-[#10141e] hover:brightness-110 shadow-lg shadow-[#d8ff45]/20 inline-flex items-center gap-2 cursor-pointer transition">
            <i data-lucide="tv" width="14" height="14"></i> Launch Big Screen Draw Ceremony
          </button>
        </div>`;
      view.querySelector("#btn-bracket-start-ceremony")?.addEventListener("click", () => openLiveDrawCeremony(true));
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Sort round numbers ascending: Round 1, Round 2 (Quarters), Round 3 (Semis), Final
    const roundNumbers = [...new Set(tMatches.map(m => m.round_number || 1))].sort((a, b) => a - b);
    const maxRoundNum = Math.max(...roundNumbers);
    const currentRoundMatch = tMatches.find(m => (m.round_number || 1) === maxRoundNum);
    if (roundBadge) {
      roundBadge.textContent = currentRoundMatch?.round_name || `Round ${maxRoundNum}`;
    }

    const autoProgNotice = currentTournament?.format === "knockout" ? `
      <div class="flex items-center justify-between mb-4 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs">
        <span class="text-sky-300 font-semibold flex items-center gap-2">
          <i data-lucide="zap" width="14" height="14"></i>
          <span>Auto-Progression Active: Match 1 winner faces Match 2 winner, Match 3 faces Match 4, etc. Saving a match advances the winner automatically!</span>
        </span>
      </div>` : "";

    view.innerHTML = autoProgNotice + roundNumbers.map(rNum => {
      const rMatches = tMatches.filter(m => (m.round_number || 1) === rNum).sort((a, b) => a.match_number - b.match_number);
      const rn = rMatches[0]?.round_name || `Round ${rNum}`;

      return `
        <div>
          <div class="flex items-center justify-between mb-2 mt-4 first:mt-0">
            <p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider">${esc(rn)}</p>
            <span class="text-[11px] text-slate-500 font-mono">${rMatches.length} match${rMatches.length === 1 ? "" : "es"}</span>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${rMatches.map(m => {
              const p1 = tPlayers.find(p => p.id === m.player1_id);
              const p2 = tPlayers.find(p => p.id === m.player2_id);
              const isBye = m.status === "bye";

              const p1Label = p1
                ? esc(p1.player_name)
                : (rNum > 1 ? `<span class="text-slate-500 italic">Winner Match ${2 * m.match_number - 1}</span>` : "TBD");

              const p2Label = p2
                ? esc(p2.player_name)
                : (isBye
                  ? '<span class="text-emerald-400 font-bold">🌟 LUCKY BYE</span>'
                  : (rNum > 1 ? `<span class="text-slate-500 italic">Winner Match ${2 * m.match_number}</span>` : "TBD"));

              return `
                <div class="rounded-xl border ${m.status === "completed" ? "border-[#d8ff45]/30 bg-[#d8ff45]/5" : isBye ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-700 bg-[#0f1520]"} p-3">
                  <div class="flex items-center justify-between text-[11px] mb-2">
                    <span class="text-slate-500">Match ${m.match_number}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${m.status === "completed" ? "bg-[#d8ff45]/20 text-[#d8ff45] font-bold" : isBye ? "bg-emerald-500/20 text-emerald-300 font-bold" : "bg-slate-800 text-slate-400"}">${isBye ? "BYE / ADVANCES" : m.status}</span>
                  </div>
                  <div class="space-y-1.5 text-sm">
                    <div class="flex justify-between ${m.winner_id && m.winner_id === m.player1_id ? "text-[#d8ff45] font-bold" : ""}">
                      <span class="truncate">${p1Label}</span>
                      <span class="mono ml-2 shrink-0">${m.status === "completed" ? (m.player1_score ?? 0) : "—"}</span>
                    </div>
                    <div class="flex justify-between ${m.winner_id && m.winner_id === m.player2_id ? "text-[#d8ff45] font-bold" : ""}">
                      <span class="truncate">${p2Label}</span>
                      <span class="mono ml-2 shrink-0">${m.status === "completed" ? (m.player2_score ?? 0) : "—"}</span>
                    </div>
                  </div>
                  ${m.winner_id ? `<p class="text-[11px] text-[#d8ff45] mt-2 font-bold">&#127942; Advanced: ${esc(tPlayers.find(p => p.id === m.winner_id)?.player_name || "")}</p>` : ""}
                  ${!isBye ? `
                    <div class="mt-2.5 pt-2 border-t border-slate-800/80 flex justify-end">
                      <button class="bracket-score-btn text-[11px] font-bold border rounded-lg px-2.5 py-1 transition cursor-pointer ${
                        m.status === "completed" ? "border-slate-600 text-slate-300 hover:border-sky-400 hover:text-sky-300" :
                        "border-[#d8ff45]/50 text-[#d8ff45] hover:bg-[#d8ff45]/10"
                      }" data-mid="${m.id}">${m.status === "completed" ? "Edit Result" : "Enter Result"}</button>
                    </div>
                  ` : ""}
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");

    view.querySelectorAll(".bracket-score-btn").forEach(btn =>
      btn.addEventListener("click", () => openMatchScoreModal(btn.dataset.mid)));

    if (window.lucide) lucide.createIcons({ nodes: [view] });
  }

  // ── GENERATE NEXT ROUND KNOCKOUT FIXTURES (FALLBACK / MANUAL SYNC) ────────
  async function generateNextRound() {
    if (!currentTournament || !window.sb) return;
    if (currentTournament.format !== "knockout") {
      return showToast("Group stage tournaments require group completion before knockout.");
    }

    const tid = currentTournament.id;
    const round1Matches = tMatches.filter(m => (m.round_number || 1) === 1);
    if (!round1Matches.length) {
      return showToast("No Round 1 fixtures found. Launch Draw Ceremony or Reset Draw first.");
    }

    const B = round1Matches.length * 2;
    const totalRounds = Math.log2(B);
    const existingRounds = new Set(tMatches.map(m => m.round_number || 1));

    // Check if any rounds are missing (e.g. Quarter Finals, Semis, Final)
    const missingMatches = [];
    for (let r = 2; r <= totalRounds; r++) {
      if (!existingRounds.has(r)) {
        const roundMatchesCount = B / Math.pow(2, r);
        const roundName = getKnockoutRoundName(r, totalRounds);
        for (let m = 1; m <= roundMatchesCount; m++) {
          missingMatches.push({
            tournament_id: tid,
            round_name: roundName,
            round_number: r,
            match_number: m,
            player1_id: null,
            player2_id: null,
            status: "scheduled",
            player1_score: null,
            player2_score: null
          });
        }
      }
    }

    if (missingMatches.length) {
      showToast("Generating missing knockout fixtures...");
      const { data: inserted, error } = await window.sb.from("tournament_matches").insert(missingMatches).select();
      if (error) {
        return showToast("Error generating fixtures: " + error.message);
      }
      if (inserted) {
        tMatches = tMatches.concat(inserted);
      }
    }

    // Now auto-seed any completed Round 1 matches / Byes into their next slots
    for (const m of tMatches) {
      if ((m.status === "completed" || m.status === "bye") && m.winner_id) {
        await advanceWinnerToNextRoundSlot(m, m.winner_id);
      }
    }

    await loadTournamentData(tid);
    showToast("Knockout bracket synced! All rounds (Quarter Finals, Semis, Final) are ready. Click 'Enter Result' on any match card to enter scores.");
  }

  document.getElementById("td-generate-next-round")?.addEventListener("click", generateNextRound);
  document.getElementById("td-matches-next-round-btn")?.addEventListener("click", generateNextRound);

  // ── MATCHES TAB ───────────────────────────────────────────────────────────
  function renderMatchesTab() {
    const list = document.getElementById("td-matches-list");
    const empty = document.getElementById("td-matches-empty");
    const filter = document.getElementById("td-match-round-filter");
    if (!list) return;

    // Sort matches by round_number ascending, then match_number
    const sortedAll = [...tMatches].sort((a, b) => ((a.round_number || 1) - (b.round_number || 1)) || (a.match_number - b.match_number));
    const rounds = [...new Set(sortedAll.map(m => m.round_name))];

    if (filter) {
      const cur = filter.value;
      filter.innerHTML = '<option value="all">All Rounds</option>' +
        rounds.map(r => `<option value="${esc(r)}" ${cur === r ? "selected" : ""}>${esc(r)}</option>`).join("");
    }

    const activeFilter = filter?.value || "all";
    const filtered = activeFilter === "all" ? sortedAll : sortedAll.filter(m => m.round_name === activeFilter);
    if (empty) empty.classList.toggle("hidden", filtered.length > 0);
    if (!filtered.length) { list.innerHTML = ""; return; }

    const isKnockout = currentTournament?.format === "knockout";

    list.innerHTML = filtered.map(m => {
      const p1 = tPlayers.find(p => p.id === m.player1_id);
      const p2 = tPlayers.find(p => p.id === m.player2_id);

      // In knockout format, tournament happens in one day: only show time (or TBD)
      let sched = "Time TBD";
      if (m.scheduled_at) {
        sched = isKnockout
          ? new Date(m.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
          : new Date(m.scheduled_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
      }

      const prevM1 = (m.match_number * 2) - 1;
      const prevM2 = m.match_number * 2;
      const p1Default = (m.round_number || 1) > 1 ? `Winner Match ${prevM1}` : "TBD";
      const p2Default = m.status === "bye" ? "🌟 LUCKY BYE" : ((m.round_number || 1) > 1 ? `Winner Match ${prevM2}` : "TBD");

      const p1Label = p1
        ? esc(p1.player_name)
        : `<span class="italic text-slate-500 font-mono text-[11px]">${p1Default}</span>`;
      const p2Label = p2
        ? esc(p2.player_name)
        : (m.status === "bye"
            ? '<span class="text-amber-400 font-bold">🌟 LUCKY BYE</span>'
            : `<span class="italic text-slate-500 font-mono text-[11px]">${p2Default}</span>`);

      return `
        <div class="panel rounded-xl p-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">${esc(m.round_name)} &middot; Match ${m.match_number}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full ${
                  m.status === "completed" ? "bg-[#d8ff45]/20 text-[#d8ff45]" :
                  m.status === "ongoing" ? "bg-sky-500/20 text-sky-300 animate-pulse" :
                  m.status === "bye" ? "bg-amber-500/20 text-amber-300 font-bold" :
                  "bg-slate-700 text-slate-400"}">${m.status}</span>
                ${m.station_name ? `<span class="text-[10px] text-slate-400 font-semibold bg-slate-800 px-2 py-0.5 rounded">${esc(m.station_name)}</span>` : ""}
                <span class="text-[10px] text-slate-500">&#128336; ${sched}</span>
              </div>
              <div class="flex items-center gap-3 text-sm">
                <span class="font-bold truncate ${m.winner_id === m.player1_id ? "text-[#d8ff45]" : ""}">${p1Label}</span>
                <span class="mono font-black text-lg shrink-0 ${m.status === "completed" ? "text-white" : "text-slate-700"}">
                  ${m.status === "completed" ? `${m.player1_score ?? 0}&ndash;${m.player2_score ?? 0}` : (m.status === "bye" ? "ADV" : "vs")}
                </span>
                <span class="font-bold truncate ${m.winner_id === m.player2_id ? "text-[#d8ff45]" : ""}">${p2Label}</span>
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              ${m.status !== "bye" ? `
                <button class="open-match-score-btn text-xs font-bold border rounded-lg px-3 py-2 transition cursor-pointer ${
                  m.status === "completed" ? "border-slate-600 text-slate-300 hover:border-sky-400 hover:text-sky-300" :
                  "border-[#d8ff45]/50 text-[#d8ff45] hover:bg-[#d8ff45]/10"
                }" data-mid="${m.id}">${m.status === "completed" ? "Edit Result" : "Enter Result"}</button>
                ${(m.status === "completed" || m.status === "ongoing" || m.player1_score != null || m.player2_score != null) ? `
                  <button class="quick-revoke-match-btn text-xs font-bold border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 rounded-lg px-2.5 py-2 transition flex items-center gap-1 cursor-pointer" data-mid="${m.id}" title="Reset match scores & revert status to scheduled">
                    <i data-lucide="rotate-ccw" width="12" height="12"></i>Reset
                  </button>
                ` : ""}
              ` : '<span class="text-xs text-amber-400 font-semibold italic">🌟 Lucky Bye</span>'}
            </div>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll(".open-match-score-btn").forEach(btn =>
      btn.addEventListener("click", () => openMatchScoreModal(btn.dataset.mid)));
    list.querySelectorAll(".quick-revoke-match-btn").forEach(btn =>
      btn.addEventListener("click", () => resetParticularMatch(btn.dataset.mid)));

    if (window.lucide) lucide.createIcons();
  }

  document.getElementById("td-match-round-filter")?.addEventListener("change", renderMatchesTab);

  // ── MATCH SCORE MODAL ─────────────────────────────────────────────────────
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

    const revokeBtn = document.getElementById("ms-revoke-result");
    if (revokeBtn) {
      revokeBtn.classList.toggle("hidden", match.status !== "completed" && match.status !== "ongoing" && match.player1_score == null && match.player2_score == null);
    }

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

    // If match was already completed previously, roll back old stats first before applying new stats
    if (enterScore && match.status === "completed") {
      await rollbackPlayerStats(match, match.player1_score ?? 0, match.player2_score ?? 0, match.winner_id);
    }

    // Update local match
    const idx = tMatches.findIndex(m => m.id === mid);
    if (idx !== -1) tMatches[idx] = { ...tMatches[idx], ...payload };
    const updatedMatch = tMatches[idx] || { ...match, ...payload };

    // Update player stats and tree progression if result entered
    if (enterScore) {
      await updatePlayerStats(match, s1, s2, payload.winner_id);

      // Auto-advance winner to next round slot in knockout format
      if (currentTournament?.format === "knockout" && payload.winner_id) {
        await advanceWinnerToNextRoundSlot(updatedMatch, payload.winner_id);
      }

      // In knockout format, check if Final completed to crown Champion & Finalist
      const isFinal = match.round_name?.toLowerCase() === "final" ||
        (currentTournament?.format === "knockout" && !tMatches.some(m => (m.round_number || 1) > (match.round_number || 1)));

      if (currentTournament?.format === "knockout" && isFinal && payload.winner_id) {
        const loserId = payload.winner_id === match.player1_id ? match.player2_id : match.player1_id;
        if (loserId) {
          await window.sb.from("tournament_players").update({ status: "runner_up" }).eq("id", loserId);
          const lp = tPlayers.find(p => p.id === loserId);
          if (lp) lp.status = "runner_up";
        }
        await window.sb.from("tournament_players").update({ status: "winner" }).eq("id", payload.winner_id);
        const wp = tPlayers.find(p => p.id === payload.winner_id);
        if (wp) wp.status = "winner";

        await window.sb.from("tournaments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", currentTournament.id);
        currentTournament.status = "completed";
        const tIdx = tournaments.findIndex(t => t.id === currentTournament.id);
        if (tIdx !== -1) tournaments[tIdx].status = "completed";
      }
    }

    closeModal("match-score-modal");
    renderMatchesTab();
    renderBracketTab();
    renderStandingsTab();
    showToast(enterScore ? "Match result saved & winner advanced!" : "Match scheduled.");
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
        points: (p.points || 0) + pts,
        wins: (p.wins || 0) + (win ? 1 : 0),
        draws: (p.draws || 0) + (dr ? 1 : 0),
        losses: (p.losses || 0) + (loss ? 1 : 0),
        goals_for: (p.goals_for || 0) + gf,
        goals_against: (p.goals_against || 0) + ga
      };

      // In knockout format, tag status if Final
      if (currentTournament?.format === "knockout" && match.round_name?.toLowerCase().includes("final") && !match.round_name?.toLowerCase().includes("semi") && !match.round_name?.toLowerCase().includes("quarter")) {
        if (winnerId === pid) update.status = "winner";
        else if (winnerId) update.status = "runner_up";
      }

      await window.sb.from("tournament_players").update(update).eq("id", pid);
      Object.assign(p, update);
    }
  }

  async function rollbackPlayerStats(match, s1, s2, winnerId) {
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
        points: Math.max(0, (p.points || 0) - pts),
        wins: Math.max(0, (p.wins || 0) - (win ? 1 : 0)),
        draws: Math.max(0, (p.draws || 0) - (dr ? 1 : 0)),
        losses: Math.max(0, (p.losses || 0) - (loss ? 1 : 0)),
        goals_for: Math.max(0, (p.goals_for || 0) - gf),
        goals_against: Math.max(0, (p.goals_against || 0) - ga)
      };
      if (["winner", "runner_up", "eliminated"].includes(p.status)) {
        update.status = "confirmed";
      }
      await window.sb.from("tournament_players").update(update).eq("id", pid);
      Object.assign(p, update);
    }
  }

  // ── RESET PARTICULAR MATCH ───────────────────────────────────────────────────
  async function resetParticularMatch(mid) {
    if (!window.sb) return;
    const match = tMatches.find(m => m.id === mid);
    if (!match) return;

    if (!confirm("Reset this match? This will clear recorded scores, set status back to 'scheduled', and revert player stats.")) {
      return;
    }

    const s1 = match.player1_score ?? 0;
    const s2 = match.player2_score ?? 0;
    const wid = match.winner_id;

    // Rollback player stats if match was completed or had scores recorded
    if (match.status === "completed" || s1 > 0 || s2 > 0 || wid) {
      await rollbackPlayerStats(match, s1, s2, wid);
    }

    // If winner was slotted into subsequent round matches, revert that slot to null
    if (wid) {
      const nextRoundMatches = tMatches.filter(m => (m.round_number || 1) > (match.round_number || 1) && m.status !== "completed");
      for (const nm of nextRoundMatches) {
        if (nm.player1_id === wid) {
          await window.sb.from("tournament_matches").update({ player1_id: null }).eq("id", nm.id);
          nm.player1_id = null;
        } else if (nm.player2_id === wid) {
          await window.sb.from("tournament_matches").update({ player2_id: null }).eq("id", nm.id);
          nm.player2_id = null;
        }
      }
    }

    const matchReset = {
      status: "scheduled",
      player1_score: null,
      player2_score: null,
      winner_id: null
    };

    const { error } = await window.sb.from("tournament_matches").update(matchReset).eq("id", mid);
    if (error) return showToast("Reset error: " + error.message);

    Object.assign(match, matchReset);
    closeModal("match-score-modal");
    renderMatchesTab();
    renderBracketTab();
    renderStandingsTab();
    showToast("Match reset to scheduled successfully.");
  }
  const revokeMatchResult = resetParticularMatch;

  // ── RESET WHOLE TOURNAMENT MATCHES & STANDINGS ───────────────────────────
  function openResetTournamentModal() {
    if (!currentTournament) return showToast("Please select a tournament first.");
    openModal("reset-tournament-modal");
    if (window.lucide) lucide.createIcons();
  }

  async function resetTournamentScoresAndStandings(wipeAllMatches = false) {
    if (!currentTournament || !window.sb) return;
    const tid = currentTournament.id;

    const actionPrompt = wipeAllMatches
      ? `Are you sure you want to WIPE ALL MATCHES and reset all player standings for "${currentTournament.title || currentTournament.name || 'this tournament'}"?\n\nThis will completely remove the draw fixtures and reset all player stats to zero.`
      : `Are you sure you want to reset ALL SCORES and standings for "${currentTournament.title || currentTournament.name || 'this tournament'}"?\n\nThis will clear match results, delete any generated playoff rounds (Quarter/Semi/Finals), and reset player stats to 0 while keeping Round 1 draw fixtures intact.`;

    if (!confirm(actionPrompt)) return;

    const wipeBtn = document.getElementById("btn-do-wipe-matches");
    const scoresBtn = document.getElementById("btn-do-reset-scores");
    if (wipeBtn) wipeBtn.disabled = true;
    if (scoresBtn) scoresBtn.disabled = true;

    try {
      showToast("Resetting tournament data in database...");

      // 1. Reset all players' standings in tournament_players (only valid columns)
      const playerResetPayload = {
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0
      };

      const { error: pErr1 } = await window.sb
        .from("tournament_players")
        .update(playerResetPayload)
        .eq("tournament_id", tid);
      if (pErr1) console.warn("[CP] Reset player stats warning:", pErr1);

      // Restore any eliminated/winner/runner_up players back to confirmed
      const { error: pErr2 } = await window.sb
        .from("tournament_players")
        .update({ status: "confirmed" })
        .eq("tournament_id", tid)
        .in("status", ["winner", "runner_up", "eliminated"]);
      if (pErr2) console.warn("[CP] Restore player status warning:", pErr2);

      // 2. Handle matches
      if (wipeAllMatches) {
        // Delete all matches for this tournament
        const { error: mDelErr } = await window.sb
          .from("tournament_matches")
          .delete()
          .eq("tournament_id", tid);
        if (mDelErr) throw mDelErr;

        tMatches = [];

        // If tournament was marked completed, set back to ongoing
        if (currentTournament.status === "completed") {
          await window.sb.from("tournaments").update({ status: "ongoing", updated_at: new Date().toISOString() }).eq("id", tid);
          currentTournament.status = "ongoing";
        }
      } else {
        // Keep initial draw:
        // In knockout, delete subsequent generated rounds (round_number > 1)
        if (currentTournament.format === "knockout") {
          const { error: delSubErr } = await window.sb
            .from("tournament_matches")
            .delete()
            .eq("tournament_id", tid)
            .gt("round_number", 1);
          if (delSubErr) console.warn("Failed deleting subsequent rounds:", delSubErr);
        }

        // Reset remaining round matches to scheduled with null scores
        const matchResetPayload = {
          status: "scheduled",
          player1_score: null,
          player2_score: null,
          winner_id: null
        };

        const { error: mUpErr } = await window.sb
          .from("tournament_matches")
          .update(matchResetPayload)
          .eq("tournament_id", tid);
        if (mUpErr) throw mUpErr;
      }

      // 3. Close modal and reload complete tournament data from Supabase
      closeModal("reset-tournament-modal");
      await loadTournamentData(tid);
      renderBracketTab();
      renderMatchesTab();
      renderStandingsTab();
      renderRegistrationsTab();

      showToast(wipeAllMatches ? "All matches wiped & standings reset!" : "Scores cleared & standings reset to scheduled!");
    } catch (err) {
      console.error("Error resetting tournament:", err);
      showToast("Reset failed: " + (err.message || err));
      alert("Reset failed: " + (err.message || JSON.stringify(err)));
    } finally {
      if (wipeBtn) wipeBtn.disabled = false;
      if (scoresBtn) scoresBtn.disabled = false;
    }
  }

  // Modal event wiring
  document.getElementById("td-reset-matches-btn")?.addEventListener("click", openResetTournamentModal);
  document.getElementById("td-reset-standings-btn")?.addEventListener("click", openResetTournamentModal);
  document.getElementById("reset-tournament-modal-close")?.addEventListener("click", () => closeModal("reset-tournament-modal"));
  document.getElementById("reset-tournament-modal-cancel")?.addEventListener("click", () => closeModal("reset-tournament-modal"));
  document.getElementById("reset-tournament-modal")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal("reset-tournament-modal"); });

  document.getElementById("btn-do-reset-scores")?.addEventListener("click", () => resetTournamentScoresAndStandings(false));
  document.getElementById("btn-do-wipe-matches")?.addEventListener("click", () => resetTournamentScoresAndStandings(true));

  document.getElementById("ms-revoke-result")?.addEventListener("click", () => {
    const mid = document.getElementById("ms-match-id").value;
    if (mid) resetParticularMatch(mid);
  });
  document.getElementById("ms-save-result")?.addEventListener("click", () => saveMatchResult(true));
  document.getElementById("ms-save-schedule")?.addEventListener("click", () => saveMatchResult(false));

  // ── STANDINGS TAB ─────────────────────────────────────────────────────────
  function getKnockoutProgression(p) {
    if (p.status === "winner") return { label: "🥇 Champion", cls: "text-[#d8ff45] font-black bg-[#d8ff45]/20 border border-[#d8ff45]/40" };
    if (p.status === "runner_up") return { label: "🥈 Runner-Up", cls: "text-sky-300 font-bold bg-sky-500/20 border border-sky-500/40" };
    if (p.losses > 0 || p.status === "eliminated") return { label: "❌ Knocked Out", cls: "text-rose-400 bg-rose-500/15 border border-rose-500/30" };
    if (p.wins > 0 && p.losses === 0) return { label: "🔥 Advanced", cls: "text-emerald-400 font-bold bg-emerald-500/20 border border-emerald-500/40" };
    return { label: "⏳ Active", cls: "text-slate-400 bg-slate-800 border border-slate-700" };
  }

  function renderStandingsTab() {
    const view = document.getElementById("td-standings-view");
    if (!view) return;

    // RULE: Only show players that are confirmed (exclude unpaid/unconfirmed registered)
    const confirmedPlayers = tPlayers.filter(p => p.status !== "registered");
    if (!confirmedPlayers.length) {
      view.innerHTML = '<p class="text-sm text-slate-500 text-center py-8 italic">No confirmed players yet. Confirm paid players from the Registrations tab.</p>';
      return;
    }

    const honors = calculateTournamentHonors();
    const honorsHtml = renderHonorsCardHtml(honors);

    if (currentTournament?.format === "knockout") {
      const sorted = [...confirmedPlayers].sort((a, b) => {
        const getRank = (p) => {
          if (p.status === "winner") return 0;
          if (p.status === "runner_up") return 1;
          if (p.wins > 0 && p.losses === 0) return 2; // Alive & advanced
          if (p.losses > 0 || p.status === "eliminated") return 4; // Knocked out
          return 3; // 0 matches played yet
        };
        const rankDiff = getRank(a) - getRank(b);
        if (rankDiff !== 0) return rankDiff;
        if (b.wins !== a.wins) return b.wins - a.wins;
        const gdA = (a.goals_for || 0) - (a.goals_against || 0);
        const gdB = (b.goals_for || 0) - (b.goals_against || 0);
        if (gdB !== gdA) return gdB - gdA;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      view.innerHTML = honorsHtml + renderStandingsTable(sorted, false);
    } else {
      const groups = [...new Set(confirmedPlayers.map(p => p.group_name).filter(Boolean))].sort();
      if (!groups.length) {
        view.innerHTML = honorsHtml + '<p class="text-sm text-slate-500 text-center py-8 italic">Draw not generated yet.</p>';
        return;
      }
      view.innerHTML = honorsHtml + groups.map(g => {
        const gp = [...confirmedPlayers.filter(p => p.group_name === g)].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const gdA = (a.goals_for || 0) - (a.goals_against || 0);
          const gdB = (b.goals_for || 0) - (b.goals_against || 0);
          if (gdB !== gdA) return gdB - gdA;
          return (b.goals_for || 0) - (a.goals_for || 0);
        });
        return `<div class="mb-6"><p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider mb-2">Group ${esc(g)}</p>${renderStandingsTable(gp, true)}</div>`;
      }).join("");
    }
  }

  function renderStandingsTable(players, isGroups) {
    // In knockout: NO raw status ("confirmed") shown! Instead show Stage Progression, P, W, L, GF, GA, GD.
    const cols = isGroups
      ? "grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]"
      : "grid-cols-[1.5fr_1.2fr_auto_auto_auto_auto_auto_auto]";

    return `
      <div class="panel rounded-2xl overflow-hidden border border-slate-700/60 shadow-md">
        <div class="grid ${cols} text-[11px] text-slate-400 font-semibold px-4 py-2.5 bg-[#0f1520] border-b border-slate-700/60 gap-3">
          <span>Player</span>
          ${isGroups ? "" : "<span>Stage Progression</span>"}
          <span class="text-center w-8">P</span>
          <span class="text-center w-8">W</span>
          ${isGroups ? "<span class='text-center w-8'>D</span>" : ""}
          <span class="text-center w-8">L</span>
          <span class="text-center w-9">GF</span>
          <span class="text-center w-9">GA</span>
          <span class="text-center w-10">GD</span>
          ${isGroups ? "<span class='text-center w-10 text-[#d8ff45] font-bold'>Pts</span>" : ""}
        </div>
        <div class="divide-y divide-slate-800/80">
          ${players.map((p, i) => {
            const isKnockout = !isGroups;
            const prog = isKnockout ? getKnockoutProgression(p) : null;
            const played = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
            const gd = (p.goals_for || 0) - (p.goals_against || 0);
            const isWinner = p.status === "winner";

            return `
              <div class="grid ${cols} px-4 py-3 items-center text-xs sm:text-sm gap-3 ${
                isWinner ? "bg-[#d8ff45]/10" : (isGroups && i < 2 ? "bg-sky-500/5" : "")
              }">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="font-bold text-xs shrink-0 ${isWinner ? "text-[#d8ff45]" : "text-slate-500"}">
                    ${isWinner ? "🥇" : (isGroups && i === 0 ? "▲" : `${i + 1}.`)}
                  </span>
                  <div class="min-w-0 truncate">
                    <p class="font-bold truncate text-slate-100 ${isWinner ? "text-[#d8ff45]" : ""}">${esc(p.player_name)}</p>
                    ${p.gamertag ? `<p class="text-[11px] text-slate-400 truncate">(${esc(p.gamertag)})</p>` : ""}
                  </div>
                </div>

                ${isKnockout ? `
                  <div>
                    <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-block ${prog.cls}">
                      ${prog.label}
                    </span>
                  </div>
                ` : ""}

                <span class="text-center text-slate-400 w-8 font-mono">${played}</span>
                <span class="text-center text-slate-200 w-8 font-bold font-mono">${p.wins || 0}</span>
                ${isGroups ? `<span class="text-center text-slate-400 w-8 font-mono">${p.draws || 0}</span>` : ""}
                <span class="text-center text-slate-400 w-8 font-mono">${p.losses || 0}</span>
                <span class="text-center text-slate-300 w-9 font-mono">${p.goals_for || 0}</span>
                <span class="text-center text-slate-400 w-9 font-mono">${p.goals_against || 0}</span>
                <span class="text-center font-mono w-10 font-bold ${gd > 0 ? "text-emerald-400" : gd < 0 ? "text-rose-400" : "text-slate-400"}">
                  ${gd > 0 ? `+${gd}` : gd}
                </span>
                ${isGroups ? `<span class="text-center font-bold text-[#d8ff45] w-10 font-mono">${p.points || 0}</span>` : ""}
              </div>`;
          }).join("")}
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
      const cpEl = document.getElementById("tm-cash-prizes");
      if (cpEl) cpEl.value = tournament.cash_prizes_paid || 0;
      const expEl = document.getElementById("tm-expenses-amount");
      if (expEl) expEl.value = tournament.expenses_amount || 0;
      const expNotesEl = document.getElementById("tm-expenses-notes");
      if (expNotesEl) expNotesEl.value = tournament.expenses_notes || "";
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
      const cpEl = document.getElementById("tm-cash-prizes");
      if (cpEl) cpEl.value = "0";
      const expEl = document.getElementById("tm-expenses-amount");
      if (expEl) expEl.value = "0";
      const expNotesEl = document.getElementById("tm-expenses-notes");
      if (expNotesEl) expNotesEl.value = "";
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
    const addGbBtn = e.target.closest("#tm-add-golden-boot");
    if (addGbBtn) {
      e.preventDefault();
      addPrizeRow("⚽ Highest Goal Scorer", "Trophy / Cash Prize");
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
      cash_prizes_paid: Number(document.getElementById("tm-cash-prizes")?.value) || 0,
      expenses_amount: Number(document.getElementById("tm-expenses-amount")?.value) || 0,
      expenses_notes: document.getElementById("tm-expenses-notes")?.value.trim() || null,
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

  // ── LIVE DRAW CEREMONY (BIG SCREEN PRESENTATION) ─────────────────────────
  let ldcAudioCtx = null;
  let ldcSoundOn = true;
  let ldcCeremonyMatches = [];
  let ldcCurrentIndex = 0;
  let ldcIsSpinning = false;
  let ldcAutoPlayTimer = null;

  function getLdcAudioCtx() {
    if (!ldcSoundOn) return null;
    if (!ldcAudioCtx && (window.AudioContext || window.webkitAudioContext)) {
      ldcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ldcAudioCtx && ldcAudioCtx.state === "suspended") ldcAudioCtx.resume();
    return ldcAudioCtx;
  }

  function playLdcTick() {
    try {
      const ctx = getLdcAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(750 + Math.random() * 250, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (_) {}
  }

  function playLdcLockChime() {
    try {
      const ctx = getLdcAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }

  function playLdcFanfare() {
    try {
      const ctx = getLdcAudioCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        const t0 = ctx.currentTime + idx * 0.08;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.15, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.35);
      });
    } catch (_) {}
  }

  function openLiveDrawCeremony(forceNewDraw = false) {
    if (!currentTournament) return showToast("No tournament selected.");
    const confirmed = tPlayers.filter(p => p.status === "confirmed");
    if (!tMatches.length && confirmed.length < 2) {
      return showToast("Need at least 2 confirmed players to launch the draw ceremony.");
    }

    // Prepare matches in memory
    if (!tMatches.length || forceNewDraw) {
      // Auto-prepare a new draw sequence from confirmed players in memory ONLY
      const shuffled = shuffle(confirmed);
      const tid = currentTournament.id;
      const P = shuffled.length;
      ldcCeremonyMatches = [];

      if (currentTournament.format === "knockout") {
        const B = getNextPowerOf2(P);
        const numByes = B - P;
        const round1MatchCount = B / 2;
        const totalRounds = Math.log2(B);
        const round1Name = getKnockoutRoundName(1, totalRounds);

        // Distribute numByes cleanly across Round 1 matches
        const isByeMatch = new Array(round1MatchCount).fill(false);
        if (numByes > 0) {
          const step = round1MatchCount / numByes;
          for (let b = 0; b < numByes; b++) {
            const idx = Math.floor(b * step);
            isByeMatch[idx] = true;
          }
        }

        let pIdx = 0;
        for (let m = 0; m < round1MatchCount; m++) {
          if (isByeMatch[m]) {
            const p1 = shuffled[pIdx++];
            ldcCeremonyMatches.push({
              tournament_id: tid,
              round_name: round1Name,
              round_number: 1,
              match_number: m + 1,
              player1_id: p1 ? p1.id : null,
              player2_id: null,
              status: "bye",
              winner_id: p1 ? p1.id : null,
              player1_score: null,
              player2_score: null
            });
          } else {
            const p1 = shuffled[pIdx++];
            const p2 = shuffled[pIdx++];
            ldcCeremonyMatches.push({
              tournament_id: tid,
              round_name: round1Name,
              round_number: 1,
              match_number: m + 1,
              player1_id: p1 ? p1.id : null,
              player2_id: p2 ? p2.id : null,
              status: p2 ? "scheduled" : "bye",
              winner_id: !p2 && p1 ? p1.id : null,
              player1_score: null,
              player2_score: null
            });
          }
        }
      } else {
        // Group stage: groups of 4, round-robin within groups
        const groupSize = 4;
        const groupNames = "ABCDEFGH".split("");
        let mNum = 1;
        for (let g = 0; g < Math.ceil(shuffled.length / groupSize); g++) {
          const grp = shuffled.slice(g * groupSize, (g + 1) * groupSize);
          const gName = groupNames[g] || String(g + 1);
          for (let a = 0; a < grp.length; a++) {
            for (let b = a + 1; b < grp.length; b++) {
              ldcCeremonyMatches.push({
                tournament_id: tid,
                round_name: `Group ${gName}`,
                round_number: 1,
                match_number: mNum++,
                player1_id: grp[a].id,
                player2_id: grp[b].id,
                status: "scheduled",
                player1_score: null,
                player2_score: null
              });
            }
          }
        }
      }
    } else {
      // Replaying an existing already-published round
      const minRound = Math.min(...tMatches.map(m => m.round_number || 1));
      ldcCeremonyMatches = [...tMatches.filter(m => (m.round_number || 1) === minRound)].sort((a, b) => a.match_number - b.match_number);
    }

    ldcCurrentIndex = 0;
    ldcIsSpinning = false;
    if (ldcAutoPlayTimer) { clearInterval(ldcAutoPlayTimer); ldcAutoPlayTimer = null; }

    const titleEl = document.getElementById("ldc-tournament-title");
    if (titleEl) titleEl.textContent = `${currentTournament.title || currentTournament.name} · ${currentTournament.game || "EA FC"}`;

    const totalEl = document.getElementById("ldc-total-matches");
    if (totalEl) totalEl.textContent = ldcCeremonyMatches.length;

    const countEl = document.getElementById("ldc-revealed-count");
    if (countEl) countEl.textContent = "0";

    const tape = document.getElementById("ldc-fixtures-tape");
    if (tape) tape.innerHTML = "";

    resetLdcStageForCurrentMatch();
    openModal("live-draw-ceremony-modal");
  }

  async function publishCeremonyDraw() {
    if (!currentTournament || !window.sb || !ldcCeremonyMatches.length) return;
    const tid = currentTournament.id;

    try {
      showToast("Saving and publishing official fixtures...");

      // Update groups on players if group format
      if (currentTournament.format !== "knockout") {
        for (const m of ldcCeremonyMatches) {
          const gName = (m.round_name || "").replace("Group ", "");
          if (m.player1_id && gName) await window.sb.from("tournament_players").update({ group_name: gName }).eq("id", m.player1_id);
          if (m.player2_id && gName) await window.sb.from("tournament_players").update({ group_name: gName }).eq("id", m.player2_id);
        }
      }

      let allMatchesToInsert = [...ldcCeremonyMatches];

      // If knockout, pre-generate all subsequent rounds up to the final!
      if (currentTournament.format === "knockout") {
        const round1MatchCount = ldcCeremonyMatches.length;
        const B = round1MatchCount * 2;
        const totalRounds = Math.log2(B);

        // Pre-build all rounds 2..totalRounds
        const futureRoundsMap = {};
        for (let r = 2; r <= totalRounds; r++) {
          const roundMatchesCount = B / Math.pow(2, r);
          const roundName = getKnockoutRoundName(r, totalRounds);
          futureRoundsMap[r] = [];
          for (let m = 1; m <= roundMatchesCount; m++) {
            futureRoundsMap[r].push({
              tournament_id: tid,
              round_name: roundName,
              round_number: r,
              match_number: m,
              player1_id: null,
              player2_id: null,
              status: "scheduled",
              player1_score: null,
              player2_score: null
            });
          }
        }

        // Auto-seed Round 1 byes into Round 2 slots!
        ldcCeremonyMatches.forEach(m => {
          if (m.status === "bye" && m.winner_id && futureRoundsMap[2]) {
            const nextMatchNum = Math.ceil(m.match_number / 2);
            const target = futureRoundsMap[2].find(fm => fm.match_number === nextMatchNum);
            if (target) {
              if (m.match_number % 2 === 1) {
                target.player1_id = m.winner_id;
              } else {
                target.player2_id = m.winner_id;
              }
            }
          }
        });

        for (let r = 2; r <= totalRounds; r++) {
          allMatchesToInsert = allMatchesToInsert.concat(futureRoundsMap[r]);
        }
      }

      await window.sb.from("tournament_matches").delete().eq("tournament_id", tid);
      const { data: inserted, error } = await window.sb.from("tournament_matches").insert(allMatchesToInsert).select();
      if (error) throw error;

      if (["draft", "registration_closed"].includes(currentTournament.status)) {
        await window.sb.from("tournaments").update({ status: "ongoing", updated_at: new Date().toISOString() }).eq("id", tid);
        currentTournament.status = "ongoing";
      }

      await loadTournamentData(tid);
      closeModal("live-draw-ceremony-modal");
      showToast(`Official draw published! ${allMatchesToInsert.length} matches created.`);
    } catch (err) {
      console.error("Failed publishing draw:", err);
      showToast("Save error: " + err.message);
    }
  }

  function resetLdcStageForCurrentMatch() {
    const m = ldcCeremonyMatches[ldcCurrentIndex];
    const roundBadge = document.getElementById("ldc-round-badge");
    const matchLabel = document.getElementById("ldc-match-label");
    const subLabel = document.getElementById("ldc-status-sub");
    const spinLabel = document.getElementById("ldc-spin-label");
    const spinBtn = document.getElementById("ldc-spin-btn");

    const card1 = document.getElementById("ldc-card-p1");
    const card2 = document.getElementById("ldc-card-p2");
    const confirmedBadge = document.getElementById("ldc-badge-confirmed");

    if (confirmedBadge) confirmedBadge.style.opacity = "0";

    if (card1) {
      card1.className = "rounded-3xl p-6 sm:p-8 border-2 border-slate-700/80 bg-[#101622] text-center transition-all duration-300 shadow-xl flex flex-col items-center justify-center min-h-[190px]";
      document.getElementById("ldc-name-p1").textContent = "READY";
      document.getElementById("ldc-tag-p1").textContent = "Waiting to spin...";
    }
    if (card2) {
      card2.className = "rounded-3xl p-6 sm:p-8 border-2 border-slate-700/80 bg-[#101622] text-center transition-all duration-300 shadow-xl flex flex-col items-center justify-center min-h-[190px]";
      document.getElementById("ldc-name-p2").textContent = "READY";
      document.getElementById("ldc-tag-p2").textContent = "Waiting to spin...";
    }

    if (!m) {
      if (roundBadge) roundBadge.textContent = "DRAW COMPLETED";
      if (matchLabel) matchLabel.textContent = "ALL FIXTURES DECIDED!";
      if (subLabel) subLabel.textContent = "The live ceremony has concluded. Fixtures are ready to lock in.";
      if (spinLabel) spinLabel.textContent = "SAVE & PUBLISH FIXTURES";
      if (spinBtn) {
        spinBtn.onclick = publishCeremonyDraw;
      }
      return;
    }

    if (roundBadge) roundBadge.textContent = (m.round_name || "ROUND").toUpperCase();
    if (matchLabel) matchLabel.textContent = `MATCH ${m.match_number} OF ${ldcCeremonyMatches.length}`;
    if (subLabel) subLabel.textContent = m.status === "bye" ? "Draw will award a lucky Bye pass" : "Spin the reel to draw opposing contenders";
    if (spinLabel) spinLabel.textContent = `SPIN MATCH ${m.match_number}`;
    if (spinBtn) {
      spinBtn.onclick = () => spinCurrentLdcMatch();
    }
  }

  async function spinCurrentLdcMatch() {
    if (ldcIsSpinning) return;
    const m = ldcCeremonyMatches[ldcCurrentIndex];
    if (!m) {
      closeModal("live-draw-ceremony-modal");
      return;
    }

    ldcIsSpinning = true;
    const spinBtn = document.getElementById("ldc-spin-btn");
    if (spinBtn) spinBtn.disabled = true;

    const p1 = tPlayers.find(p => p.id === m.player1_id);
    const p2 = tPlayers.find(p => p.id === m.player2_id);
    const candidateNames = tPlayers.map(p => p.player_name).filter(Boolean);
    if (!candidateNames.length) candidateNames.push("Player 1", "Player 2", "Player 3", "Player 4");

    const avatars = ["🎮", "⚡", "🔥", "🏆", "🎯", "⚽", "🕹️", "👑"];

    const name1El = document.getElementById("ldc-name-p1");
    const tag1El = document.getElementById("ldc-tag-p1");
    const card1 = document.getElementById("ldc-card-p1");
    const avatar1 = document.getElementById("ldc-avatar-p1");

    const name2El = document.getElementById("ldc-name-p2");
    const tag2El = document.getElementById("ldc-tag-p2");
    const card2 = document.getElementById("ldc-card-p2");
    const avatar2 = document.getElementById("ldc-avatar-p2");

    // Phase 1: Spin Slot 1
    if (card1) card1.classList.add("border-[#d8ff45]", "shadow-[0_0_30px_rgba(216,255,69,0.3)]");
    await runSlotReel(name1El, avatar1, candidateNames, avatars, p1 ? p1.player_name : "TBD");
    if (tag1El) tag1El.textContent = p1?.gamertag ? `(${p1.gamertag})` : "Locked In";
    playLdcLockChime();

    // 600ms Tension Gap
    await new Promise(r => setTimeout(r, 600));

    // Phase 2: Spin Slot 2
    if (m.status === "bye") {
      if (card2) card2.classList.add("border-amber-400", "shadow-[0_0_30px_rgba(251,191,36,0.3)]");
      const byeTags = ["🌟 LUCKY BYE", "⚡ AUTO ADVANCES", "✨ FREE PASS", "🌟 LUCKY DRAW"];
      await runSlotReel(name2El, avatar2, byeTags, ["🌟", "🎫", "🏆", "✨"], "🌟 LUCKY BYE");
      if (tag2El) tag2El.textContent = "Auto-Advances to Round 2!";
      playLdcLockChime();
    } else {
      if (card2) card2.classList.add("border-sky-400", "shadow-[0_0_30px_rgba(56,189,248,0.3)]");
      const candidatePool2 = candidateNames.filter(n => n !== (p1 ? p1.player_name : ""));
      await runSlotReel(name2El, avatar2, candidatePool2.length ? candidatePool2 : candidateNames, avatars, p2 ? p2.player_name : "TBD");
      if (tag2El) tag2El.textContent = p2?.gamertag ? `(${p2.gamertag})` : "Locked In";
      playLdcLockChime();
    }

    // Fanfare & Match Set celebration!
    playLdcFanfare();
    const confirmedBadge = document.getElementById("ldc-badge-confirmed");
    if (confirmedBadge) {
      confirmedBadge.style.opacity = "1";
      confirmedBadge.className = "text-[10px] font-black tracking-wider uppercase text-emerald-400 mt-2 transition-opacity animate-bounce";
    }

    // Append to tape
    addMatchToLdcTape(m, p1, p2);

    ldcCurrentIndex++;
    const countEl = document.getElementById("ldc-revealed-count");
    if (countEl) countEl.textContent = ldcCurrentIndex;

    ldcIsSpinning = false;
    if (spinBtn) spinBtn.disabled = false;

    // Ready for next match
    setTimeout(() => {
      resetLdcStageForCurrentMatch();
    }, 1600);
  }

  function runSlotReel(textEl, avatarEl, names, avatars, finalName) {
    return new Promise(resolve => {
      let speed = 40;
      let count = 0;
      const totalSteps = 28;

      function step() {
        count++;
        playLdcTick();
        const randName = names[Math.floor(Math.random() * names.length)];
        const randAvatar = avatars[Math.floor(Math.random() * avatars.length)];
        if (textEl) textEl.textContent = randName;
        if (avatarEl) avatarEl.textContent = randAvatar;

        // Decelerate gradually
        if (count > 16) speed += 25;
        if (count > 22) speed += 45;

        if (count >= totalSteps) {
          if (textEl) textEl.textContent = finalName;
          if (avatarEl) avatarEl.textContent = "⭐";
          resolve();
        } else {
          setTimeout(step, speed);
        }
      }
      step();
    });
  }

  function addMatchToLdcTape(m, p1, p2) {
    const tape = document.getElementById("ldc-fixtures-tape");
    if (!tape) return;
    const card = document.createElement("div");
    card.className = "rounded-xl border border-slate-800 bg-[#0d131e] p-2.5 text-xs animate-fadeIn";
    const p2Text = m.status === "bye" ? '<span class="text-amber-400 font-bold">🌟 LUCKY BYE</span>' : (p2 ? esc(p2.player_name) : "TBD");
    card.innerHTML = `
      <div class="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
        <span>MATCH ${m.match_number}</span>
        <span class="${m.status === 'bye' ? 'text-amber-400' : 'text-[#d8ff45]'}">${m.status === 'bye' ? 'BYE' : 'SET'}</span>
      </div>
      <div class="font-bold text-slate-200 truncate">${p1 ? esc(p1.player_name) : "TBD"}</div>
      <div class="text-[10px] text-slate-500 font-mono">VS</div>
      <div class="font-bold text-slate-200 truncate">${p2Text}</div>
    `;
    tape.prepend(card);
  }

  // Live Draw Ceremony controls
  document.getElementById("td-live-draw-ceremony")?.addEventListener("click", () => openLiveDrawCeremony(false));
  document.getElementById("live-draw-ceremony-close")?.addEventListener("click", async () => {
    if (ldcAutoPlayTimer) { clearInterval(ldcAutoPlayTimer); ldcAutoPlayTimer = null; }
    if (!tMatches.length && ldcCeremonyMatches.length && ldcCurrentIndex > 0) {
      if (confirm("Ceremony in progress. Would you like to save and lock the revealed fixtures before closing?")) {
        await publishCeremonyDraw();
        return;
      }
    }
    closeModal("live-draw-ceremony-modal");
  });
  document.getElementById("ldc-quick-publish-btn")?.addEventListener("click", async () => {
    if (!ldcCeremonyMatches.length) return;
    if (ldcAutoPlayTimer) { clearInterval(ldcAutoPlayTimer); ldcAutoPlayTimer = null; }

    const tape = document.getElementById("ldc-fixtures-tape");
    if (tape) {
      tape.innerHTML = "";
      for (const m of ldcCeremonyMatches) {
        const p1 = tPlayers.find(p => p.id === m.player1_id);
        const p2 = tPlayers.find(p => p.id === m.player2_id);
        addMatchToLdcTape(m, p1, p2);
      }
    }
    ldcCurrentIndex = ldcCeremonyMatches.length;
    const countEl = document.getElementById("ldc-revealed-count");
    if (countEl) countEl.textContent = ldcCeremonyMatches.length;

    await publishCeremonyDraw();
  });
  document.getElementById("ldc-reset-ceremony-btn")?.addEventListener("click", () => {
    if (ldcAutoPlayTimer) { clearInterval(ldcAutoPlayTimer); ldcAutoPlayTimer = null; }
    ldcCurrentIndex = 0;
    const tape = document.getElementById("ldc-fixtures-tape");
    if (tape) tape.innerHTML = "";
    resetLdcStageForCurrentMatch();
  });
  document.getElementById("ldc-sound-toggle")?.addEventListener("click", () => {
    ldcSoundOn = !ldcSoundOn;
    const icon = document.getElementById("ldc-sound-icon");
    const btn = document.getElementById("ldc-sound-toggle");
    if (btn) {
      btn.innerHTML = ldcSoundOn
        ? '<i data-lucide="volume-2" width="14" height="14"></i><span class="hidden sm:inline">SFX: ON</span>'
        : '<i data-lucide="volume-x" width="14" height="14"></i><span class="hidden sm:inline">SFX: OFF</span>';
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
  });
  document.getElementById("ldc-fullscreen-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("live-draw-ceremony-modal");
    if (!document.fullscreenElement) {
      modal?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });
  document.getElementById("ldc-autoplay-btn")?.addEventListener("click", () => {
    if (ldcAutoPlayTimer) {
      clearInterval(ldcAutoPlayTimer);
      ldcAutoPlayTimer = null;
      document.getElementById("ldc-autoplay-btn").innerHTML = '<i data-lucide="fast-forward" width="14" height="14"></i><span>Auto Reveal</span>';
      if (window.lucide) lucide.createIcons();
      showToast("Auto-reveal paused.");
    } else {
      document.getElementById("ldc-autoplay-btn").innerHTML = '<i data-lucide="pause" width="14" height="14"></i><span>Pause</span>';
      if (window.lucide) lucide.createIcons();
      showToast("Auto-reveal started.");
      spinCurrentLdcMatch();
      ldcAutoPlayTimer = setInterval(() => {
        if (ldcCurrentIndex >= ldcCeremonyMatches.length) {
          clearInterval(ldcAutoPlayTimer);
          ldcAutoPlayTimer = null;
          return;
        }
        if (!ldcIsSpinning) spinCurrentLdcMatch();
      }, 4200);
    }
  });

  // ── GRAPHICS DOWNLOAD: CANVAS STANDINGS & DRAW ────────────────────────────
  function downloadStandingsGraphic() {
    if (!currentTournament) return showToast("No tournament loaded.");
    const confirmed = tPlayers.filter(p => p.status !== "registered");
    if (!confirmed.length) return showToast("No confirmed standings to export.");

    const canvas = document.createElement("canvas");
    const width = 1080;
    const rowHeight = 54;
    const headerHeight = 320;
    const footerHeight = 110;
    const height = Math.max(1350, headerHeight + (confirmed.length * rowHeight) + footerHeight);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080c14");
    bgGrad.addColorStop(0.5, "#0d1320");
    bgGrad.addColorStop(1, "#05080f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Accent glow top right
    const glow = ctx.createRadialGradient(width - 100, 100, 10, width - 100, 100, 450);
    glow.addColorStop(0, "rgba(216,255,69,0.18)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, 600);

    // Header Badge
    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("CHILLPILL GAMING CAFE", 60, 80);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 16px monospace";
    ctx.fillText("OFFICIAL TOURNAMENT STANDINGS", 60, 115);

    // Tournament Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 48px sans-serif";
    ctx.fillText(currentTournament.name || "EA FC Tournament", 60, 180);

    // Subtitle & details
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    const fmt = currentTournament.format === "knockout" ? "Direct Knockout" : "Group Stage";
    const dateStr = currentTournament.start_date ? new Date(currentTournament.start_date).toLocaleDateString("en-IN", { dateStyle: "long" }) : "Live Season";
    ctx.fillText(`Game: ${currentTournament.game || "EA FC"}  ·  Format: ${fmt}  ·  Date: ${dateStr}`, 60, 220);

    // Table Header Bar
    const tableTop = 270;
    ctx.fillStyle = "#141c2c";
    ctx.fillRect(50, tableTop, width - 100, 44);

    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 15px monospace";
    ctx.fillText("#", 75, tableTop + 28);
    ctx.fillText("PLAYER", 130, tableTop + 28);
    ctx.fillText("STAGE / STATUS", 460, tableTop + 28);
    ctx.fillText("P", 710, tableTop + 28);
    ctx.fillText("W", 760, tableTop + 28);
    ctx.fillText("L", 810, tableTop + 28);
    ctx.fillText("GF", 860, tableTop + 28);
    ctx.fillText("GA", 920, tableTop + 28);
    ctx.fillText("GD", 980, tableTop + 28);

    // Sort players
    const sorted = [...confirmed].sort((a, b) => {
      const getRank = (p) => (p.status === "winner" ? 0 : p.status === "runner_up" ? 1 : (p.wins > 0 && p.losses === 0) ? 2 : p.losses > 0 ? 4 : 3);
      const diff = getRank(a) - getRank(b);
      if (diff !== 0) return diff;
      return (b.wins || 0) - (a.wins || 0);
    });

    // Render Rows
    sorted.forEach((p, idx) => {
      const y = tableTop + 44 + (idx * rowHeight);

      // Alternating row background
      if (idx % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fillRect(50, y, width - 100, rowHeight);
      }

      // Rank or Medal
      ctx.fillStyle = p.status === "winner" ? "#d8ff45" : "#94a3b8";
      ctx.font = "bold 18px monospace";
      ctx.fillText(p.status === "winner" ? "★" : String(idx + 1), 75, y + 34);

      // Player Name
      ctx.fillStyle = p.status === "winner" ? "#d8ff45" : "#ffffff";
      ctx.font = "bold 18px sans-serif";
      const name = p.player_name + (p.gamertag ? ` (${p.gamertag})` : "");
      ctx.fillText(name.slice(0, 26), 130, y + 34);

      // Progression
      const prog = getKnockoutProgression(p);
      ctx.fillStyle = prog.label.includes("Champion") ? "#d8ff45" : prog.label.includes("Runner-Up") ? "#38bdf8" : prog.label.includes("Knocked") ? "#f43f5e" : "#10b981";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(prog.label, 460, y + 34);

      // Stats
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "16px monospace";
      const played = (p.wins || 0) + (p.losses || 0);
      const gd = (p.goals_for || 0) - (p.goals_against || 0);
      ctx.fillText(String(played), 710, y + 34);
      ctx.fillText(String(p.wins || 0), 760, y + 34);
      ctx.fillText(String(p.losses || 0), 810, y + 34);
      ctx.fillText(String(p.goals_for || 0), 860, y + 34);
      ctx.fillText(String(p.goals_against || 0), 920, y + 34);

      ctx.fillStyle = gd > 0 ? "#10b981" : gd < 0 ? "#f43f5e" : "#94a3b8";
      ctx.font = "bold 16px monospace";
      ctx.fillText(gd > 0 ? `+${gd}` : String(gd), 980, y + 34);

      // Row separator
      ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, y + rowHeight);
      ctx.lineTo(width - 50, y + rowHeight);
      ctx.stroke();
    });

    // Footer Branding
    const footY = height - 60;
    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("ChillPill Gaming Cafe", 60, footY);

    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText("📍 Budhanilkantha, Kathmandu  ·  WhatsApp: +977 9765130636  ·  www.chillpill.com.np", 280, footY);

    // Download image
    const filename = `${(currentTournament.name || "Tournament").replace(/\s+/g, "_")}_Standings.png`;
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      showToast("Standings graphic downloaded!");
    });
  }

  function downloadDrawGraphic() {
    if (!currentTournament) return showToast("No tournament loaded.");
    if (!tMatches.length) return showToast("No fixtures generated yet to download.");

    const canvas = document.createElement("canvas");
    const width = 1200;
    const rounds = [...new Set(tMatches.map(m => m.round_name))];
    const height = Math.max(1200, 280 + (tMatches.length * 75) + (rounds.length * 60) + 100);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Dark Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080c14");
    bgGrad.addColorStop(1, "#05080f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("CHILLPILL GAMING CAFE", 60, 75);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 42px sans-serif";
    ctx.fillText(`${currentTournament.name || "Tournament"} — Official Draw & Fixtures`, 60, 135);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Game: ${currentTournament.game || "EA FC"}  ·  Venue: ChillPill Arena, Budhanilkantha`, 60, 175);

    let curY = 230;

    rounds.forEach(rn => {
      const rMatches = tMatches.filter(m => m.round_name === rn);

      // Round Banner
      ctx.fillStyle = "rgba(216,255,69,0.12)";
      ctx.fillRect(60, curY, width - 120, 36);
      ctx.fillStyle = "#d8ff45";
      ctx.font = "bold 16px monospace";
      ctx.fillText(rn.toUpperCase(), 75, curY + 24);
      curY += 50;

      rMatches.forEach(m => {
        const p1 = tPlayers.find(p => p.id === m.player1_id);
        const p2 = tPlayers.find(p => p.id === m.player2_id);
        const isDone = m.status === "completed";

        ctx.fillStyle = isDone ? "rgba(216,255,69,0.04)" : "#101622";
        ctx.strokeStyle = isDone ? "rgba(216,255,69,0.3)" : "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(60, curY, width - 120, 60, 12);
        ctx.fill();
        ctx.stroke();

        // Match info
        ctx.fillStyle = "#64748b";
        ctx.font = "bold 13px monospace";
        ctx.fillText(`MATCH ${m.match_number}`, 80, curY + 36);

        // Player 1
        ctx.fillStyle = m.winner_id === m.player1_id ? "#d8ff45" : "#ffffff";
        ctx.font = m.winner_id === m.player1_id ? "bold 18px sans-serif" : "18px sans-serif";
        ctx.fillText(p1 ? p1.player_name : "TBD", 220, curY + 36);

        // Score / VS
        ctx.fillStyle = isDone ? "#ffffff" : "#64748b";
        ctx.font = "900 20px monospace";
        const scoreText = isDone ? `${m.player1_score ?? 0}  -  ${m.player2_score ?? 0}` : "VS";
        ctx.fillText(scoreText, 560, curY + 36);

        // Player 2
        ctx.fillStyle = m.winner_id === m.player2_id ? "#d8ff45" : "#ffffff";
        ctx.font = m.winner_id === m.player2_id ? "bold 18px sans-serif" : "18px sans-serif";
        ctx.fillText(p2 ? p2.player_name : m.status === "bye" ? "BYE" : "TBD", 720, curY + 36);

        // Status badge
        ctx.fillStyle = isDone ? "#d8ff45" : "#94a3b8";
        ctx.font = "bold 12px monospace";
        ctx.fillText(m.status.toUpperCase(), 1060, curY + 36);

        curY += 72;
      });

      curY += 20;
    });

    // Footer
    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText("ChillPill Gaming Cafe · Budhanilkantha, Kathmandu · WhatsApp: +977 9765130636", 60, height - 40);

    const filename = `${(currentTournament.name || "Tournament").replace(/\s+/g, "_")}_Fixtures.png`;
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      showToast("Draw graphic downloaded!");
    });
  }

  // ── BIG SCREEN / FULLSCREEN STANDINGS VIEW ───────────────────────────────
  function openFullscreenStandings() {
    if (!currentTournament) return showToast("No tournament loaded.");
    const confirmed = tPlayers.filter(p => p.status !== "registered");
    const container = document.getElementById("fsm-standings-view");
    const titleEl = document.getElementById("fsm-title");
    const subEl = document.getElementById("fsm-subtitle");
    if (!container) return;

    if (titleEl) titleEl.textContent = `${(currentTournament.name || "Tournament").toUpperCase()}`;
    if (subEl) subEl.textContent = `${currentTournament.game || "EA FC"} · Official Standings · Projected View`;

    if (!confirmed.length) {
      container.innerHTML = '<p class="text-lg text-slate-400 italic text-center py-16">No confirmed players yet.</p>';
      openModal("fullscreen-standings-modal");
      return;
    }

    const isGroups = currentTournament.format !== "knockout";

    if (!isGroups) {
      const sorted = [...confirmed].sort((a, b) => {
        const getRank = (p) => (p.status === "winner" ? 0 : p.status === "runner_up" ? 1 : (p.wins > 0 && p.losses === 0) ? 2 : p.losses > 0 ? 4 : 3);
        const diff = getRank(a) - getRank(b);
        if (diff !== 0) return diff;
        if (b.wins !== a.wins) return (b.wins || 0) - (a.wins || 0);
        const gdA = (a.goals_for || 0) - (a.goals_against || 0);
        const gdB = (b.goals_for || 0) - (b.goals_against || 0);
        if (gdB !== gdA) return gdB - gdA;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      container.innerHTML = renderBigScreenTable(sorted, false);
    } else {
      const groups = [...new Set(confirmed.map(p => p.group_name).filter(Boolean))].sort();
      if (!groups.length) {
        container.innerHTML = '<p class="text-lg text-slate-400 italic text-center py-16">Group draw not generated yet.</p>';
      } else {
        container.innerHTML = groups.map(g => {
          const gp = [...confirmed.filter(p => p.group_name === g)].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const gdA = (a.goals_for || 0) - (a.goals_against || 0);
            const gdB = (b.goals_for || 0) - (b.goals_against || 0);
            if (gdB !== gdA) return gdB - gdA;
            return (b.goals_for || 0) - (a.goals_for || 0);
          });
          return `<div class="mb-6"><p class="text-sm font-black text-[#d8ff45] uppercase tracking-wider mb-2">Group ${esc(g)}</p>${renderBigScreenTable(gp, true)}</div>`;
        }).join("");
      }
    }

    openModal("fullscreen-standings-modal");
  }

  function renderBigScreenTable(players, isGroups) {
    const cols = isGroups
      ? "grid-cols-[2fr_auto_auto_auto_auto_auto_auto_auto]"
      : "grid-cols-[2.5fr_1.8fr_auto_auto_auto_auto_auto_auto]";

    return `
      <div class="panel rounded-3xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-[#0c121d]">
        <div class="grid ${cols} text-xs font-black uppercase tracking-wider px-6 py-3.5 bg-[#070b12] border-b border-slate-700 text-slate-400 gap-4">
          <span>CONTENDER</span>
          ${isGroups ? "" : "<span>STAGE PROGRESSION</span>"}
          <span class="text-center w-10">P</span>
          <span class="text-center w-10">W</span>
          ${isGroups ? "<span class='text-center w-10'>D</span>" : ""}
          <span class="text-center w-10">L</span>
          <span class="text-center w-12">GF</span>
          <span class="text-center w-12">GA</span>
          <span class="text-center w-12">GD</span>
          ${isGroups ? "<span class='text-center w-14 text-[#d8ff45] font-black'>PTS</span>" : ""}
        </div>
        <div class="divide-y divide-slate-800">
          ${players.map((p, i) => {
            const isWinner = p.status === "winner";
            const isAdvancing = isGroups && i < 2;
            const isKnockout = !isGroups;
            const prog = isKnockout ? getKnockoutProgression(p) : null;
            const played = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
            const gd = (p.goals_for || 0) - (p.goals_against || 0);

            return `
              <div class="grid ${cols} px-6 py-4 items-center gap-4 ${
                isWinner ? "bg-[#d8ff45]/15 font-black" : isAdvancing ? "bg-sky-500/10" : ""
              }">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="font-black text-sm shrink-0 ${isWinner ? "text-[#d8ff45]" : "text-slate-400"}">
                    ${isWinner ? "🥇" : i === 0 && isGroups ? "▲" : `${i + 1}.`}
                  </span>
                  <div class="min-w-0 truncate">
                    <p class="font-extrabold text-base sm:text-lg text-white truncate ${isWinner ? "text-[#d8ff45]" : ""}">${esc(p.player_name)}</p>
                    ${p.gamertag ? `<p class="text-xs text-slate-400 font-mono truncate">@${esc(p.gamertag)}</p>` : ""}
                  </div>
                </div>

                ${isKnockout ? `
                  <div>
                    <span class="text-xs font-black px-3 py-1 rounded-full inline-block ${prog.cls}">
                      ${prog.label}
                    </span>
                  </div>
                ` : ""}

                <span class="text-center text-slate-300 w-10 font-mono text-sm">${played}</span>
                <span class="text-center text-white font-black w-10 font-mono text-sm">${p.wins || 0}</span>
                ${isGroups ? `<span class="text-center text-slate-400 w-10 font-mono text-sm">${p.draws || 0}</span>` : ""}
                <span class="text-center text-slate-400 w-10 font-mono text-sm">${p.losses || 0}</span>
                <span class="text-center text-slate-200 w-12 font-mono text-sm">${p.goals_for || 0}</span>
                <span class="text-center text-slate-400 w-12 font-mono text-sm">${p.goals_against || 0}</span>
                <span class="text-center font-mono w-12 font-black text-sm ${gd > 0 ? "text-emerald-400" : gd < 0 ? "text-rose-400" : "text-slate-400"}">
                  ${gd > 0 ? `+${gd}` : gd}
                </span>
                ${isGroups ? `<span class="text-center font-black text-[#d8ff45] w-14 font-mono text-base">${p.points || 0}</span>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  document.getElementById("td-fullscreen-standings")?.addEventListener("click", openFullscreenStandings);
  document.getElementById("fullscreen-standings-close")?.addEventListener("click", () => closeModal("fullscreen-standings-modal"));
  document.getElementById("fsm-toggle-fullscreen-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("fullscreen-standings-modal");
    if (!document.fullscreenElement) {
      modal?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  document.getElementById("td-download-standings")?.addEventListener("click", downloadStandingsGraphic);
  document.getElementById("td-download-draw")?.addEventListener("click", downloadDrawGraphic);
  document.getElementById("td-matches-download-btn")?.addEventListener("click", downloadDrawGraphic);
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
