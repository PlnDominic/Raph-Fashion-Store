// Starts the shop. First asks the order function for the current dresses and texts (managed from the admin page),
// then loads the rest of the scripts. If that takes more than a moment, or fails, the site simply uses the built-in
// list in js/products.js, so it always works.
(function () {
  const cfg = window.RAPH_CONFIG || {};
  const SCRIPTS = ['js/stock.js', 'js/captcha.js', 'js/shop.js', 'js/cart.js', 'js/pdp.js', 'js/fitting.js', 'js/rail.js', 'js/content.js'];

  function load(i) {
    if (i >= SCRIPTS.length) return;
    const s = document.createElement('script');
    s.src = SCRIPTS[i];
    s.onload = s.onerror = () => load(i + 1);
    document.body.appendChild(s);
  }

  // a dress from the database, in the shape the shop expects
  const shape = (r) => ({
    id: r.id, name: r.name, price: r.price, readyMade: !!r.readyMade, leadTime: r.leadTime || null,
    images: [r.image],
    gallery: [r.image].concat(Array.isArray(r.gallery) ? r.gallery : []),
    rail: r.rail || undefined,
    railScale: r.railScale && r.railScale !== 1 ? r.railScale : undefined,
  });

  async function catalogue() {
    if (!cfg.orderEndpoint) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1800);
    try {
      const res = await fetch(cfg.orderEndpoint + (cfg.orderEndpoint.includes('?') ? '&' : '?') + 'catalogue=1', { signal: ctl.signal });
      return res.ok ? await res.json() : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }

  catalogue().then((c) => {
    if (!c) return;
    const list = (c.products || []).filter((r) => r && r.id && r.name && r.image);
    if (list.length) window.PRODUCTS = list.map(shape);
    window.RAPH_CONTENT = c.content || null;
  }).catch(() => {}).then(() => load(0));
})();
