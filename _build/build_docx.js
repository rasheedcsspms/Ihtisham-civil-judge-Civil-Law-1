// Builds a styled .docx from a lightweight markup file.
// Usage: node build_docx.js <source.md> <out.docx> <figDir>
//
// Markup (line based):
//   %key: value            document settings (title, subtitle, kicker, footer, cover lines: %line: ...)
//   # / ## / ### / ####    headings (H1 starts a new page unless %h1break: no)
//   - item / "  - item"    bullets (two levels);  1. item  numbered list
//   > text                 statute / quotation block
//   :::type Optional title  ... :::   callout box (case, maxim, why, tip, trap, eg, ict, glance, recap, note, issues)
//   |a|b|c|                table (first row = header); optional line {w:20,40,40} before it
//   ![caption](file.png)   figure (file looked up in figDir)
//   ---                    page break
//   [[TOC]]                table of contents
//   Inline: **key term** (bold green)  __bold__  *italic*
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, PageBreak, TableOfContents, Footer, Header,
  PageNumber, LevelFormat, TabStopType, VerticalAlign, TableLayoutType, Bookmark, InternalHyperlink,
  LeaderType,
} = require('docx');

const [src, out, figDir, pagesFile] = process.argv.slice(2);
const PAGES = pagesFile && fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, 'utf8')) : null;
const HEADS = []; // {id, level, text}
const lines = fs.readFileSync(src, 'utf8').replace(/\r/g, '').split('\n');

const C = {
  head: '1F4E79', key: '2E7D32', body: '1F2937', grey: '64748B', navy: '1E2B45', rule: 'CBD5E1',
};
const FONT = 'Calibri';
const CONTENT_W = 9026; // A4 width 11906 - 2 x 1440 margins

const BOX = {
  case: { label: 'CASE STUDY', c: '1F5F9E', bg: 'EEF4FB' },
  maxim: { label: 'LEGAL MAXIM', c: '6B2D6B', bg: 'F6EFF6' },
  why: { label: 'RATIONALE — WHY THE LAW SAYS THIS', c: '0F766E', bg: 'ECF7F5' },
  tip: { label: 'EXAM TIP', c: 'C2570C', bg: 'FDF3EA' },
  trap: { label: 'COMMON MISTAKE', c: 'A3123A', bg: 'FBEFF2' },
  eg: { label: 'ILLUSTRATION', c: '475569', bg: 'F3F5F8' },
  ict: { label: 'ISLAMABAD-SPECIFIC LAW', c: '1E2B45', bg: 'EEF0F6' },
  glance: { label: 'AT A GLANCE', c: '8B1E2D', bg: 'F6EEEE' },
  recap: { label: 'QUICK RECAP', c: '2F7D32', bg: 'EFF7EF' },
  note: { label: 'NOTE', c: '475569', bg: 'F5F6F8' },
  issues: { label: 'ISSUES', c: '1E2B45', bg: 'F7F7F2' },
  order: { label: 'ORDER', c: '1E2B45', bg: 'FBFBF7' },
};

// ---------- inline ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\s][^*]*?\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, color: base.keyColor || C.key, ...strip(base) }));
    else if (t.startsWith('__')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...strip(base) }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...strip(base) }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out.map(r => r);
}
function strip(b) { const { keyColor, ...r } = b; return r; }

const para = (text, opts = {}, rbase = {}) => new Paragraph({ children: runs(text, rbase), spacing: { after: 120, line: 288 }, ...opts });

// ---------- numbering ----------
let numInstance = 0;
const numbering = {
  config: [
    { reference: 'bul', levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } } ] },
    { reference: 'num', levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 430, hanging: 300 } } } },
      { level: 1, format: LevelFormat.LOWER_ROMAN, text: '(%2)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 860, hanging: 360 } } } } ] },
  ],
};

