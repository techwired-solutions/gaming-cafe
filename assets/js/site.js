/**
 * ChillPill Gaming Cafe — public website logic.
 * Cafe info (name, tagline, hours, address, WhatsApp number) and announcements/notices
 * are pulled live from Supabase. Falls back to default config if offline.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const live = {
    CAFE_NAME: CFG.CAFE_NAME || "ChillPill Gaming Cafe",
    CAFE_TAGLINE: CFG.CAFE_TAGLINE || "Console gaming, snacks & good vibes.",
    CAFE_LOCATION: CFG.CAFE_LOCATION || "Budhanilkantha, Kathmandu",
    CAFE_ADDRESS_LINE: CFG.CAFE_ADDRESS_LINE || "Budhanilkantha, Kathmandu, Nepal",
    OPENING_HOURS: CFG.OPENING_HOURS || "7:00 AM – 8:00 PM · Every day",
    WHATSAPP_NUMBER: CFG.WHATSAPP_NUMBER || "9779765130636",
    WHATSAPP_DEFAULT_MESSAGE: CFG.WHATSAPP_DEFAULT_MESSAGE || "Hi! I'd like to book a PlayStation slot at ChillPill Gaming Cafe."
  };

  const inr = (value) =>
    "रु " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0);

  // Default menu items if Supabase table is empty or offline
  const DEFAULT_MENU = [
    // Coffee
    { name: "Ice Americano", price: 170, category: "Specialty Coffee (Hot & Cold)" },
    { name: "Americano (Hot/Cold)", price: 150, category: "Specialty Coffee (Hot & Cold)" },
    { name: "Cappuccino (Hot/Cold)", price: 180, category: "Specialty Coffee (Hot & Cold)" },
    { name: "Espresso (Single/Double)", price: 120, category: "Specialty Coffee (Hot & Cold)" },
    // Cold Drinks & Beverages
    { name: "Fresh Mint Mojito", price: 150, category: "Chilled Drinks & Refreshers" },
    { name: "Sweet Lassi", price: 120, category: "Chilled Drinks & Refreshers" },
    { name: "Banana Lassi", price: 140, category: "Chilled Drinks & Refreshers" },
    { name: "Coke", price: 60, category: "Chilled Drinks & Refreshers" },
    { name: "Sprite", price: 60, category: "Chilled Drinks & Refreshers" },
    { name: "Fanta", price: 60, category: "Chilled Drinks & Refreshers" },
    { name: "Chilled Beer", price: 350, category: "Chilled Drinks & Refreshers" },
    // Bakery & Pastries
    { name: "Butter Croissant", price: 120, category: "Bakery & Desserts" },
    { name: "Fresh Muffins", price: 80, category: "Bakery & Desserts" },
    { name: "Glazed Donuts", price: 90, category: "Bakery & Desserts" },
    { name: "Chocochip Cookies", price: 60, category: "Bakery & Desserts" },
    { name: "Chocolate Brownies", price: 120, category: "Bakery & Desserts" },
    { name: "Assorted Pastries", price: 130, category: "Bakery & Desserts" },
    // Food & Hot Snacks
    { name: "Sekuwa (Chicken/Buff)", price: 250, category: "Hot Snacks & Bites" },
    { name: "Grilled Club Sandwich", price: 180, category: "Hot Snacks & Bites" },
    { name: "Fresh Patties (Veg/Chicken)", price: 70, category: "Hot Snacks & Bites" }
  ];

  function whatsappUrl(message) {
    const number = (live.WHATSAPP_NUMBER || "").replace(/[^\d]/g, "");
    const text = encodeURIComponent(message || live.WHATSAPP_DEFAULT_MESSAGE || "Hi! I'd like to book a PlayStation slot.");
    if (!number || !live.WHATSAPP_NUMBER || live.WHATSAPP_NUMBER.startsWith("PLACEHOLDER")) return null;
    return `https://wa.me/${number}?text=${text}`;
  }

  function wireWhatsappLinks() {
    const url = whatsappUrl();
    const ids = ["nav-whatsapp", "nav-whatsapp-mobile", "hero-whatsapp", "pricing-whatsapp", "contact-whatsapp", "fab-whatsapp"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (url) {
        el.href = url;
        el.setAttribute("target", "_blank");
        el.removeAttribute("title");
      } else {
        el.removeAttribute("target");
        el.href = "#contact";
        el.title = "WhatsApp number not set up yet — see the Contact section.";
      }
    });
  }

  function fillCafeInfo() {
    document.title = `${live.CAFE_NAME || "ChillPill Gaming Cafe"} — ${live.CAFE_LOCATION || ""}`;
    const set = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
    set("hero-tagline", live.CAFE_TAGLINE);
    set("hero-location", "📍 " + (live.CAFE_LOCATION || ""));
    set("hero-hours", live.OPENING_HOURS);
    set("contact-address", live.CAFE_ADDRESS_LINE);
    set("contact-hours", live.OPENING_HOURS);
    set("footer-cafe-name", live.CAFE_NAME);
    const yr = document.getElementById("footer-year");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  function wireMobileMenu() {
    const button = document.getElementById("mobile-menu-button");
    const menu = document.getElementById("mobile-menu");
    if (!button || !menu) return;
    button.addEventListener("click", () => {
      const isHidden = menu.classList.toggle("hidden");
      button.setAttribute("aria-expanded", String(!isHidden));
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => menu.classList.add("hidden")));
  }

  // ---------- NOTICE POPUP SYSTEM ----------
  let currentActiveNoticeId = null;

  function openNoticeModal() {
    const modal = document.getElementById("notice-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
  }

  function closeNoticeModal() {
    const modal = document.getElementById("notice-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
    try {
      sessionStorage.setItem("cp_notice_dismissed", "1");
      if (currentActiveNoticeId) {
        sessionStorage.setItem("cp_notice_dismissed_" + currentActiveNoticeId, "1");
      }
    } catch (e) {}
  }

  function wireNoticeModal() {
    const closeX = document.getElementById("notice-close-x");
    const dismissBtn = document.getElementById("notice-dismiss-btn");
    const modal = document.getElementById("notice-modal");
    const banner = document.getElementById("top-announcement-banner");

    if (closeX) closeX.addEventListener("click", closeNoticeModal);
    if (dismissBtn) dismissBtn.addEventListener("click", closeNoticeModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeNoticeModal();
      });
    }
    if (banner) {
      banner.addEventListener("click", openNoticeModal);
    }
  }

  async function loadNotices() {
    const banner = document.getElementById("top-announcement-banner");
    const modal = document.getElementById("notice-modal");

    // Ensure hidden by default
    if (banner) {
      banner.classList.add("hidden");
      banner.classList.remove("flex");
    }
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }

    let notice = null;

    if (window.SUPABASE_CONFIGURED && window.sb) {
      try {
        const { data, error } = await window.sb
          .from("notices")
          .select("*")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          notice = data;
        }
      } catch (err) {
        console.warn("[ChillPill] Notice fetch failed:", err);
      }
    }

    // If no active notice exists, keep everything hidden and exit!
    if (!notice || !notice.active) {
      return;
    }

    currentActiveNoticeId = notice.id;

    // Show and configure the top announcement banner
    if (banner) {
      const bannerBadge = document.getElementById("banner-badge");
      const bannerText = document.getElementById("banner-text");

      if (bannerBadge && notice.badge) bannerBadge.textContent = notice.badge;
      if (bannerText && notice.title) {
        bannerText.innerHTML = `<strong>${notice.title}</strong>`;
      }
      banner.classList.remove("hidden");
      banner.classList.add("flex");
    }

    // Configure the modal elements
    const titleEl = document.getElementById("notice-modal-title");
    const badgeEl = document.getElementById("notice-badge");
    const bodyEl = document.getElementById("notice-body-text");
    const imgWrap = document.getElementById("notice-image-wrap");
    const imgEl = document.getElementById("notice-image");
    const actionBtn = document.getElementById("notice-action-btn");
    const actionBtnText = document.getElementById("notice-action-btn-text");

    if (titleEl && notice.title) titleEl.textContent = notice.title;
    if (badgeEl && notice.badge) badgeEl.textContent = notice.badge;
    if (bodyEl && notice.message) bodyEl.textContent = notice.message;

    if (notice.image_url && imgWrap && imgEl) {
      imgEl.src = notice.image_url;
      imgWrap.classList.remove("hidden");
    } else if (imgWrap) {
      imgWrap.classList.add("hidden");
    }

    if (actionBtn) {
      if (notice.button_url || notice.button_text) {
        actionBtn.classList.remove("hidden");
        if (actionBtnText && notice.button_text) actionBtnText.textContent = notice.button_text;
        actionBtn.href = notice.button_url || whatsappUrl() || "#contact";
      } else {
        const waUrl = whatsappUrl();
        if (waUrl) {
          actionBtn.classList.remove("hidden");
          if (actionBtnText) actionBtnText.textContent = "Inquire on WhatsApp";
          actionBtn.href = waUrl;
        } else {
          actionBtn.classList.add("hidden");
        }
      }
    }

    if (window.lucide) {
      lucide.createIcons();
    }

    // Only auto popup if the notice has popup enabled and hasn't been dismissed in this session
    if (notice.popup) {
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem("cp_notice_dismissed_" + notice.id) === "1" ||
                    sessionStorage.getItem("cp_notice_dismissed") === "1";
      } catch (e) {}

      if (!dismissed) {
        setTimeout(() => {
          openNoticeModal();
        }, 600);
      }
    }
  }

  // ---------- MENU SYSTEM ----------
  function renderCategorizedMenu(items) {
    const grid = document.getElementById("menu-grid");
    const fallback = document.getElementById("menu-fallback");
    if (!grid) return;

    if (!items || !items.length) {
      if (fallback) fallback.classList.remove("hidden");
      return;
    }
    if (fallback) fallback.classList.add("hidden");

    // Group items by category
    const categories = {};
    items.forEach((item) => {
      const cat = item.category || "Food & Drinks";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });

    let html = "";
    Object.keys(categories).forEach((catName) => {
      const catItems = categories[catName];
      html += `
        <div class="menu-category-group">
          <div class="flex items-center gap-3 mb-3">
            <h3 class="text-lg font-bold text-slate-200">${catName}</h3>
            <div class="h-px flex-1 bg-slate-700/60"></div>
            <span class="mono text-xs text-[#d8ff45] font-semibold">${catItems.length} items</span>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${catItems
              .map(
                (item) => `
              <div class="panel rounded-xl p-4 flex items-center justify-between gap-3 hover:border-slate-500 transition">
                <span class="font-medium text-slate-100">${item.name}</span>
                <span class="mono text-[#d8ff45] font-bold shrink-0">${inr(item.price)}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  async function loadSettings() {
    if (!window.SUPABASE_CONFIGURED) return;
    try {
      const { data, error } = await window.sb.from("settings").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return;
      if (data.cafe_name) live.CAFE_NAME = data.cafe_name;
      if (data.cafe_tagline) live.CAFE_TAGLINE = data.cafe_tagline;
      if (data.cafe_location) live.CAFE_LOCATION = data.cafe_location;
      if (data.cafe_address) live.CAFE_ADDRESS_LINE = data.cafe_address;
      if (data.opening_hours) live.OPENING_HOURS = data.opening_hours;
      if (data.whatsapp_number) live.WHATSAPP_NUMBER = data.whatsapp_number;
      if (data.whatsapp_message) live.WHATSAPP_DEFAULT_MESSAGE = data.whatsapp_message;
      fillCafeInfo();
      wireWhatsappLinks();
    } catch (e) {
      console.warn("[ChillPill] Settings fetch error:", e);
    }
  }

  async function loadMenu() {
    let items = [];

    if (window.SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await window.sb
          .from("menu_items")
          .select("*")
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        if (!error && data && data.length) {
          // Exclude station add-ons (like "Extra Joystick") from food menu
          items = data.filter((item) => item.category !== "Add-ons");
        }
      } catch (err) {
        console.warn("[ChillPill] Menu fetch error:", err);
      }
    }

    // Fall back to default menu items if DB is empty or offline
    if (!items.length) {
      items = DEFAULT_MENU;
    }

    renderCategorizedMenu(items);
  }

  // ── FAQ accordion ──────────────────────────────────────────────────────────
  function initFaqAccordion() {
    const accordion = document.getElementById("faq-accordion");
    if (!accordion) return;
    accordion.querySelectorAll(".faq-question").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        const isOpen = item.classList.contains("open");
        // Close all
        accordion.querySelectorAll(".faq-item.open").forEach((el) => {
          el.classList.remove("open");
          el.querySelector(".faq-question").setAttribute("aria-expanded", "false");
        });
        // Open clicked (unless it was already open)
        if (!isOpen) {
          item.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
      });
    });
  }

  // ── TOURNAMENTS (public homepage) ───────────────────────────────────────
  async function loadTournament() {
    if (!window.SUPABASE_CONFIGURED || !window.sb) return;

    try {
      // Fetch the first tournament that should be shown on the homepage
      const { data: t } = await window.sb.from("tournaments")
        .select("*")
        .eq("show_on_homepage", true)
        .not("status", "eq", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!t) return; // Nothing to show

      // Fetch players and matches
      const [{ data: players }, { data: matches }] = await Promise.all([
        window.sb.from("tournament_players").select("*").eq("tournament_id", t.id).order("created_at"),
        window.sb.from("tournament_matches").select("*").eq("tournament_id", t.id).order("round_number").order("match_number")
      ]);

      renderTournamentSection(t, players || [], matches || []);
    } catch (err) {
      console.warn("[ChillPill] Tournament load error:", err);
    }
  }

  function renderTournamentSection(t, players, matches) {
    const section = document.getElementById("tournaments");
    if (!section) return;
    section.classList.remove("hidden");

    // Title + status
    const titleEl = document.getElementById("trn-title");
    if (titleEl) titleEl.textContent = t.name;
    const subtitleEl = document.getElementById("trn-subtitle");
    if (subtitleEl) subtitleEl.textContent = t.description || (t.game + " · " + (t.format === "knockout" ? "Direct Knockout" : "Group Stage"));

    const statusMap = {
      registration_open: { label: "Registration Open", cls: "bg-green-500/20 text-green-300 border border-green-500/40" },
      registration_closed: { label: "Registration Closed", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
      ongoing: { label: "Ongoing", cls: "bg-sky-500/20 text-sky-300 border border-sky-500/40" },
      completed: { label: "Completed", cls: "bg-[#d8ff45]/20 text-[#d8ff45] border border-[#d8ff45]/40" },
      draft: { label: "Coming Soon", cls: "bg-slate-700 text-slate-300" }
    };
    const statusInfo = statusMap[t.status] || { label: t.status, cls: "bg-slate-700 text-slate-300" };
    const badge = document.getElementById("trn-status-badge");
    if (badge) { badge.textContent = statusInfo.label; badge.className = `text-sm font-bold px-3 py-1 rounded-full self-start sm:self-auto ${statusInfo.cls}`; }

    // Meta
    const meta = document.getElementById("trn-meta");
    if (meta) {
      meta.innerHTML = [
        t.start_date ? `<span>📅 ${new Date(t.start_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>` : "",
        t.registration_deadline && t.status === "registration_open" ? `<span>⏰ Register by ${new Date(t.registration_deadline).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>` : "",
        t.max_players ? `<span>👥 ${players.length}/${t.max_players} registered</span>` : "",
        t.entry_fee > 0 ? `<span>🎟️ Entry: रु ${t.entry_fee}</span>` : `<span>🆓 Free Entry</span>`,
        `<span>${t.format === "knockout" ? "🏆 Knockout" : "⚔️ Group Stage + Knockout"}</span>`
      ].filter(Boolean).join("");
    }

    // Prize pool
    const prizes = Array.isArray(t.prize_pool) ? t.prize_pool : [];
    const prizesSection = document.getElementById("trn-prizes-section");
    const prizesEl = document.getElementById("trn-prizes");
    if (prizes.length && prizesSection && prizesEl) {
      prizesSection.classList.remove("hidden");
      const medals = ["🥇", "🥈", "🥉", "🏅"];
      prizesEl.innerHTML = prizes.map((p, i) => `
        <div class="panel rounded-2xl p-5 text-center">
          <p class="text-3xl mb-2">${medals[i] || "🏅"}</p>
          <p class="font-bold">${esc(p.place || `#${i + 1}`)}</p>
          <p class="text-[#d8ff45] font-bold text-sm mt-1">${esc(p.reward || "TBD")}</p>
        </div>`).join("");
    }

    // Show/hide sections based on status
    const regSection = document.getElementById("trn-registration-section");
    const bracketSection = document.getElementById("trn-bracket-section");
    const winnersSection = document.getElementById("trn-winners-section");

    [regSection, bracketSection, winnersSection].forEach(el => el?.classList.add("hidden"));

    if (t.status === "registration_open") {
      regSection?.classList.remove("hidden");
      document.getElementById("trn-tournament-id").value = t.id;
      if (t.rules) {
        document.getElementById("trn-rules-card")?.classList.remove("hidden");
        const rt = document.getElementById("trn-rules-text");
        if (rt) rt.textContent = t.rules;
      }
      initRegistrationForm(t, players);
    } else if (["registration_closed", "ongoing"].includes(t.status)) {
      bracketSection?.classList.remove("hidden");
      renderPublicBracket(t, players, matches);
    } else if (t.status === "completed") {
      bracketSection?.classList.remove("hidden");
      renderPublicBracket(t, players, matches);
      winnersSection?.classList.remove("hidden");
      renderPublicWinners(players);
    }
  }

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderPublicBracket(t, players, matches) {
    // Group standings for group stage
    if (t.format === "group_stage") {
      const standingsSection = document.getElementById("trn-standings-section");
      const standingsEl = document.getElementById("trn-standings-public");
      const groups = [...new Set(players.map(p => p.group_name).filter(Boolean))].sort();
      if (groups.length && standingsSection && standingsEl) {
        standingsSection.classList.remove("hidden");
        standingsEl.innerHTML = groups.map(g => {
          const gp = [...players.filter(p => p.group_name === g)]
            .sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against));
          return `
            <div>
              <p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider mb-2">Group ${esc(g)}</p>
              <div class="panel rounded-2xl overflow-hidden">
                <div class="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] text-[11px] text-slate-500 font-semibold px-4 py-2 bg-[#0f1520] border-b border-slate-700/60 gap-2">
                  <span>Player</span><span class="text-center">P</span><span class="text-center">W</span><span class="text-center">D</span><span class="text-center">L</span><span class="text-center">GD</span><span class="text-center text-[#d8ff45]">Pts</span>
                </div>
                <div class="divide-y divide-slate-800/60">
                  ${gp.map((p, i) => `
                    <div class="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] px-4 py-2.5 items-center text-sm gap-2 ${i < 2 ? "bg-sky-500/5" : ""}">
                      <span class="truncate flex items-center gap-2">
                        <span class="text-slate-500 text-xs">${i + 1}.</span>
                        ${esc(p.player_name)}
                      </span>
                      <span class="text-center text-xs text-slate-400">${p.wins + p.draws + p.losses}</span>
                      <span class="text-center text-xs">${p.wins}</span>
                      <span class="text-center text-xs">${p.draws}</span>
                      <span class="text-center text-xs">${p.losses}</span>
                      <span class="text-center text-xs">${p.goals_for - p.goals_against > 0 ? "+" : ""}${p.goals_for - p.goals_against}</span>
                      <span class="text-center font-bold text-[#d8ff45]">${p.points}</span>
                    </div>`).join("")}
                </div>
              </div>
            </div>`;
        }).join("");
      }
    }

    // Fixtures
    const fixturesEl = document.getElementById("trn-fixtures-public");
    if (!fixturesEl || !matches.length) return;
    const rounds = [...new Set(matches.map(m => m.round_name))];
    fixturesEl.innerHTML = rounds.map(rn => {
      const rMatches = matches.filter(m => m.round_name === rn);
      return `
        <div class="mb-5">
          <p class="text-xs font-bold text-[#d8ff45] uppercase tracking-wider mb-2">${esc(rn)}</p>
          <div class="space-y-2">
            ${rMatches.map(m => {
              const p1 = players.find(p => p.id === m.player1_id);
              const p2 = players.find(p => p.id === m.player2_id);
              const sched = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "";
              return `
                <div class="panel rounded-xl px-4 py-3 flex items-center gap-4">
                  <div class="flex-1 flex items-center gap-3 min-w-0">
                    <span class="font-bold text-sm truncate ${m.winner_id === m.player1_id ? "text-[#d8ff45]" : ""}">${p1 ? esc(p1.player_name) : "TBD"}</span>
                    <span class="mono font-black text-base shrink-0 ${m.status === "completed" ? "text-white" : "text-slate-600"}">
                      ${m.status === "completed" ? `${m.player1_score ?? 0} – ${m.player2_score ?? 0}` : "vs"}
                    </span>
                    <span class="font-bold text-sm truncate ${m.winner_id === m.player2_id ? "text-[#d8ff45]" : ""}">${p2 ? esc(p2.player_name) : m.status === "bye" ? "BYE" : "TBD"}</span>
                  </div>
                  ${sched ? `<span class="text-xs text-slate-500 shrink-0 hidden sm:block">${sched}</span>` : ""}
                  <span class="text-[11px] px-2 py-0.5 rounded-full shrink-0 ${m.status === "completed" ? "bg-[#d8ff45]/20 text-[#d8ff45]" : "bg-slate-700 text-slate-400"}">${m.status}</span>
                </div>`;
            }).join("")}
          </div>
        </div>`;
    }).join("");
  }

  function renderPublicWinners(players) {
    const el = document.getElementById("trn-winners-display");
    if (!el) return;
    const winner = players.find(p => p.status === "winner");
    const runnerUp = players.find(p => p.status === "runner_up");
    const medals = [
      { label: "🥇 Champion", player: winner },
      { label: "🥈 Runner Up", player: runnerUp }
    ].filter(x => x.player);
    if (!medals.length) { el.innerHTML = '<p class="text-slate-400 text-sm col-span-3">Winners will be announced soon.</p>'; return; }
    el.innerHTML = medals.map(({ label, player }) => `
      <div class="panel rounded-2xl p-6 text-center">
        <p class="text-4xl mb-3">${label.split(" ")[0]}</p>
        <p class="font-bold text-lg">${esc(player.player_name)}</p>
        ${player.gamertag ? `<p class="text-sm text-slate-400">${esc(player.gamertag)}</p>` : ""}
        ${player.team_name ? `<p class="text-xs text-slate-500 mt-1">${esc(player.team_name)}</p>` : ""}
        <p class="text-xs font-bold text-slate-400 mt-2">${label.split(" ").slice(1).join(" ")}</p>
      </div>`).join("");
  }

  function initRegistrationForm(t, players) {
    const form = document.getElementById("tournament-register-form");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("trn-form-msg");
      const btn = document.getElementById("trn-submit-btn");
      const label = document.getElementById("trn-submit-label");
      const name = document.getElementById("trn-player-name").value.trim();
      const gamertag = document.getElementById("trn-gamertag").value.trim();
      const phone = document.getElementById("trn-phone").value.trim();
      const team = document.getElementById("trn-team").value.trim();

      if (!name || !gamertag || !phone) {
        msg.textContent = "Please fill all required fields.";
        msg.className = "text-sm text-red-400";
        return;
      }

      // Duplicate check
      const duplicate = players.find(p =>
        p.phone === phone || p.gamertag?.toLowerCase() === gamertag.toLowerCase()
      );
      if (duplicate) {
        msg.textContent = "You're already registered! We'll contact you with match details.";
        msg.className = "text-sm text-amber-400";
        return;
      }

      if (players.length >= t.max_players) {
        msg.textContent = "Sorry, all slots are filled. You can ask staff to be added to the waitlist.";
        msg.className = "text-sm text-red-400";
        return;
      }

      btn.disabled = true;
      label.textContent = "Registering...";
      msg.textContent = "";

      try {
        if (!window.sb) throw new Error("Not connected to database.");
        const { error } = await window.sb.from("tournament_players").insert({
          tournament_id: t.id,
          player_name: name,
          gamertag,
          phone,
          team_name: team || null,
          status: "registered"
        });
        if (error) throw error;
        msg.textContent = "🎉 You're registered! We'll contact you with match schedule details.";
        msg.className = "text-sm text-green-400 font-semibold";
        label.textContent = "Registered ✓";
        form.reset();
        players.push({ player_name: name, gamertag, phone }); // Prevent double-submit
      } catch (err) {
        msg.textContent = "Registration failed: " + (err.message || "Please try again.");
        msg.className = "text-sm text-red-400";
        btn.disabled = false;
        label.textContent = "Register for Tournament";
      }
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillCafeInfo();
    wireWhatsappLinks();
    wireMobileMenu();
    wireNoticeModal();
    loadSettings();
    loadMenu();
    loadNotices();
    loadTournament();
    initFaqAccordion();
    if (window.lucide) lucide.createIcons();
  });
})();
