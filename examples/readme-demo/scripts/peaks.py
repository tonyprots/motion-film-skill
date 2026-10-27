"""Voice loudness envelope for the timeline scene: film/peaks.js (window.PEAKS = {t0, dt, v}). Run after vo.py."""
import json, numpy as np, soundfile as sf
x, sr = sf.read('audio/vo.wav', always_2d=True); x = x.mean(1)
t0, t1, dt = 7.6, 12.3, 0.04
v = [float(np.sqrt(np.mean(x[int(a*sr):int((a+dt)*sr)]**2))) for a in np.arange(t0, t1, dt)]
m = max(v) or 1
open('film/peaks.js', 'w').write('window.PEAKS = ' + json.dumps({'t0': t0, 'dt': dt, 'v': [round(a / m, 3) for a in v]}) + ';\n')
print(len(v), 'peaks')
