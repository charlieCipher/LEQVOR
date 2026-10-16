import {deploymentEnvironment, serverBackend} from './deployment-environment.mjs';

export function apiRequestBoundary(request, env) {
  if (request.method !== 'POST') return {status:405, body:{error:'Method not allowed.'}};
  if (!serverBackend(env)) return {status:503, body:{error:'Service configuration unavailable.'}};
  const headers = request.headers || {};
  const origin = headers.origin;
  if ((origin !== undefined && (typeof origin !== 'string' || !deploymentEnvironment(env).origins.includes(origin))) ||
      headers['sec-fetch-site'] === 'cross-site') return {status:403, body:{error:'Request origin denied.'}};
  // Bearer authentication remains mandatory in each service. Cookies do not
  // authenticate these APIs; non-browser Bearer clients may omit Origin.
  if (typeof headers['content-type'] !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers['content-type']))
    return {status:415, body:{error:'JSON required.'}};
  const length = headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) > 32768))
    return {status:413, body:{error:'Request too large.'}};
  try {
    if (!request.body || Array.isArray(request.body) || typeof request.body !== 'object' ||
        Buffer.byteLength(JSON.stringify(request.body)) > 32768) return {status:400, body:{error:'Invalid request.'}};
  } catch { return {status:400, body:{error:'Invalid request.'}}; }
  return null;
}
