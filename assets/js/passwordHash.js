/**
 * Small client-side password hashing helper shared by the dashboard's staff
 * login and Staff Management screens.
 *
 * Uses SHA-256 (Web Crypto, built into every modern browser) with a random
 * per-user salt. This matches the algorithm used to seed the first admin
 * account in supabase/schema.sql (`encode(digest(salt || password, 'sha256'), 'hex')`),
 * so login checks against either source work identically.
 *
 * SECURITY NOTE: this is a UI-level deterrent, not real database security —
 * see README.md. It stops casual access but a determined attacker with your
 * Supabase anon key could still read the hashes directly.
 */
window.ChillPillCrypto = (function () {
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function randomSalt(byteLength = 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt) {
    return sha256Hex(salt + password);
  }

  return { randomSalt, hashPassword };
})();
