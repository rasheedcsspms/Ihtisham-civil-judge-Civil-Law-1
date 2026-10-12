// Renders figure specs (JSON) to PNG using headless Chromium.
// Usage: node figures.js <figures.json> <outDir> [onlyId]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PALETTE = {
  purple: '#6B2D6B', teal: '#0F766E', orange: '#C2570C', red: '#A3123A',
  blue: '#1F5F9E', green: '#2F7D32', brown: '#8A5A00', navy: '#1E2B45',
  slate: '#475569', maroon: '#7F1D1D', olive: '#4D6B12', indigo: '#3730A3',
};
const col = (c, i) => PALETTE[c] || c || Object.values(PALETTE)[i % 10];
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#fff;color:#1f2937;width:820px;padding:10px}
#fig{background:#F5F6F8;border-radius:10px;padding:20px;position:relative}
.intro{font-style:italic;font-size:15.5px;line-height:1.5;color:#334155;text-align:center;margin:0 30px 22px}
.box{background:#fff;border:1.6px solid var(--c);border-radius:6px;padding:12px 14px;position:relative;z-index:2}
.box h4{color:var(--c);font-size:16.5px;font-weight:700;line-height:1.3;margin-bottom:6px}
.box ul{list-style:none}
.box li{font-size:14.5px;line-height:1.42;padding-left:15px;position:relative;margin:3px 0;color:#1f2937}
.box li:before{content:'';position:absolute;left:2px;top:7px;width:7px;height:7px;border-radius:50%;background:var(--c)}
.center{background:#1E2B45;color:#fff;border-radius:8px;padding:22px 18px;text-align:center;z-index:2;position:relative}
.center .k{font-size:12px;letter-spacing:1.5px;color:#cbd5e1;margin-bottom:8px}
.center .q{font-size:17.5px;font-weight:700;line-height:1.35}
.center .s{font-size:14px;margin-top:10px;line-height:1.4;color:#e2e8f0}
svg.links{position:absolute;left:0;top:0;z-index:1;pointer-events:none}
.title{font-size:20px;font-weight:700;color:#1E2B45;text-align:center;margin-bottom:16px}
`;

function answermap(f) {
  const side = (arr, off) => arr.map((b, i) => `
    <div class="box" data-link="${off ? 'L' : 'R'}" style="--c:${col(b.color, i + off)}">
      <h4>${esc(b.title)}</h4><ul>${(b.bullets || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
  return `
  ${f.intro ? `<div class="intro">${esc(f.intro)}</div>` : ''}
  <div style="display:grid;grid-template-columns:1fr 200px 1fr;gap:0 34px;align-items:center">
    <div style="display:flex;flex-direction:column;gap:16px">${side(f.left, 0)}</div>
    <div class="center" id="hub"><div class="k">${esc(f.kicker || 'THE QUESTION ASKS')}</div>
      <div class="q">${esc(f.question)}</div>${f.sub ? `<div class="s">${esc(f.sub)}</div>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:16px">${side(f.right, 5)}</div>
  </div>`;
}

function tree(f) {
  const kids = f.children.map((c, i) => `
    <div class="tk" style="--c:${col(c.color, i)}">
      <div class="th">${esc(c.title)}</div>
      ${c.text ? `<div class="tb">${esc(c.text)}</div>` : ''}
      ${c.bullets ? `<ul class="tbl">${c.bullets.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');
  return `<style>
    .troot{margin:0 auto 34px;max-width:${f.rootWidth || 520}px;background:#1E2B45;color:#fff;text-align:center;
      font-weight:700;font-size:19px;padding:14px;border-radius:7px;position:relative;z-index:2}
    .troot small{display:block;font-weight:400;font-size:13.5px;color:#cbd5e1;margin-top:4px}
    .tkids{display:grid;grid-template-columns:repeat(${f.cols || f.children.length},1fr);gap:18px;position:relative}
    .tk{background:#fff;border:1.5px solid var(--c);border-radius:6px;overflow:hidden;position:relative;z-index:2}
    .th{background:var(--c);color:#fff;font-weight:700;font-size:15px;padding:9px 12px;line-height:1.3}
    .tb{font-size:14.5px;line-height:1.45;padding:10px 12px;color:#1f2937}
    .tbl{list-style:none;padding:8px 12px 10px}
    .tbl li{font-size:14.5px;line-height:1.45;padding-left:14px;position:relative;margin:3px 0}
    .tbl li:before{content:'';position:absolute;left:1px;top:7px;width:6px;height:6px;border-radius:50%;background:var(--c)}
  </style>
  ${f.title ? `<div class="title">${esc(f.title)}</div>` : ''}
  <div class="troot" id="hub">${esc(f.root)}${f.rootSub ? `<small>${esc(f.rootSub)}</small>` : ''}</div>
  <div class="tkids">${kids}</div>`;
}

function flow(f) {
  const steps = f.steps.map((s, i) => `
    <div class="fs" style="--c:${col(s.color || f.color || 'navy', i)}">
      <div class="fn">${s.n ?? i + 1}</div>
      <div class="fc"><div class="ft">${esc(s.title)}</div>${s.text ? `<div class="fx">${esc(s.text)}</div>` : ''}</div>
      ${s.law ? `<div class="fl">${esc(s.law)}</div>` : ''}
    </div>${i < f.steps.length - 1 ? '<div class="fa">&#9660;</div>' : ''}`).join('');
  return `<style>
    .fs{display:grid;grid-template-columns:44px 1fr 170px;align-items:center;background:#fff;border:1.5px solid var(--c);border-radius:7px;overflow:hidden}
    .fn{background:var(--c);color:#fff;font-weight:800;font-size:18px;height:100%;display:flex;align-items:center;justify-content:center}
    .fc{padding:9px 14px}.ft{font-weight:700;font-size:15.5px;color:var(--c)}
    .fx{font-size:14.5px;line-height:1.45;margin-top:2px}
    .fl{font-size:13px;font-weight:600;color:#334155;padding:8px 12px;border-left:1px dashed #cbd5e1;height:100%;display:flex;align-items:center;background:#F8FAFC}
    .fa{text-align:center;color:#94a3b8;font-size:14px;line-height:18px}
  </style>
  ${f.title ? `<div class="title">${esc(f.title)}</div>` : ''}
  <div style="max-width:${f.width || 880}px;margin:0 auto">${steps}</div>`;
}

// Nested org chart: {root:{title,sub,color,children:[...]}}
function org(f) {
  const node = (n, i, depth) => `
    <li><div class="on" style="--c:${col(n.color || (depth === 0 ? 'navy' : null), i + depth)}">
      <div class="ot">${esc(n.title)}</div>${n.sub ? `<div class="os">${esc(n.sub)}</div>` : ''}</div>
      ${n.children && n.children.length ? `<ul>${n.children.map((c, j) => node(c, j + i, depth + 1)).join('')}</ul>` : ''}</li>`;
  return `<style>
    .org ul{display:flex;justify-content:center;padding-top:22px;position:relative}
    .org li{list-style:none;text-align:center;position:relative;padding:22px 7px 0}
    .org li:before,.org li:after{content:'';position:absolute;top:0;right:50%;border-top:2px solid #94a3b8;width:50%;height:22px}
    .org li:after{right:auto;left:50%;border-left:2px solid #94a3b8}
    .org li:only-child:after,.org li:only-child:before{display:none}.org li:only-child{padding-top:0}
    .org li:first-child:before,.org li:last-child:after{border:0 none}
    .org li:last-child:before{border-right:2px solid #94a3b8;border-radius:0 6px 0 0}
    .org li:first-child:after{border-radius:6px 0 0 0}
    .org ul ul:before{content:'';position:absolute;top:0;left:50%;border-left:2px solid #94a3b8;width:0;height:22px}
    .org>ul{padding-top:0}
    .on{display:inline-block;background:#fff;border:1.6px solid var(--c);border-radius:7px;min-width:120px;max-width:${f.nodeMax || 210}px;overflow:hidden}
    .ot{background:var(--c);color:#fff;font-weight:700;font-size:15.5px;padding:8px 10px;line-height:1.3}
    .os{font-size:13.5px;line-height:1.4;padding:7px 9px;color:#1f2937}
  </style>
  ${f.title ? `<div class="title">${esc(f.title)}</div>` : ''}
  <div class="org"><ul>${node(f.root, 0, 0)}</ul></div>`;
}

// Grid of cards: {cards:[{title,color,bullets|text}], cols}
function cards(f) {
  return `<style>
    .cg{display:grid;grid-template-columns:repeat(${f.cols || 3},1fr);gap:14px}
  </style>
  ${f.title ? `<div class="title">${esc(f.title)}</div>` : ''}
  ${f.intro ? `<div class="intro">${esc(f.intro)}</div>` : ''}
  <div class="cg">${f.cards.map((c, i) => `<div class="box" style="--c:${col(c.color, i)}"><h4>${esc(c.title)}</h4>
    ${c.text ? `<div style="font-size:14.5px;line-height:1.45">${esc(c.text)}</div>` : ''}
    ${c.bullets ? `<ul>${c.bullets.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`;
}

// Decision chart: {title, q:[{ask, yes, no}]} rendered as stacked question rows
function decide(f) {
  return `<style>
    .dq{display:grid;grid-template-columns:1fr 34px 1fr;gap:0;align-items:stretch;margin-bottom:10px}
    .dk{background:#1E2B45;color:#fff;border-radius:7px;padding:11px 14px;font-weight:700;font-size:14.5px;line-height:1.35;grid-column:1/4}
    .dy,.dn{background:#fff;border:1.5px solid var(--c);border-radius:6px;padding:9px 12px;font-size:14.5px;line-height:1.45;margin-top:6px}
    .dy b,.dn b{color:var(--c)}
  </style>
  ${f.title ? `<div class="title">${esc(f.title)}</div>` : ''}
  ${f.q.map((r, i) => `<div class="dq"><div class="dk">${i + 1}. ${esc(r.ask)}</div>
     <div class="dy" style="--c:#2F7D32"><b>YES →</b> ${esc(r.yes)}</div><div></div>
     <div class="dn" style="--c:#A3123A"><b>NO →</b> ${esc(r.no)}</div></div>`).join('')}`;
}

const RENDER = { answermap, tree, flow, org, cards, decide };

const LINK_JS = `
(() => {
  const fig = document.getElementById('fig'); const hub = document.getElementById('hub');
  if (!hub) return;
  const fr = fig.getBoundingClientRect(); const hr = hub.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','links'); svg.setAttribute('width',fr.width); svg.setAttribute('height',fr.height);
  const add = (d, c) => { const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', d); p.setAttribute('stroke', c); p.setAttribute('stroke-width','2'); p.setAttribute('fill','none');
    p.setAttribute('opacity','0.75'); svg.appendChild(p); };
  document.querySelectorAll('[data-link]').forEach(b => {
    const r = b.getBoundingClientRect(); const c = getComputedStyle(b).getPropertyValue('--c').trim();
    const y1 = hr.top + hr.height/2 - fr.top; const y2 = r.top + r.height/2 - fr.top;
    if (b.dataset.link === 'L') { const x1 = hr.left - fr.left, x2 = r.right - fr.left; const m = (x1+x2)/2;
      add('M'+x1+','+y1+' C'+m+','+y1+' '+m+','+y2+' '+x2+','+y2, c); }
    else { const x1 = hr.right - fr.left, x2 = r.left - fr.left; const m = (x1+x2)/2;
      add('M'+x1+','+y1+' C'+m+','+y1+' '+m+','+y2+' '+x2+','+y2, c); }
  });
  document.querySelectorAll('.tk').forEach(b => {
    const r = b.getBoundingClientRect(); const c = getComputedStyle(b).getPropertyValue('--c').trim();
    const x1 = hr.left + hr.width/2 - fr.left, y1 = hr.bottom - fr.top, x2 = r.left + r.width/2 - fr.left, y2 = r.top - fr.top;
    const m = (y1+y2)/2; add('M'+x1+','+y1+' C'+x1+','+m+' '+x2+','+m+' '+x2+','+y2, c);
  });
  fig.appendChild(svg);
})();`;

(async () => {
  const [specFile, outDir, only] = process.argv.slice(2);
  const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 820, height: 800 } });
  for (const f of specs) {
    if (only && f.id !== only) continue;
    const body = RENDER[f.type](f);
    await page.setContent(`<html><head><style>${BASE_CSS}</style></head><body><div id="fig">${body}</div></body></html>`);
    await page.evaluate(LINK_JS);
    const el = await page.$('#fig');
    await el.screenshot({ path: path.join(outDir, f.id + '.png') });
    console.log('rendered', f.id);
  }
  await browser.close();
})();
