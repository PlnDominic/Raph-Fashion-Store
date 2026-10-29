// Scroll-scrubbed hero: scroll position picks which frame of the dress is drawn.
(function () {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const stage = hero.querySelector('.hero__stage');
  const dress = hero.querySelector('.hero__dress');
  const beats = [...hero.querySelectorAll('.beat')];
  const hint = hero.querySelector('.hero__hint');
  const total = Number(hero.dataset.frames);
  const path = hero.dataset.path;
  const ext = hero.dataset.ext || 'jpg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dctx = dress.getContext('2d');
  const frames = new Array(total);
  let loaded = 0;
  let target = 0;   // where scroll says we should be (0..1)
  let shown = 0;    // eased value actually drawn
  let drawnIndex = -1;
  let w = 0, h = 0;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const pad = (n) => String(n).padStart(4, '0');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = stage.clientWidth;
    h = stage.clientHeight;
    dress.width = Math.round(w * dpr);
    dress.height = Math.round(h * dpr);
    drawnIndex = -1;
    draw(true);
  }

  function draw(force) {
    const idx = Math.round(clamp(shown) * (total - 1));
    if (!force && idx === drawnIndex) return;
    // fall back to the nearest frame that has arrived while others are still loading
    let img = frames[idx];
    if (!img || !img.complete) {
      for (let d = 1; d < total && !(img && img.complete); d++) {
        img = frames[idx - d] || frames[idx + d];
      }
    }
    if (!img || !img.complete || !img.naturalWidth) return;
    drawnIndex = idx;

    const cw = dress.width, ch = dress.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    // the frames have a pure white backdrop, so they sit straight on the white page.
    // phones: fit the width and sit toward the top, leaving room for the text below.
    // wide screens: full height, centred.
    const portrait = w / h < 0.75;
    let scale = portrait ? cw / iw : ch / ih;
    if (ih * scale > ch * 0.86 && portrait) scale = (ch * 0.86) / ih;
    const dw = iw * scale, dh = ih * scale;
    const dy = portrait ? ch * 0.07 : (ch - dh) / 2;
    dctx.clearRect(0, 0, cw, ch);
    dctx.drawImage(img, (cw - dw) / 2, dy, dw, dh);
  }

  function updateBeats(p) {
    for (const el of beats) {
      const from = parseFloat(el.dataset.from);
      const to = parseFloat(el.dataset.to);
      const fade = 0.05;
      const o = clamp((p - from) / fade) * clamp((to - p) / fade);
      el.style.setProperty('--o', o.toFixed(3));
      el.style.setProperty('--y', ((1 - o) * 24).toFixed(1) + 'px');
    }
    hero.style.setProperty('--p', p.toFixed(4));
    if (hint) hint.style.opacity = p > 0.03 ? 0 : 1;
  }

  function readScroll() {
    const rect = hero.getBoundingClientRect();
    const range = hero.offsetHeight - stage.clientHeight;
    target = clamp(-rect.top / range);
  }

  function tick() {
    readScroll();
    shown = reduceMotion ? target : shown + (target - shown) * 0.14;
    if (Math.abs(target - shown) < 0.0004) shown = target;
    draw(false);
    updateBeats(shown);
    requestAnimationFrame(tick);
  }

  function load() {
    // coarse to fine: every 16th frame first, then 8th, 4th, 2nd, and the rest, so
    // scrolling already works after a fraction of the download
    const order = [];
    const seen = new Set();
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < total; i += step) {
        if (!seen.has(i)) { seen.add(i); order.push(i); }
      }
      if (!seen.has(total - 1) && step === 16) { seen.add(total - 1); order.push(total - 1); }
    }
    for (const i of order) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loaded++;
        hero.style.setProperty('--l', (loaded / total).toFixed(3));
        if (i === 0) resize();
        else if (i === drawnIndex || drawnIndex < 0) draw(true);
        if (loaded === total) hero.classList.add('is-loaded');
      };
      img.src = path + pad(i + 1) + '.' + ext;
      frames[i] = img;
    }
  }

  addEventListener('resize', resize);
  addEventListener('orientationchange', resize);
  load();
  resize();
  requestAnimationFrame(tick);
})();
