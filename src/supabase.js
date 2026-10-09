import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim();
let configured = false;
try {
  const endpoint = url ? new URL(url) : null;
  const localDevelopment = import.meta.env.DEV && endpoint?.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  let adminKey = Boolean(key?.startsWith('sb_secret_'));
  if (key?.split('.').length === 3) {
    try { adminKey ||= JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role === 'service_role'; } catch { /* Invalid keys fail authentication. */ }
  }
  configured = Boolean(
    url &&
    key && !adminKey &&
    (endpoint?.protocol === "https:" || localDevelopment) &&
    !url.includes("your-project-ref"),
  );
} catch {
  /* Show setup state instead of crashing. */
}
export const supabaseConfig = {
  configured,
  passkeysEnabled: import.meta.env.VITE_ENABLE_PASSKEYS === 'true',
  url: url || "",
  projectHost: configured ? new URL(url).host : "",
};
export const supabase = configured
  ? createClient(url, key, {
      auth: {experimental: {passkey: supabaseConfig.passkeysEnabled}},
      global: {
        fetch: (input, init = {}) =>
          fetch(input, {
            ...init,
            signal: init.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
              : AbortSignal.timeout(20000),
          }),
      },
    })
  : null;
