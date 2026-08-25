/**
 * ChillPill Gaming Cafe — public website logic.
 * Cafe info (name, tagline, hours, address, WhatsApp number) is pulled live
 * from Supabase's `settings` row — the same one editable from the
 * dashboard's Cafe Content tab — so the owner never has to touch code or
 * redeploy to update the site. Falls back to assets/js/config.js defaults
 * if Supabase isn't configured yet or a field hasn't been set.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  // Live values from Supabase settings merge on top of these fallbacks.
  const live = {
    CAFE_NAME: CFG.CAFE_NAME,
    CAFE_TAGLINE: CFG.CAFE_TAGLINE,
    CAFE_LOCATION: CFG.CAFE_LOCATION,
    CAFE_ADDRESS_LINE: CFG.CAFE_ADDRESS_LINE,
    OPENING_HOURS: CFG.OPENING_HOURS,
    WHATSAPP_NUMBER: CFG.WHATSAPP_NUMBER,
    WHATSAPP_DEFAULT_MESSAGE: CFG.WHATSAPP_DEFAULT_MESSAGE
  };

  const inr = (value) =>
    "रु " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0);

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
    document.getElementById("footer-year").textContent = new Date().getFullYear();
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

  async function loadSettings() {
    if (!window.SUPABASE_CONFIGURED) return;
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
  }

  async function loadMenu() {
    const grid = document.getElementById("menu-grid");
    const fallback = document.getElementById("menu-fallback");
    if (!window.SUPABASE_CONFIGURED) {
      fallback.classList.remove("hidden");
      return;
    }
    const { data, error } = await window.sb.from("menu_items").select("*").order("category", { ascending: true }).order("name", { ascending: true });
    if (error || !data || !data.length) {
      fallback.classList.remove("hidden");
      return;
    }
    // This section is Food & Drinks only — station add-ons (e.g. "Extra
    // Joystick") are billable line items in the dashboard, not menu food,
    // so they're priced on the Pricing section instead of listed here.
    const foodItems = data.filter((item) => item.category !== "Add-ons");
    if (!foodItems.length) {
      fallback.classList.remove("hidden");
      return;
    }
    fallback.classList.add("hidden");
    grid.innerHTML = foodItems
      .map(
        (item) => `
      <div class="panel rounded-xl p-4 flex items-center justify-between gap-3">
        <span class="font-medium">${item.name}</span>
        <span class="mono text-[#d8ff45] font-bold">${inr(item.price)}</span>
      </div>`
      )
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillCafeInfo();
    wireWhatsappLinks();
    wireMobileMenu();
    loadSettings();
    loadMenu();
    lucide.createIcons();
  });
})();
