// Scroll-scrubbed hero: scroll position picks which frame of the dress is drawn.
(function () {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const stage = hero.querySelector('.hero__stage');
  const dress = hero.querySelector('.hero__dress');
  const bg = hero.querySelector('.hero__bg');
  const beats = [...hero.querySelectorAll('.beat')];
  const hint = hero.querySelector('.hero__hint');
  const total = Number(hero.dataset.frames);
  const path = hero.dataset.path;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dctx = dress.getContext('2d');
  const bctx = bg.getContext('2d');
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
    // the blurred backdrop doesn't need resolution
    bg.width = Math.round(w / 6);
    bg.height = Math.round(h / 6);
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
    // phones (portrait): fill the screen. wide screens: full height, centred.
    const portrait = w / h < 0.75;
    const scale = portrait ? Math.max(cw / iw, ch / ih) : ch / ih;
    const dw = iw * scale, dh = ih * scale;
    dctx.clearRect(0, 0, cw, ch);
    const dx = (cw - dw) / 2;
    dctx.drawImage(img, dx, (ch - dh) / 2, dw, dh);
    if (!portrait) {
      // melt the left/right edges of the photo into the backdrop
      const g = dctx.createLinearGradient(dx, 0, dx + dw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.22, 'rgba(0,0,0,1)');
      g.addColorStop(0.78, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.globalCompositeOperation = 'destination-in';
      dctx.fillStyle = g;
      dctx.fillRect(0, 0, cw, ch);
      dctx.globalCompositeOperation = 'source-over';
    }

    const bs = Math.max(bg.width / iw, bg.height / ih);
    bctx.drawImage(img, (bg.width - iw * bs) / 2, (bg.height - ih * bs) / 2, iw * bs, ih * bs);
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
    // first frame first so the hero is never empty, then the rest in order
    const order = [0, ...Array.from({ length: total - 1 }, (_, i) => i + 1)];
    for (const i of order) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loaded++;
        hero.style.setProperty('--l', (loaded / total).toFixed(3));
        if (i === 0) resize();
        if (loaded === total) hero.classList.add('is-loaded');
      };
      img.src = path + pad(i + 1) + '.jpg';
      frames[i] = img;
    }
  }

  addEventListener('resize', resize);
  addEventListener('orientationchange', resize);
  load();
  resize();
  requestAnimationFrame(tick);
})();
