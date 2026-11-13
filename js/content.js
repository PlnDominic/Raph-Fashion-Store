// Applies the texts managed from the admin page (the scrolling band, the footer contacts and "Good to know").
// Without them the page keeps the text written in index.html.
(function () {
  const C = window.RAPH_CONTENT;
  if (!C) return;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props, kids) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); });
    (kids || []).forEach((k) => n.append(k));
    return n;
  };

  // **bold**, [label](address) and "- " bullet lines. Only safe addresses are turned into links.
  const SAFE = /^(#book-fit|#shop|#info|#contact|privacy\.html|https:\/\/[^\s"<>]+|mailto:[^\s"<>]+|tel:[+\d]+)$/;
  function inline(text) {
    const out = [];
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) out.push(el('b', { text: m[1] }));
      else if (SAFE.test(m[3])) {
        const a = el('a', { text: m[2], href: m[3] === '#book-fit' ? '#' : m[3] });
        if (m[3] === '#book-fit') a.setAttribute('data-book-fit', '');
        if (/^https:/.test(m[3])) { a.target = '_blank'; a.rel = 'noopener'; }
        out.push(a);
      } else out.push(document.createTextNode(m[2]));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }
  function body(text) {
    const wrap = el('div', { class: 'info__body' });
    String(text).split(/\n{2,}/).forEach((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^-\s+/.test(l))) wrap.append(el('ul', {}, lines.map((l) => el('li', {}, inline(l.replace(/^-\s+/, ''))))));
      else wrap.append(el('p', {}, inline(lines.join(' '))));
    });
    return wrap;
  }

  // ---- the scrolling band ----
  if (Array.isArray(C.marquee) && C.marquee.length) {
    const row = document.querySelector('.marquee__row');
    if (row) {
      row.textContent = '';
      for (let r = 0; r < 4; r++) C.marquee.forEach((t) => { row.append(el('span', { text: t }), el('b', { text: '✦' })); });
    }
  }

  // ---- contacts in the footer ----
  const k = C.contacts;
  if (k) {
    if (k.address && $('footAddress')) $('footAddress').textContent = k.address;
    if (k.email && $('footEmail')) { $('footEmail').textContent = k.email; $('footEmail').href = 'mailto:' + k.email; }
    if (Array.isArray(k.phones) && k.phones.length && $('footCalls')) {
      $('footCalls').textContent = '';
      k.phones.forEach((p) => {
        const d = p.replace(/\D/g, '');
        const intl = d.startsWith('233') ? d : d.startsWith('0') ? '233' + d.slice(1) : d;
        $('footCalls').append(el('p', {}, [el('a', { href: 'tel:+' + intl, text: p })]));
      });
    }
    if (k.whatsapp && $('footWa')) { $('footWa').href = 'https://wa.me/' + k.whatsapp; $('footWa').setAttribute('aria-label', 'WhatsApp'); }
  }

  // ---- "Good to know" ----
  if (Array.isArray(C.info) && C.info.length) {
    const list = document.querySelector('.info__list');
    if (list) {
      list.textContent = '';
      C.info.forEach((it) => list.append(el('details', {}, [el('summary', { text: it.title }), body(it.body)])));
    }
  }
})();
