/**
 * Creates a single shared Supabase client (window.sb) from window.APP_CONFIG.
 * Loaded after config.js and the Supabase CDN script on every page.
 */
(function initSupabaseClient() {
  const cfg = window.APP_CONFIG || {};
  const isPlaceholder = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("PLACEHOLDER");

  window.SUPABASE_CONFIGURED = !isPlaceholder;

  if (isPlaceholder) {
    console.warn(
      "[PlayBox] Supabase is not configured yet. Edit assets/js/config.js with your " +
      "SUPABASE_URL and SUPABASE_ANON_KEY. See README.md for setup steps."
    );
    window.sb = null;
    return;
  }

  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
})();
