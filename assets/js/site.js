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
    let notice = null;

    if (window.SUPABASE_CONFIGURED) {
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
        console.warn("[ChillPill] Notice fetch failed, using default:", err);
      }
    }

    // If notice found from DB, update the modal elements
    if (notice) {
      const titleEl = document.getElementById("notice-modal-title");
      const badgeEl = document.getElementById("notice-badge");
      const bodyEl = document.getElementById("notice-body-text");
      const imgWrap = document.getElementById("notice-image-wrap");
      const imgEl = document.getElementById("notice-image");
      const actionBtn = document.getElementById("notice-action-btn");
      const bannerText = document.getElementById("banner-text");

      if (titleEl && notice.title) titleEl.textContent = notice.title;
      if (badgeEl && notice.badge) badgeEl.textContent = notice.badge;
      if (bodyEl && notice.message) bodyEl.textContent = notice.message;
      if (bannerText && notice.title) bannerText.innerHTML = `<strong>${notice.title}</strong> — Click for Details`;

      if (notice.image_url && imgWrap && imgEl) {
        imgEl.src = notice.image_url;
        imgWrap.classList.remove("hidden");
      }

      if (notice.button_text && actionBtn) {
        actionBtn.innerHTML = `<i data-lucide="message-circle" width="16" height="16"></i> ${notice.button_text}`;
      }
      if (notice.button_url && actionBtn) {
        actionBtn.href = notice.button_url;
      }
    }

    // Auto popup if not dismissed in this session
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("cp_notice_dismissed") === "1";
    } catch (e) {}

    // If never dismissed, show popup smoothly after 600ms
    if (!dismissed) {
      setTimeout(() => {
        openNoticeModal();
      }, 600);
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

  document.addEventListener("DOMContentLoaded", () => {
    fillCafeInfo();
    wireWhatsappLinks();
    wireMobileMenu();
    wireNoticeModal();
    loadSettings();
    loadMenu();
    loadNotices();
    if (window.lucide) lucide.createIcons();
  });
})();
