"""Two-pass build: docx -> PDF (LibreOffice) -> locate heading pages -> rebuild docx with real TOC page numbers.

Usage: python3 make.py <source.md> <out.docx> <figDir> [--pdf <out.pdf>]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def build(src, out, fig, pages=None):
    args = ['node', os.path.join(HERE, 'build_docx.js'), src, out, fig]
    if pages:
        args.append(pages)
    subprocess.run(args, check=True)


def fix_bookmarks(docx):
    """docx-js gives every bookmark w:id="1"; renumber start/end pairs uniquely (bookmarks are not nested)."""
    import zipfile
    tmp = docx + '.tmp'
    with zipfile.ZipFile(docx) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml':
                xml = data.decode('utf-8')
                counter = [100]
                def rep(m):
                    if m.group(1) == 'Start':
                        counter[0] += 1
                    return '<w:bookmark%s%sw:id="%d"' % (m.group(1), m.group(2), counter[0])
                xml = re.sub(r'<w:bookmark(Start|End)\b([^>]*?)w:id="\d+"', rep, xml)
                data = xml.encode('utf-8')
            zout.writestr(item, data)
    os.replace(tmp, docx)


def to_pdf(docx, outdir):
    prof = tempfile.mkdtemp(prefix='lo_')
    env = dict(os.environ, SAL_USE_VCLPLUGIN='svp')
    subprocess.run(['soffice', f'-env:UserInstallation=file://{prof}', '--headless', '--convert-to', 'pdf',
                    '--outdir', outdir, docx], check=True, env=env, stdout=subprocess.DEVNULL)
    shutil.rmtree(prof, ignore_errors=True)
    return os.path.join(outdir, os.path.splitext(os.path.basename(docx))[0] + '.pdf')


def norm(s):
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = s.replace('—', '-').replace('–', '-').replace('ﬁ', 'fi').replace('ﬂ', 'fl')
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def find_pages(pdf, heads):
    txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    pages = [norm(p) for p in txt.split('\f')]
    start = next((i for i, p in enumerate(pages) if 'zztocendzz' in p), 0) + 1
    res, cur = [], start
    for h in heads:
        key = norm(h['text'])[:60]
        found = None
        for i in range(cur, len(pages)):
            if key and key in pages[i]:
                found = i
                break
        if found is None:
            print('WARN heading not found:', h['text'])
            res.append('')
            continue
        res.append(found + 1)
        cur = found
    return res


def main():
    src, out, fig = sys.argv[1:4]
    pdf_out = sys.argv[sys.argv.index('--pdf') + 1] if '--pdf' in sys.argv else None
    tmp = tempfile.mkdtemp(prefix='mk_')
    t1 = os.path.join(tmp, 'pass1.docx')
    build(src, t1, fig)
    heads = json.load(open(t1 + '.heads.json'))
    pages = find_pages(to_pdf(t1, tmp), heads)
    pj = os.path.join(tmp, 'pages.json')
    json.dump(pages, open(pj, 'w'))
    build(src, out, fig, pj)
    os.remove(out + '.heads.json')
    fix_bookmarks(out)
    final_pdf = to_pdf(out, tmp)
    check = find_pages(final_pdf, heads)
    if check != pages:
        print('NOTE: page numbers shifted between passes; running third pass')
        json.dump(check, open(pj, 'w'))
        build(src, out, fig, pj)
        os.remove(out + '.heads.json')
        fix_bookmarks(out)
        final_pdf = to_pdf(out, tmp)
    if pdf_out:
        shutil.copy(final_pdf, pdf_out)
    print('done', out, 'pages:', len(open(final_pdf, 'rb').read().split(b'/Type /Page\n')) - 1 or '?')
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