// ---------- figures ----------
let figNo = 0;
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(caption, file) {
  const p = path.join(figDir, file);
  if (!fs.existsSync(p)) { console.warn('MISSING FIGURE', p); return [para(`[Figure missing: ${file}]`)]; }
  const { w, h } = pngSize(p);
  const maxW = 600, maxH = 820; // px at 96 dpi
  let dw = maxW, dh = Math.round(h * maxW / w);
  if (dh > maxH) { dh = maxH; dw = Math.round(w * maxH / h); }
  figNo++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(p), transformation: { width: dw, height: dh } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${figNo} · ${caption}`, italics: true, color: C.grey, size: 19 })] }),
  ];
}

// ---------- tables ----------
function table(rows, widths) {
  const n = rows[0].length;
  let w = widths && widths.length === n ? widths : Array(n).fill(100 / n);
  const tot = w.reduce((a, b) => a + b, 0);
  const cw = w.map(x => Math.floor(CONTENT_W * x / tot));
  cw[n - 1] += CONTENT_W - cw.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.rule };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cw, layout: TableLayoutType.FIXED,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0, cantSplit: true,
      children: r.map((cell, ci) => new TableCell({
        width: { size: cw[ci], type: WidthType.DXA }, borders,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: ri === 0 ? C.navy : (ri % 2 === 0 ? 'F5F6F8' : 'FFFFFF') },
        margins: { top: 70, bottom: 70, left: 110, right: 110 },
        children: cell.split(' // ').map(t => new Paragraph({ spacing: { after: 40, line: 264 },
          children: runs(t.trim(), ri === 0 ? { bold: true, color: 'FFFFFF', size: 20, keyColor: 'FFFFFF' } : { size: 20 }) })),
      })),
    })),
  });
}

// ---------- boxes ----------
function box(type, title, inner) {
  const s = BOX[type] || BOX.note;
  const label = new Paragraph({ spacing: { after: 80 }, keepNext: true, children: [
    new TextRun({ text: s.label, bold: true, color: s.c, size: 18, characterSpacing: 20 }),
    ...(title ? [new TextRun({ text: '  ·  ', color: s.c, size: 18 }), ...runs(title, { bold: true, color: s.c, size: 18, keyColor: s.c })] : []),
  ] });
  const kids = [label, ...blocks(inner, true)];
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return [new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ cantSplit: inner.length < 14, children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: s.bg },
      borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: s.c } },
      margins: { top: 110, bottom: 60, left: 200, right: 180 },
      children: kids,
    })] })],
  }), new Paragraph({ spacing: { after: 80 }, children: [] })];
}

// ---------- block parser ----------
function blocks(ls, inBox = false) {
  const outB = [];
  let i = 0, buf = [];
  const flush = () => { if (buf.length) { outB.push(para(buf.join(' '), inBox ? { spacing: { after: 90, line: 276 } } : {})); buf = []; } };
  let inNum = false;
  while (i < ls.length) {
    const L = ls[i];
    const t = L.trim();
    if (t === '') { flush(); i++; continue; }
    if (!/^\d+\.\s/.test(t)) inNum = false;
    if (t.startsWith('%')) { i++; continue; }
    if (t === '---') { flush(); outB.push(new Paragraph({ children: [new PageBreak()] })); i++; continue; }
    if (t === '[[TOC]]') {
      flush();
      outB.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Contents', bold: true, size: 36, color: C.head })] }));
      outB.push({ __toc: true });
      i++; continue;
    }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flush();
      const lvl = m[1].length;
      const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][lvl - 1];
      const pb = lvl === 1 && settings.h1break !== 'no' && outB.length > 0;
      const maxToc = Number(settings.tocDepth || 2);
      if (lvl <= maxToc && !inBox) {
        const id = '_h' + HEADS.length;
        HEADS.push({ id, level: lvl, text: m[2].replace(/\*\*|__|\*/g, '') });
        outB.push(new Paragraph({ heading: H, pageBreakBefore: pb, keepNext: true, children: [new Bookmark({ id, children: runs(m[2], { keyColor: C.head }) })] }));
      } else outB.push(new Paragraph({ heading: H, pageBreakBefore: pb, keepNext: true, children: runs(m[2], { keyColor: C.head }) }));
      i++; continue;
    }
    if ((m = t.match(/^:::(\w+)\s*(.*)$/))) {
      flush();
      const type = m[1], title = m[2];
      const inner = []; i++;
      while (i < ls.length && ls[i].trim() !== ':::') { inner.push(ls[i]); i++; }
      i++;
      outB.push(...box(type, title, inner));
      continue;
    }
    if (t.startsWith('|') || /^\{w:/.test(t)) {
      flush();
      let widths = null;
      if ((m = t.match(/^\{w:([\d,\s.]+)\}$/))) { widths = m[1].split(',').map(Number); i++; }
      const rows = [];
      while (i < ls.length && ls[i].trim().startsWith('|')) {
        rows.push(ls[i].trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim())); i++;
      }
      outB.push(table(rows, widths), new Paragraph({ spacing: { after: 100 }, children: [] }));
      continue;
    }
    if ((m = t.match(/^!\[(.*)\]\((.*)\)$/))) { flush(); outB.push(...figure(m[1], m[2])); i++; continue; }
    if (t.startsWith('> ')) {
      flush();
      const q = [];
      while (i < ls.length && ls[i].trim().startsWith('>')) { q.push(ls[i].trim().replace(/^>\s?/, '')); i++; }
      q.join('\n').split(/\n\s*\n/).forEach(pq => outB.push(new Paragraph({
        children: runs(pq.replace(/\n/g, ' '), { color: '1E3A5F' }), indent: { left: 360, right: 240 },
        spacing: { after: 100, line: 276 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: '7A9CC6', space: 10 } },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F6FA' },
      })));
      continue;
    }
    if ((m = L.match(/^(\s*)-\s+(.*)$/))) {
      flush();
      const lvl = m[1].length >= 2 ? 1 : 0;
      outB.push(new Paragraph({ numbering: { reference: 'bul', level: lvl }, spacing: { after: 60, line: 276 }, children: runs(m[2]) }));
      i++; continue;
    }
    if ((m = L.match(/^(\s*)\d+\.\s+(.*)$/))) {
      flush();
      if (!inNum) { numInstance++; inNum = true; }
      const lvl = m[1].length >= 2 ? 1 : 0;
      outB.push(new Paragraph({ numbering: { reference: 'num', level: lvl, instance: numInstance }, spacing: { after: 60, line: 276 }, children: runs(m[2]) }));
      i++; continue;
    }
    buf.push(t); i++;
  }
  flush();
  return outB;
}

// ---------- settings & cover ----------
const settings = { lines: [] };
for (const L of lines) {
  const m = L.match(/^%(\w+):\s*(.*)$/);
  if (m) { if (m[1] === 'line') settings.lines.push(m[2]); else settings[m[1]] = m[2]; }
}

function cover() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const band = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ height: { value: 4600, rule: 'atLeast' }, children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.navy },
      borders: { top: none, bottom: none, left: none, right: none },
      margins: { top: 400, bottom: 400, left: 500, right: 500 },
      children: [
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: settings.kicker || '', color: 'CBD5E1', size: 22, characterSpacing: 30, bold: true })] }),
        new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: settings.title || '', color: 'FFFFFF', size: 52, bold: true })] }),
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: settings.subtitle || '', color: 'E2E8F0', size: 28 })] }),
        ...(settings.subtitle2 ? [new Paragraph({ children: [new TextRun({ text: settings.subtitle2, color: 'A7F3D0', size: 24, italics: true })] })] : []),
      ],
    })] })],
  });
  const info = settings.lines.map(l => {
    const [k, ...v] = l.split('::');
    return new Paragraph({ spacing: { after: 90 }, children: [
      new TextRun({ text: (k || '').trim() + (v.length ? ':  ' : ''), bold: true, color: C.head, size: 22 }),
      new TextRun({ text: v.join('::').trim(), size: 22 }),
    ] });
  });
  return [
    new Paragraph({ spacing: { before: 1200, after: 0 }, children: [] }), band,
    new Paragraph({ spacing: { before: 500, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.rule, space: 6 } }, children: [] }),
    ...info,
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

const body0 = blocks(lines);
function tocParas() {
  const ps = [];
  HEADS.forEach((h, k) => {
    const pg = PAGES ? String(PAGES[k] ?? '') : '00';
    const top = h.level === 1;
    ps.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
      indent: { left: top ? 0 : 360 }, spacing: { before: top ? 120 : 0, after: top ? 40 : 20 },
      children: [new InternalHyperlink({ anchor: h.id, children: [
        new TextRun({ text: h.text, bold: top, color: top ? C.head : C.body, size: top ? 22 : 20 }),
        new TextRun({ text: '\t' + pg, bold: top, color: top ? C.head : C.body, size: top ? 22 : 20 }),
      ] })],
    }));
  });
  ps.push(new Paragraph({ children: [new TextRun({ text: 'zzTOCENDzz', color: 'FFFFFF', size: 2 })] }));
  return ps;
}
const body = [];
for (const b of body0) { if (b && b.__toc) body.push(...tocParas()); else body.push(b); }
fs.writeFileSync(out + '.heads.json', JSON.stringify(HEADS));
const doc = new Document({
  creator: 'Civil Judge Exam Preparation', title: settings.title || 'Document',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: C.body } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, color: C.head, font: FONT }, paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 29, color: C.head, font: FONT }, paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 25, color: C.head, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, italics: true, color: C.head, font: FONT }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 3 } },
    ],
  },
  numbering,
  sections: [{
    properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1440, right: 1440, footer: 600, header: 600 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: settings.header || '', color: '94A3B8', size: 17 })] })] }) },
    footers: {
      default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.rule, space: 4 } },
        children: [new TextRun({ text: settings.footer || '', color: C.grey, size: 17 }),
          new TextRun({ children: ['\tPage ', PageNumber.CURRENT], color: C.grey, size: 17 })] })] }),
      first: new Footer({ children: [new Paragraph({ children: [] })] }),
    },
    children: [...cover(), ...body],
  }],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync(out, b); console.log('wrote', out, 'figures:', figNo); });
