/**
 * ChillPill Gaming Cafe — Public Tournament Hub
 * Powers tournament.html: handles tabs, live data, registration, standings, fixtures, and prizes.
 */
(function initTournamentHub() {
  "use strict";

  let currentTournament = null;
  let tournamentPlayers = [];
  let tournamentMatches = [];

  const esc = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const STATUS_CONFIG = {
    draft: { label: "Draft", cls: "bg-slate-700 text-slate-300" },
    registration_open: { label: "Registration Open", cls: "bg-green-500/20 text-green-300 border border-green-500/40" },
    registration_closed: { label: "Registration Closed", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
    ongoing: { label: "Ongoing", cls: "bg-sky-500/20 text-sky-300 border border-sky-500/40" },
    completed: { label: "Completed", cls: "bg-[#d8ff45]/20 text-[#d8ff45] border border-[#d8ff45]/40" },
    cancelled: { label: "Cancelled", cls: "bg-red-500/20 text-red-300 border border-red-500/40" }
  };

  // ── TAB SWITCHING ─────────────────────────────────────────────────────────
  function switchTab(tabId) {
    const contents = document.querySelectorAll(".tab-content");
    const buttons = document.querySelectorAll(".tab-btn");

    contents.forEach((c) => c.classList.add("hidden"));
    buttons.forEach((b) => {
      const isActive = b.dataset.tab === tabId;
      b.classList.toggle("active", isActive);
      b.classList.toggle("text-[#d8ff45]", isActive);
      b.classList.toggle("border-[#d8ff45]", isActive);
      b.classList.toggle("bg-[#d8ff45]/10", isActive);
      b.classList.toggle("text-slate-400", !isActive);
      b.classList.toggle("border-transparent", !isActive);
      b.classList.toggle("bg-transparent", !isActive);
    });

    const activeContent = document.getElementById(tabId);
    if (activeContent) {
      activeContent.classList.remove("hidden");
    }

    // Update URL hash cleanly
    const hash = tabId.replace("tab-", "");
    history.replaceState(null, "", `#${hash}`);

    if (window.lucide) lucide.createIcons();
  }

  function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.addEventListener("click", (e) => {
      const jump = e.target.closest(".tab-jump");
      if (jump && jump.dataset.target) {
        e.preventDefault();
        switchTab(jump.dataset.target);
        window.scrollTo({ top: 300, behavior: "smooth" });
      }
    });

    // Check initial hash (e.g. #standings, #fixtures, #prizes, #champions)
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash && document.getElementById(`tab-${initialHash}`)) {
      switchTab(`tab-${initialHash}`);
    }
  }

  // ── LOAD TOURNAMENT DATA ──────────────────────────────────────────────────
  async function loadTournamentHub() {
    const loadingEl = document.getElementById("trn-loading");
    const emptyView = document.getElementById("trn-empty-view");
    const activeView = document.getElementById("trn-active-view");

    if (!window.SUPABASE_CONFIGURED || !window.sb) {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (emptyView) emptyView.classList.remove("hidden");
      return;
    }

    try {
      // Fetch latest active tournament marked for display
      const { data: t, error } = await window.sb
        .from("tournaments")
        .select("*")
        .eq("show_on_homepage", true)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !t) {
        if (loadingEl) loadingEl.classList.add("hidden");
        if (emptyView) emptyView.classList.remove("hidden");
        return;
      }

      currentTournament = t;

      // Fetch players and matches in parallel
      const [{ data: players }, { data: matches }] = await Promise.all([
        window.sb
          .from("tournament_players")
          .select("*")
          .eq("tournament_id", t.id)
          .order("created_at"),
        window.sb
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", t.id)
          .order("round_number")
          .order("match_number")
      ]);

      tournamentPlayers = players || [];
      tournamentMatches = matches || [];

      // Render all views
      renderHeroHeader(t, tournamentPlayers);
      renderOverviewTab(t, tournamentPlayers);
      renderStandingsTab(t, tournamentPlayers);
      renderFixturesTab(t, tournamentPlayers, tournamentMatches);
      renderPrizesTab(t);
      renderChampionsTab(t, tournamentPlayers);

      if (loadingEl) loadingEl.classList.add("hidden");
      if (activeView) activeView.classList.remove("hidden");

      // Auto-activate Champions tab if tournament is completed
      if (t.status === "completed" && !window.location.hash) {
        switchTab("tab-champions");
      }

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error("[ChillPill] Error loading tournament hub:", err);
      if (loadingEl) loadingEl.classList.add("hidden");
      if (emptyView) emptyView.classList.remove("hidden");
    }
  }

  // ── HERO HEADER ───────────────────────────────────────────────────────────
  function renderHeroHeader(t, players) {
    const nameEl = document.getElementById("t-name");
    const gamePill = document.getElementById("t-game-pill");
    const statusPill = document.getElementById("t-status-pill");
    const descEl = document.getElementById("t-desc");
    const formatEl = document.getElementById("t-format");
    const feeEl = document.getElementById("t-fee");
    const slotsEl = document.getElementById("t-slots");
    const startDateEl = document.getElementById("t-start-date");

    if (nameEl) nameEl.textContent = t.name;
    if (gamePill) gamePill.textContent = t.game || "EA FC";

    const cfg = STATUS_CONFIG[t.status] || { label: t.status, cls: "bg-slate-700 text-slate-300" };
    if (statusPill) {
      statusPill.textContent = cfg.label;
      statusPill.className = `text-xs font-bold px-3 py-1 rounded-full ${cfg.cls}`;
    }

    if (descEl) {
      descEl.textContent =
        t.description ||
        `Official ${t.game || "EA FC"} tournament at ChillPill Gaming Cafe. Compete for cash prizes, trophies, and glory.`;
    }

    if (formatEl) {
      formatEl.textContent = t.format === "knockout" ? "Direct Knockout" : "Group Stage + Knockout";
    }

    if (feeEl) {
      feeEl.textContent = t.entry_fee > 0 ? `रु ${t.entry_fee}` : "Free Entry";
    }

    if (slotsEl) {
      const confirmedCount = players.filter((p) => p.status === "confirmed").length;
      slotsEl.textContent = `${confirmedCount} / ${t.max_players || 16} Confirmed (${players.length} reg)`;
    }

    if (startDateEl) {
      startDateEl.textContent = t.start_date
        ? new Date(t.start_date).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "To Be Announced";
    }
  }

  // ── TAB 1: OVERVIEW & REGISTRATION ────────────────────────────────────────
  function renderOverviewTab(t, players) {
    const slotsText = document.getElementById("slots-bar-text");
    const progressEl = document.getElementById("slots-progress");
    const regForm = document.getElementById("public-register-form");
    const closedNotice = document.getElementById("reg-closed-notice");
    const regStatusBadge = document.getElementById("reg-status-badge");
    const overviewPrizes = document.getElementById("overview-prizes");

    const max = t.max_players || 16;
    const confirmedCount = players.filter((p) => p.status === "confirmed").length;
    const totalCount = players.length;
    const pct = Math.min(100, Math.round((confirmedCount / max) * 100));

    if (slotsText) {
      slotsText.textContent = `${confirmedCount} of ${max} confirmed slots (${totalCount} registered)`;
    }
    if (progressEl) progressEl.style.width = `${pct}%`;

    // Registration remains open based on status set by admin. Any number of players can register;
    // slots are confirmed on a first-paid, first-served basis by the admin.
    const isOpen = t.status === "registration_open";

    if (regStatusBadge) {
      regStatusBadge.textContent = isOpen ? "Open" : "Closed";
      regStatusBadge.className = isOpen
        ? "text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40"
        : "text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40";
    }

    if (isOpen) {
      if (regForm) regForm.classList.remove("hidden");
      if (closedNotice) closedNotice.classList.add("hidden");
      document.getElementById("f-tournament-id").value = t.id;
    } else {
      if (regForm) regForm.classList.add("hidden");
      if (closedNotice) closedNotice.classList.remove("hidden");
    }

    // Prizes snippet on right column
    if (overviewPrizes) {
      const prizes = Array.isArray(t.prize_pool) ? t.prize_pool : [];
      if (prizes.length) {
        overviewPrizes.innerHTML = prizes.slice(0, 3).map((p, i) => `
          <div class="flex items-center justify-between py-2 border-b border-slate-800/80 last:border-0">
            <span class="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span> ${esc(p.place || `#${i + 1}`)}
            </span>
            <span class="font-bold text-[#d8ff45] mono">${esc(p.reward || "TBD")}</span>
          </div>`).join("");
      } else {
        overviewPrizes.innerHTML = '<p class="text-slate-500 text-xs italic">Prize details to be announced.</p>';
      }
    }

    // Bind registration form submit
    wireRegistrationForm(t, players);
  }

  function wireRegistrationForm(t, players) {
    const form = document.getElementById("public-register-form");
    if (!form || form._wired) return;
    form._wired = true;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("f-msg");
      const submitBtn = document.getElementById("f-submit-btn");
      const submitLabel = document.getElementById("f-submit-label");

      const name = document.getElementById("f-name").value.trim();
      const gamertag = document.getElementById("f-gamertag").value.trim();
      const phone = document.getElementById("f-phone").value.trim();
      const team = document.getElementById("f-team").value.trim();

      if (!name || !gamertag || !phone) {
        msg.textContent = "Please fill in all required fields (Name, Gamertag, WhatsApp).";
        msg.className = "text-xs text-red-400";
        return;
      }

      if (t.status !== "registration_open") {
        msg.textContent = "Registration is currently closed for this tournament.";
        msg.className = "text-xs text-amber-400";
        return;
      }

      // Check duplicate
      const isDuplicate = players.some(
        (p) =>
          p.phone === phone ||
          p.gamertag?.toLowerCase() === gamertag.toLowerCase()
      );
      if (isDuplicate) {
        msg.textContent = "You're already registered! We have your details on record.";
        msg.className = "text-xs text-amber-400";
        return;
      }

      submitBtn.disabled = true;
      submitLabel.textContent = "Registering...";
      msg.textContent = "";

      try {
        const { data, error } = await window.sb
          .from("tournament_players")
          .insert({
            tournament_id: t.id,
            player_name: name,
            gamertag,
            phone,
            team_name: team || null,
            status: "registered"
          })
          .select()
          .single();

        if (error) throw error;

        msg.textContent = "🎉 Registration received! Priority slots are confirmed upon entry fee payment (first-paid, first-served). Pay at the cafe or message us on WhatsApp!";
        msg.className = "text-xs text-green-400 font-bold";
        submitLabel.textContent = "Registered ✓";
        form.reset();

        if (data) players.push(data);
        renderOverviewTab(t, players);
      } catch (err) {
        console.error("Registration error:", err);
        msg.textContent = "Registration failed: " + (err.message || "Please try again or contact staff.");
        msg.className = "text-xs text-red-400";
        submitBtn.disabled = false;
        submitLabel.textContent = "Confirm & Register";
      }
    });
  }

  // ── TAB 2: STANDINGS & POINTS ─────────────────────────────────────────────
  function renderStandingsTab(t, players) {
    const container = document.getElementById("standings-container");
    const formatLabel = document.getElementById("standings-format-label");
    if (!container) return;

    if (formatLabel) {
      formatLabel.textContent = t.format === "knockout" ? "Knockout Ladder" : "Group Stage Table";
    }

    function getPublicProgression(p) {
      if (p.status === "winner") return { label: "🥇 Champion", cls: "text-[#d8ff45] font-black bg-[#d8ff45]/20 border border-[#d8ff45]/40" };
      if (p.status === "runner_up") return { label: "🥈 Runner-Up", cls: "text-sky-300 font-bold bg-sky-500/20 border border-sky-500/40" };
      if (p.losses > 0 || p.status === "eliminated") return { label: "❌ Knocked Out", cls: "text-rose-400 bg-rose-500/15 border border-rose-500/30" };
      if (p.wins > 0 && p.losses === 0) return { label: "🔥 Advanced", cls: "text-emerald-400 font-bold bg-emerald-500/20 border border-emerald-500/40" };
      return { label: "⏳ Active", cls: "text-slate-400 bg-slate-800 border border-slate-700" };
    }

    // RULE: Only show players that are confirmed (exclude unpaid/unconfirmed registered)
    const confirmedPlayers = players.filter((p) => p.status !== "registered");

    if (!confirmedPlayers.length) {
      container.innerHTML = `
        <div class="panel rounded-3xl p-10 text-center text-slate-500 italic">
          <i data-lucide="users" width="32" height="32" class="mx-auto mb-2 text-slate-600"></i>
          No confirmed players yet. Confirmations are underway!
        </div>`;
      return;
    }

    if (t.format === "knockout") {
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
      container.innerHTML = renderStandingsTable(sorted, false);
    } else {
      const groups = [...new Set(confirmedPlayers.map((p) => p.group_name).filter(Boolean))].sort();
      if (!groups.length) {
        container.innerHTML = `
          <div class="panel rounded-3xl p-8 text-center text-slate-400">
            <i data-lucide="shuffle" width="28" height="28" class="mx-auto mb-2 text-[#d8ff45]"></i>
            <p class="font-bold">Group Draw in Progress</p>
            <p class="text-xs text-slate-500 mt-1">Groups and seedings will be published once registrations close.</p>
          </div>`;
        return;
      }

      container.innerHTML = groups
        .map((g) => {
          const groupPlayers = [...confirmedPlayers.filter((p) => p.group_name === g)].sort(
            (a, b) => {
              if (b.points !== a.points) return b.points - a.points;
              const gdA = (a.goals_for || 0) - (a.goals_against || 0);
              const gdB = (b.goals_for || 0) - (b.goals_against || 0);
              if (gdB !== gdA) return gdB - gdA;
              return (b.goals_for || 0) - (a.goals_for || 0);
            }
          );
          return `
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-[#d8ff45]"></span>
                <h3 class="text-sm font-bold text-[#d8ff45] uppercase tracking-wider">Group ${esc(g)}</h3>
              </div>
              ${renderStandingsTable(groupPlayers, true)}
            </div>`;
        })
        .join("");
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
        <div class="divide-y divide-slate-800/80 text-xs sm:text-sm">
          ${players
            .map((p, i) => {
              const isWinner = p.status === "winner";
              const isAdvancing = isGroups && i < 2;
              const isKnockout = !isGroups;
              const prog = isKnockout ? (function() {
                if (p.status === "winner") return { label: "🥇 Champion", cls: "text-[#d8ff45] font-black bg-[#d8ff45]/20 border border-[#d8ff45]/40" };
                if (p.status === "runner_up") return { label: "🥈 Runner-Up", cls: "text-sky-300 font-bold bg-sky-500/20 border border-sky-500/40" };
                if (p.losses > 0 || p.status === "eliminated") return { label: "❌ Knocked Out", cls: "text-rose-400 bg-rose-500/15 border border-rose-500/30" };
                if (p.wins > 0 && p.losses === 0) return { label: "🔥 Advanced", cls: "text-emerald-400 font-bold bg-emerald-500/20 border border-emerald-500/40" };
                return { label: "⏳ Active", cls: "text-slate-400 bg-slate-800 border border-slate-700" };
              })() : null;
              const played = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
              const gd = (p.goals_for || 0) - (p.goals_against || 0);

              return `
                <div class="grid ${cols} px-4 py-3 items-center gap-3 ${
                isWinner ? "bg-[#d8ff45]/10" : isAdvancing ? "bg-sky-500/5" : ""
              }">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="font-bold text-xs shrink-0 ${isWinner ? "text-[#d8ff45]" : "text-slate-500"}">
                      ${isWinner ? "🥇" : isAdvancing ? "▲" : `${i + 1}.`}
                    </span>
                    <div class="min-w-0 truncate">
                      <p class="font-bold truncate text-slate-100 ${isWinner ? "text-[#d8ff45]" : ""}">
                        ${esc(p.player_name)}
                      </p>
                      <p class="text-[11px] text-slate-400 truncate">
                        ${esc(p.gamertag || p.team_name || "")}
                      </p>
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
            })
            .join("")}
        </div>
      </div>`;
  }

  // ── TAB 3: FIXTURES & RESULTS ─────────────────────────────────────────────
  function renderFixturesTab(t, players, matches) {
    const container = document.getElementById("fixtures-container");
    if (!container) return;

    if (!matches.length) {
      container.innerHTML = `
        <div class="panel rounded-3xl p-10 text-center text-slate-400">
          <i data-lucide="calendar" width="32" height="32" class="mx-auto mb-2 text-[#d8ff45]"></i>
          <p class="font-bold text-base text-slate-200">Draw Not Generated Yet</p>
          <p class="text-xs text-slate-500 mt-1">Match fixtures and stations will be generated once registrations are finalized.</p>
        </div>`;
      return;
    }

    const isKnockout = t.format === "knockout";
    const rounds = [...new Set(matches.map((m) => m.round_name))];

    container.innerHTML = rounds
      .map((rn) => {
        const roundMatches = matches.filter((m) => m.round_name === rn);
        return `
          <div class="space-y-3">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <h3 class="text-sm font-bold text-[#d8ff45] uppercase tracking-wider flex items-center gap-2">
                <i data-lucide="flag" width="14" height="14"></i>
                <span>${esc(rn)}</span>
              </h3>
              <span class="text-xs text-slate-500 font-mono">${roundMatches.length} Matches</span>
            </div>
            <div class="grid sm:grid-cols-2 gap-3">
              ${roundMatches
                .map((m) => {
                  const p1 = players.find((p) => p.id === m.player1_id);
                  const p2 = players.find((p) => p.id === m.player2_id);
                  const isDone = m.status === "completed";
                  const p1Won = isDone && m.winner_id === m.player1_id;
                  const p2Won = isDone && m.winner_id === m.player2_id;

                  // Knockout matches: tournament completes in one day, only display time!
                  let sched = "Time TBD";
                  if (m.scheduled_at) {
                    sched = isKnockout
                      ? new Date(m.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                      : new Date(m.scheduled_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
                  }

                  return `
                    <div class="panel rounded-2xl p-4 border border-slate-700/60 hover:border-slate-600 transition flex flex-col justify-between">
                      <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2.5">
                        <span class="font-bold text-sky-400">${esc(m.station_name || "PS5 Arena")}</span>
                        <span class="font-mono text-slate-400">&#128336; ${sched}</span>
                      </div>
                      <div class="space-y-2">
                        <div class="flex items-center justify-between gap-2 p-2 rounded-xl ${
                          p1Won ? "bg-[#d8ff45]/15 border border-[#d8ff45]/30 font-bold" : "bg-[#111722]"
                        }">
                          <div class="min-w-0 truncate text-xs sm:text-sm">
                            <span class="${p1Won ? "text-[#d8ff45]" : "text-slate-200"}">
                              ${p1 ? esc(p1.player_name) : "TBD"}
                            </span>
                            ${p1?.gamertag ? `<span class="text-[10px] text-slate-400 ml-1.5 font-normal">(${esc(p1.gamertag)})</span>` : ""}
                          </div>
                          <span class="mono font-bold text-sm shrink-0 px-2 py-0.5 rounded ${
                            isDone ? "text-white" : "text-slate-500"
                          }">${isDone ? m.player1_score ?? 0 : "-"}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 p-2 rounded-xl ${
                          p2Won ? "bg-[#d8ff45]/15 border border-[#d8ff45]/30 font-bold" : "bg-[#111722]"
                        }">
                          <div class="min-w-0 truncate text-xs sm:text-sm">
                            <span class="${p2Won ? "text-[#d8ff45]" : "text-slate-200"}">
                              ${p2 ? esc(p2.player_name) : m.status === "bye" ? "BYE" : "TBD"}
                            </span>
                            ${p2?.gamertag ? `<span class="text-[10px] text-slate-400 ml-1.5 font-normal">(${esc(p2.gamertag)})</span>` : ""}
                          </div>
                          <span class="mono font-bold text-sm shrink-0 px-2 py-0.5 rounded ${
                            isDone ? "text-white" : "text-slate-500"
                          }">${isDone ? m.player2_score ?? 0 : "-"}</span>
                        </div>
                      </div>
                    </div>`;
                })
                .join("")}
            </div>
          </div>`;
      })
      .join("");
  }

  // ── TAB 4: PRIZES & RULES ─────────────────────────────────────────────────
  function renderPrizesTab(t) {
    const grid = document.getElementById("prizes-grid");
    const rulesEl = document.getElementById("rules-full-text");

    const prizes = Array.isArray(t.prize_pool) ? t.prize_pool : [];
    if (grid) {
      if (prizes.length) {
        const medalList = ["🥇", "🥈", "🥉", "🏅", "🎖️", "🏆"];
        grid.innerHTML = prizes
          .map(
            (p, i) => `
          <div class="panel rounded-3xl p-6 text-center border border-slate-700/60 shadow-lg relative overflow-hidden">
            <span class="text-4xl mb-3 block">${medalList[i] || "🏅"}</span>
            <h3 class="font-extrabold text-lg text-slate-100">${esc(p.place || `#${i + 1}`)}</h3>
            <p class="text-xl font-bold text-[#d8ff45] mono mt-1.5">${esc(p.reward || "TBD")}</p>
          </div>`
          )
          .join("");
      } else {
        grid.innerHTML = '<p class="text-slate-500 text-sm">No prizes configured for this tournament.</p>';
      }
    }

    if (rulesEl) {
      rulesEl.textContent =
        t.rules ||
        `• 5 minute halves · Classic match settings
• Tactical defending mandatory
• Pause allowed only when ball is out of play
• In case of a tie at full time: Extra time + Penalties
• Side selection decided by referee coin toss
• Disconnection or controller issue must be raised immediately
• Admin & referee decisions are final and binding`;
    }
  }

  // ── TAB 5: CHAMPIONS ──────────────────────────────────────────────────────
  function renderChampionsTab(t, players) {
    const container = document.getElementById("champions-podium");
    const championsTabBtn = document.getElementById("tab-btn-champions");
    if (!container) return;

    const winner = players.find((p) => p.status === "winner");
    const runnerUp = players.find((p) => p.status === "runner_up");
    const third = players.find((p) => p.status === "third");

    if (t.status === "completed" && championsTabBtn) {
      championsTabBtn.classList.remove("hidden");
    }

    if (!winner && !runnerUp) {
      container.innerHTML = `
        <div class="sm:col-span-3 panel rounded-3xl p-10 text-center border border-slate-700/60">
          <span class="text-4xl mb-2 inline-block">⏳</span>
          <p class="font-bold text-lg text-slate-200">Tournament in Progress</p>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Champions will be celebrated here once the Grand Final concludes!
          </p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <!-- Runner Up (Silver) -->
      <div class="panel rounded-3xl p-6 text-center border border-slate-700 order-2 sm:order-1 self-end">
        <span class="text-3xl block mb-2">🥈</span>
        <p class="text-xs font-bold text-slate-400 uppercase">Runner-Up</p>
        <p class="font-extrabold text-lg text-slate-100 mt-1">${runnerUp ? esc(runnerUp.player_name) : "TBD"}</p>
        <p class="text-xs text-slate-400">${runnerUp?.gamertag ? esc(runnerUp.gamertag) : ""}</p>
      </div>

      <!-- 1st Place (Gold) -->
      <div class="panel rounded-3xl p-8 text-center border-2 border-[#d8ff45] bg-[#d8ff45]/10 order-1 sm:order-2 shadow-2xl relative">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#d8ff45] text-[#10141e] text-[10px] font-black px-3 py-0.5 rounded-full uppercase tracking-wider">
          Champion
        </div>
        <span class="text-5xl block mb-3">🥇</span>
        <p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider">1st Place</p>
        <p class="font-black text-2xl text-white mt-1">${winner ? esc(winner.player_name) : "TBD"}</p>
        <p class="text-xs text-[#d8ff45] mt-0.5 font-bold">${winner?.gamertag ? esc(winner.gamertag) : ""}</p>
      </div>

      <!-- 3rd Place / Semi-Finalist -->
      <div class="panel rounded-3xl p-6 text-center border border-slate-700 order-3 sm:order-3 self-end">
        <span class="text-3xl block mb-2">🥉</span>
        <p class="text-xs font-bold text-slate-400 uppercase">3rd Place</p>
        <p class="font-extrabold text-lg text-slate-100 mt-1">${third ? esc(third.player_name) : "Semi-Finalist"}</p>
        <p class="text-xs text-slate-400">${third?.gamertag ? esc(third.gamertag) : ""}</p>
      </div>`;
  }

  // ── GRAPHICS DOWNLOAD: CANVAS EXPORTER ────────────────────────────────────
  function downloadPublicStandings() {
    if (!currentTournament) return;
    const confirmed = tournamentPlayers.filter((p) => p.status !== "registered");
    if (!confirmed.length) return alert("No confirmed standings to export yet.");

    const canvas = document.createElement("canvas");
    const width = 1080;
    const rowHeight = 54;
    const headerHeight = 320;
    const footerHeight = 110;
    const height = Math.max(1350, headerHeight + confirmed.length * rowHeight + footerHeight);

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

    // Header Accent Glow
    const glow = ctx.createRadialGradient(width - 100, 100, 10, width - 100, 100, 450);
    glow.addColorStop(0, "rgba(216,255,69,0.18)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, 600);

    // Header Branding
    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("CHILLPILL GAMING CAFE", 60, 80);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 16px monospace";
    ctx.fillText("OFFICIAL TOURNAMENT STANDINGS", 60, 115);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 48px sans-serif";
    ctx.fillText(currentTournament.name || "EA FC Tournament", 60, 180);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    const fmt = currentTournament.format === "knockout" ? "Direct Knockout" : "Group Stage";
    const dateStr = currentTournament.start_date
      ? new Date(currentTournament.start_date).toLocaleDateString("en-IN", { dateStyle: "long" })
      : "Live Season";
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
      const getRank = (p) => (p.status === "winner" ? 0 : p.status === "runner_up" ? 1 : p.wins > 0 && p.losses === 0 ? 2 : p.losses > 0 ? 4 : 3);
      const diff = getRank(a) - getRank(b);
      if (diff !== 0) return diff;
      return (b.wins || 0) - (a.wins || 0);
    });

    sorted.forEach((p, idx) => {
      const y = tableTop + 44 + idx * rowHeight;

      if (idx % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fillRect(50, y, width - 100, rowHeight);
      }

      ctx.fillStyle = p.status === "winner" ? "#d8ff45" : "#94a3b8";
      ctx.font = "bold 18px monospace";
      ctx.fillText(p.status === "winner" ? "★" : String(idx + 1), 75, y + 34);

      ctx.fillStyle = p.status === "winner" ? "#d8ff45" : "#ffffff";
      ctx.font = "bold 18px sans-serif";
      const name = p.player_name + (p.gamertag ? ` (${p.gamertag})` : "");
      ctx.fillText(name.slice(0, 26), 130, y + 34);

      const prog = (function () {
        if (p.status === "winner") return "🥇 Champion";
        if (p.status === "runner_up") return "🥈 Runner-Up";
        if (p.losses > 0 || p.status === "eliminated") return "❌ Knocked Out";
        if (p.wins > 0 && p.losses === 0) return "🔥 Advanced";
        return "⏳ Active";
      })();

      ctx.fillStyle = prog.includes("Champion") ? "#d8ff45" : prog.includes("Runner-Up") ? "#38bdf8" : prog.includes("Knocked") ? "#f43f5e" : "#10b981";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(prog, 460, y + 34);

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

      ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, y + rowHeight);
      ctx.lineTo(width - 50, y + rowHeight);
      ctx.stroke();
    });

    const footY = height - 60;
    ctx.fillStyle = "#d8ff45";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("ChillPill Gaming Cafe", 60, footY);

    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText("📍 Budhanilkantha, Kathmandu  ·  WhatsApp: +977 9765130636  ·  www.chillpill.com.np", 280, footY);

    const filename = `${(currentTournament.name || "Tournament").replace(/\s+/g, "_")}_Standings.png`;
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    });
  }

  function downloadPublicFixtures() {
    if (!currentTournament) return;
    if (!tournamentMatches.length) return alert("No fixtures generated yet to download.");

    const canvas = document.createElement("canvas");
    const width = 1200;
    const rounds = [...new Set(tournamentMatches.map((m) => m.round_name))];
    const height = Math.max(1200, 280 + tournamentMatches.length * 75 + rounds.length * 60 + 100);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080c14");
    bgGrad.addColorStop(1, "#05080f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

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

    rounds.forEach((rn) => {
      const rMatches = tournamentMatches.filter((m) => m.round_name === rn);

      ctx.fillStyle = "rgba(216,255,69,0.12)";
      ctx.fillRect(60, curY, width - 120, 36);
      ctx.fillStyle = "#d8ff45";
      ctx.font = "bold 16px monospace";
      ctx.fillText(rn.toUpperCase(), 75, curY + 24);
      curY += 50;

      rMatches.forEach((m) => {
        const p1 = tournamentPlayers.find((p) => p.id === m.player1_id);
        const p2 = tournamentPlayers.find((p) => p.id === m.player2_id);
        const isDone = m.status === "completed";

        ctx.fillStyle = isDone ? "rgba(216,255,69,0.04)" : "#101622";
        ctx.strokeStyle = isDone ? "rgba(216,255,69,0.3)" : "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(60, curY, width - 120, 60, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#64748b";
        ctx.font = "bold 13px monospace";
        ctx.fillText(`MATCH ${m.match_number}`, 80, curY + 36);

        ctx.fillStyle = m.winner_id === m.player1_id ? "#d8ff45" : "#ffffff";
        ctx.font = m.winner_id === m.player1_id ? "bold 18px sans-serif" : "18px sans-serif";
        ctx.fillText(p1 ? p1.player_name : "TBD", 220, curY + 36);

        ctx.fillStyle = isDone ? "#ffffff" : "#64748b";
        ctx.font = "900 20px monospace";
        const scoreText = isDone ? `${m.player1_score ?? 0}  -  ${m.player2_score ?? 0}` : "VS";
        ctx.fillText(scoreText, 560, curY + 36);

        ctx.fillStyle = m.winner_id === m.player2_id ? "#d8ff45" : "#ffffff";
        ctx.font = m.winner_id === m.player2_id ? "bold 18px sans-serif" : "18px sans-serif";
        ctx.fillText(p2 ? p2.player_name : m.status === "bye" ? "BYE" : "TBD", 720, curY + 36);

        ctx.fillStyle = isDone ? "#d8ff45" : "#94a3b8";
        ctx.font = "bold 12px monospace";
        ctx.fillText(m.status.toUpperCase(), 1060, curY + 36);

        curY += 72;
      });

      curY += 20;
    });

    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText("ChillPill Gaming Cafe · Budhanilkantha, Kathmandu · WhatsApp: +977 9765130636", 60, height - 40);

    const filename = `${(currentTournament.name || "Tournament").replace(/\s+/g, "_")}_Fixtures.png`;
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    });
  }

  // ── BIG SCREEN / FULLSCREEN STANDINGS ─────────────────────────────────────
  function openPublicFullscreenStandings() {
    if (!currentTournament) return;
    const confirmed = tournamentPlayers.filter((p) => p.status !== "registered");
    const container = document.getElementById("fsm-standings-view");
    const titleEl = document.getElementById("fsm-title");
    const subEl = document.getElementById("fsm-subtitle");
    const modal = document.getElementById("fullscreen-standings-modal");
    if (!container || !modal) return;

    if (titleEl) titleEl.textContent = `${(currentTournament.name || "Tournament").toUpperCase()}`;
    if (subEl) subEl.textContent = `${currentTournament.game || "EA FC"} · Official Standings · Big Screen`;

    if (!confirmed.length) {
      container.innerHTML = '<p class="text-lg text-slate-400 italic text-center py-16">No confirmed players yet.</p>';
      modal.classList.remove("hidden");
      return;
    }

    const isGroups = currentTournament.format !== "knockout";

    if (!isGroups) {
      const sorted = [...confirmed].sort((a, b) => {
        const getRank = (p) => (p.status === "winner" ? 0 : p.status === "runner_up" ? 1 : p.wins > 0 && p.losses === 0 ? 2 : p.losses > 0 ? 4 : 3);
        const diff = getRank(a) - getRank(b);
        if (diff !== 0) return diff;
        if (b.wins !== a.wins) return (b.wins || 0) - (a.wins || 0);
        const gdA = (a.goals_for || 0) - (a.goals_against || 0);
        const gdB = (b.goals_for || 0) - (b.goals_against || 0);
        if (gdB !== gdA) return gdB - gdA;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      container.innerHTML = renderBigScreenPublicTable(sorted, false);
    } else {
      const groups = [...new Set(confirmed.map((p) => p.group_name).filter(Boolean))].sort();
      if (!groups.length) {
        container.innerHTML = '<p class="text-lg text-slate-400 italic text-center py-16">Group draw in progress.</p>';
      } else {
        container.innerHTML = groups
          .map((g) => {
            const gp = [...confirmed.filter((p) => p.group_name === g)].sort((a, b) => {
              if (b.points !== a.points) return b.points - a.points;
              const gdA = (a.goals_for || 0) - (a.goals_against || 0);
              const gdB = (b.goals_for || 0) - (b.goals_against || 0);
              if (gdB !== gdA) return gdB - gdA;
              return (b.goals_for || 0) - (a.goals_for || 0);
            });
            return `<div class="mb-6"><p class="text-sm font-black text-[#d8ff45] uppercase tracking-wider mb-2">Group ${esc(g)}</p>${renderBigScreenPublicTable(gp, true)}</div>`;
          })
          .join("");
      }
    }

    modal.classList.remove("hidden");
  }

  function renderBigScreenPublicTable(players, isGroups) {
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
          ${players
            .map((p, i) => {
              const isWinner = p.status === "winner";
              const isAdvancing = isGroups && i < 2;
              const isKnockout = !isGroups;
              const prog = isKnockout
                ? (function () {
                    if (p.status === "winner") return { label: "🥇 Champion", cls: "text-[#d8ff45] font-black bg-[#d8ff45]/20 border border-[#d8ff45]/40" };
                    if (p.status === "runner_up") return { label: "🥈 Runner-Up", cls: "text-sky-300 font-bold bg-sky-500/20 border border-sky-500/40" };
                    if (p.losses > 0 || p.status === "eliminated") return { label: "❌ Knocked Out", cls: "text-rose-400 bg-rose-500/15 border border-rose-500/30" };
                    if (p.wins > 0 && p.losses === 0) return { label: "🔥 Advanced", cls: "text-emerald-400 font-bold bg-emerald-500/20 border border-emerald-500/40" };
                    return { label: "⏳ Active", cls: "text-slate-400 bg-slate-800 border border-slate-700" };
                  })()
                : null;
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
            })
            .join("")}
        </div>
      </div>`;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    loadTournamentHub();
    document.getElementById("pub-download-standings")?.addEventListener("click", downloadPublicStandings);
    document.getElementById("pub-download-fixtures")?.addEventListener("click", downloadPublicFixtures);
    document.getElementById("pub-fullscreen-standings")?.addEventListener("click", openPublicFullscreenStandings);
    document.getElementById("fullscreen-standings-close")?.addEventListener("click", () => {
      document.getElementById("fullscreen-standings-modal")?.classList.add("hidden");
    });
    document.getElementById("fsm-toggle-fullscreen-btn")?.addEventListener("click", () => {
      const modal = document.getElementById("fullscreen-standings-modal");
      if (!document.fullscreenElement) {
        modal?.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
  });
})();
