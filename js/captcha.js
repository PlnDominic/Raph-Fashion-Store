// Spam protection with Cloudflare Turnstile. Switched on by RAPH_CONFIG.turnstileSiteKey; with no key it does
// nothing. The check runs invisibly in the background (a small box only appears if Cloudflare is unsure), and
// the script is loaded only when someone starts an order, not on every page view.
(function () {
  const config = window.RAPH_CONFIG || {};
  const widgets = new Map();            // container element -> { id, token }
  let loading = null;

  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = () => resolve(window.turnstile || null);
      s.onerror = () => resolve(null);  // blocked (ad blocker, offline): the order is sent without a token and the server decides
      document.head.appendChild(s);
    });
    return loading;
  }

  // start the check inside `el` (safe to call again for the same element)
  async function mount(el) {
    if (!config.turnstileSiteKey || !el || widgets.has(el)) return;
    const entry = { id: null, token: '', error: null, retries: 0 };
    widgets.set(el, entry);
    const ts = await load();
    if (!ts || !el.isConnected) { widgets.delete(el); return; }
    entry.id = ts.render(el, {
      sitekey: config.turnstileSiteKey,
      appearance: 'interaction-only',
      size: 'flexible',
      callback: (t) => { entry.token = t; },
      'expired-callback': () => { entry.token = ''; try { ts.reset(entry.id); } catch (e) { /* ignore */ } },
      // a failed check is retried a couple of times; the code is kept so the problem can be diagnosed
      'error-callback': (code) => {
        entry.token = ''; entry.error = code;
        console.warn('Turnstile error', code);
        if (entry.retries++ < 2) setTimeout(() => { try { ts.reset(entry.id); } catch (e) { /* ignore */ } }, 1500);
        return true;
      },
    });
  }

  // the proof to send with the order; waits a few seconds if the check is still running
  async function token(el, waitMs = 8000) {
    if (!config.turnstileSiteKey) return '';
    const entry = widgets.get(el);
    if (!entry) return '';
    const start = Date.now();
    while (!entry.token && Date.now() - start < waitMs) await new Promise((r) => setTimeout(r, 150));
    return entry.token;
  }

  // a token works once: get a fresh one after any attempt that failed
  function reset(el) {
    const entry = widgets.get(el);
    if (entry && entry.id !== null && window.turnstile) { entry.token = ''; window.turnstile.reset(entry.id); }
  }

  window.RaphCaptcha = { mount, token, reset, enabled: !!config.turnstileSiteKey };
})();
