// Stock levels. Asks the order function what is in stock (GET on the same address orders are sent to),
// so the shop can show each size as available or sold out. Until that answer arrives, or if it can't be
// fetched (no endpoint yet, offline, an older function), everything is treated as available.
(function () {
  const config = window.RAPH_CONFIG || {};
  const listeners = new Set();
  const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  let data = null;            // { productId: { 'UK 12': 2, ... } } once loaded; null = unknown
  let loadedAt = 0;
  let inflight = null;

  // UK 8 < UK 10 < UK 12 ...  and  S < M < L < XL
  const rank = (s) => {
    const n = parseInt(String(s).replace(/\D/g, ''), 10);
    if (!isNaN(n)) return n;
    const i = LETTERS.indexOf(String(s).toUpperCase());
    return i >= 0 ? i : 999;
  };
  const bySize = (a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b));

  const api = {
    get known() { return data !== null; },
    // sizes to offer for a dress: whatever the stock table lists, else the fallback list in the config
    sizes(id) { return data && data[id] ? Object.keys(data[id]).sort(bySize) : (config.sizes || []).slice(); },
    // how many are left in a size (Infinity while stock is unknown)
    qty(id, size) { return data ? ((data[id] && data[id][size]) || 0) : Infinity; },
    total(id) { return data ? Object.values(data[id] || {}).reduce((a, b) => a + b, 0) : Infinity; },
    soldOut(id) { return data !== null && api.total(id) <= 0; },
    onChange(fn) { listeners.add(fn); },
    // force = skip the 10-second reuse (used when opening the cart / checking out)
    async refresh(force) {
      if (!config.orderEndpoint) return data;
      if (!force && data && Date.now() - loadedAt < 10000) return data;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const url = config.orderEndpoint + (force ? '?t=' + Date.now() : '');
          const res = await fetch(url, { cache: force ? 'no-store' : 'default' });
          const json = res.ok ? await res.json() : null;
          if (json && json.stock && typeof json.stock === 'object') {
            const changed = JSON.stringify(json.stock) !== JSON.stringify(data);
            data = json.stock; loadedAt = Date.now();
            if (changed) listeners.forEach((fn) => { try { fn(); } catch (e) { /* a listener must not break the others */ } });
          }
        } catch (e) { /* keep whatever we had */ }
        inflight = null;
        return data;
      })();
      return inflight;
    },
  };

  window.RaphStock = api;
  api.refresh();
})();
