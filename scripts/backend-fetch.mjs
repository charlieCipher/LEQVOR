// Every upstream operation shares one deadline. Never forward backend credentials
// through redirects, including a redirect returned by the trusted backend.
export function backendTransport(project, timeoutMs = 15000, fetcher) {
  const signal = AbortSignal.timeout(timeoutMs);
  return {signal, fetch: (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== project || url.username || url.password) throw new Error('Unexpected backend origin.');
    return (fetcher || fetch)(input, {...init, redirect: 'error', signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal});
  }};
}
