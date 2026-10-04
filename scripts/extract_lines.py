#!/usr/bin/env python3
"""SCRIPT.md -> <project>/audio/vo/lines.json (the voice lines in order).
A voice line is a paragraph that starts with **Голос:** «…» or **Voice:** "…" inside a section `## N. Title`.
Ids: s<N><a|b|c…> by order inside the section (s1a, s2a, s2b…). Optional per-line direction goes after the quote:
  **Голос:** «…» {pre=0.6 air=1.2 hold=1.5 mood=intrigue pace=slow stress="ни один"}
pre = visual lead-in before the voice (s), air = silence after it (s), hold = a mute beat after the line where only
picture and music play (added to air, music comes up in the gap). Defaults: pre 0.5, air 0.6; the last line gets air 3.5.
mood / pace / stress are voice direction: voice.py turns them into a per-line delivery instruction.
Usage: extract_lines.py SCRIPT.md <project>"""
import json, os, re, sys
src, proj = sys.argv[1], sys.argv[2]
out, sec, n = [], None, {}
for line in open(src, encoding='utf-8'):
    m = re.match(r'##\s+(\d+)[.)]', line)
    if m: sec = int(m.group(1)); continue
    m = re.match(r'\s*\*\*(?:Голос|Voice|VO):\*\*\s*[«"“](.*)[»"”]\s*(\{[^}]*\})?\s*$', line)
    if m and sec is not None:
        n[sec] = n.get(sec, 0) + 1
        item = {'id': f's{sec}{"abcdefghij"[n[sec] - 1]}', 'text': m.group(1).strip()}
        opts = m.group(2) or ''
        for k, v in re.findall(r'\b(pre|air|hold)\s*=\s*([\d.]+)', opts): item[k] = float(v)
        for k, v in re.findall(r'\b(mood|pace)\s*=\s*([^\s}"«»]+)', opts): item[k] = v
        st = re.search(r'\bstress\s*=\s*[«"“]([^»"”]+)[»"”]', opts)
        if st: item['stress'] = st.group(1)
        out.append(item)
if not out: sys.exit('no voice lines found: expected "**Голос:** «…»" paragraphs under "## N." sections')
out[-1].setdefault('air', 3.5)
os.makedirs(os.path.join(proj, 'audio', 'vo'), exist_ok=True)
p = os.path.join(proj, 'audio', 'vo', 'lines.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
chars = sum(len(o['text']) for o in out)
print(f'{len(out)} lines, {chars} chars, ≈{chars / 15:.0f} s of voice at 15 chars/s -> {p}')
for o in out: print(o['id'], len(o['text']), ' '.join(f'{k}={o[k]}' for k in ('mood', 'pace', 'hold') if k in o), o['text'][:70])
