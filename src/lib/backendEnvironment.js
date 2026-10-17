const productionOrigin = 'https://leqvor.vercel.app';
const productionBackend = 'https://awdsyhxdnyfilnzamflt.supabase.co';
const loopback = url => url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);

export function browserBackendAllowed({url, origin, development, allowedOrigins = []}) {
  try {
    const endpoint = new URL(url), page = new URL(origin);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') return false;
    if (development && loopback(page)) {
      if (loopback(endpoint)) return true;
      return endpoint.protocol === 'https:' && !endpoint.port && /^[a-z]{20}\.supabase\.co$/.test(endpoint.hostname) && endpoint.origin !== productionBackend;
    }
    const approved = allowedOrigins.length ? allowedOrigins : [productionOrigin];
    if (page.protocol !== 'https:' || !approved.includes(page.origin)) return false;
    if (endpoint.origin === productionBackend) return page.origin === productionOrigin;
    return allowedOrigins.length > 0 && !approved.includes(productionOrigin) &&
      endpoint.protocol === 'https:' && !endpoint.port && /^[a-z]{20}\.supabase\.co$/.test(endpoint.hostname);
  } catch { return false; }
}

export function authRedirect(value, origin = globalThis.location?.origin) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Authentication redirect is unavailable.'); }
  // Current callers send only the app origin. Do not allow path/query redirect
  // gadgets, credentials, fragments or a different origin to receive auth links.
  if (url.origin !== origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Authentication redirect is unavailable.');
  return url.origin;
}
