# Synthesizes the History replay sounds. Run from public/replay-sfx/ (writes <kind>-<n>.mp3 into the current directory).
import numpy as np, wave, subprocess, os
SR = 44100
rng = np.random.default_rng(538)
def t(d): return np.arange(int(SR*d))/SR
def env(n, a=0.01, d=0.1, s=0.7, r=0.2, total=None):
    total = total or n/SR
    tt = np.arange(n)/SR
    e = np.ones(n)*s
    e = np.where(tt < a, tt/a, e)
    m = (tt >= a) & (tt < a+d); e[m] = 1 - (1-s)*(tt[m]-a)/d
    rs = total - r; m = tt >= rs; e[m] = s*np.clip(1-(tt[m]-rs)/r, 0, 1)
    return e
def mix(n, *parts):
    out = np.zeros(n)
    for start, sig in parts:
        i = int(start*SR); j = min(n, i+len(sig)); out[i:j] += sig[:j-i]
    return out
def note(f, d, kind='brass', vib=0.0, bend=0.0, bright=1.0):
    x = t(d); ph = 2*np.pi*np.cumsum(f*(1+bend*x/d)*(1+vib*np.sin(2*np.pi*5.5*x)))/SR
    if kind == 'brass':
        sig = sum((1/k**(1.25/bright))*np.sin(k*ph) for k in range(1, 12))
        sig *= env(len(x), 0.04, 0.12, 0.75, min(0.15, d*0.4))
    elif kind == 'bell':
        sig = sum(a*np.sin(r*ph)*np.exp(-x*dec) for r, a, dec in [(1,1,2.2),(2.76,0.5,3.5),(5.4,0.25,6),(8.93,0.12,9)])
        sig *= np.minimum(1, x/0.003)
    elif kind == 'saw':
        sig = sum((1/k)*np.sin(k*ph) for k in range(1, 25)) * env(len(x), 0.02, 0.1, 0.8, min(0.2, d*0.3))
    elif kind == 'square':
        sig = sum((1/k)*np.sin(k*ph) for k in range(1, 20, 2)) * env(len(x), 0.005, 0.05, 0.8, 0.05)
    elif kind == 'sine':
        sig = np.sin(ph) * env(len(x), 0.01, 0.1, 0.8, min(0.2, d*0.3))
    return sig
def lowpass(sig, cut):
    a = np.exp(-2*np.pi*cut/SR); y = np.zeros_like(sig); acc = 0.0
    for i, v in enumerate(sig): acc = (1-a)*v + a*acc; y[i] = acc
    return y
def noise(d, dec=8, cut=None):
    x = t(d); n = rng.standard_normal(len(x))*np.exp(-x*dec)
    return lowpass(n, cut) if cut else n
def reverb(sig, wet=0.25):
    out = sig.copy()
    for dl, g in [(0.029,0.5),(0.037,0.45),(0.041,0.4),(0.053,0.35),(0.067,0.3),(0.089,0.25),(0.113,0.2),(0.149,0.15)]:
        k = int(dl*SR); out[k:] += sig[:-k]*g*wet*2
    return out
def save(name, sig):
    sig = reverb(sig, 0.22)
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.86
    pad = int(0.02*SR); sig = np.concatenate([sig, np.zeros(pad)])
    pcm = (sig*32767).astype(np.int16)
    with wave.open(name+'.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',name+'.wav','-codec:a','libmp3lame','-q:a','4',name+'.mp3'], check=True)
    os.remove(name+'.wav')
F = lambda m: 440*2**((m-69)/12)

# brilliant: brass fanfare + sparkle
for v, (root, pat) in enumerate([(60,[0,4,7,12]),(62,[0,7,12,16]),(57,[0,4,7,11,12])]):
    d = 1.9; n = int(SR*d); parts = []
    for i, iv in enumerate(pat):
        dur = 0.16 if i < len(pat)-1 else 0.95
        parts.append((i*0.13, note(F(root+iv), dur, 'brass', vib=0.006 if dur>0.5 else 0)*0.8))
        parts.append((i*0.13, note(F(root+iv-12), dur, 'brass', bright=0.7)*0.4))
    last = len(pat)*0.13 - 0.13
    for iv in [0,4,7]: parts.append((last, note(F(root+12+iv), 0.95, 'brass', vib=0.006)*0.35))
    for k in range(10): parts.append((last+0.05*k, note(F(root+36+rng.integers(0,12)), 0.6, 'bell')*0.12))
    save(f'brilliant-{v+1}', mix(n, *parts))
# great: bright bell chord
for v, root in enumerate([72, 74, 76]):
    n = int(SR*1.3)
    save(f'great-{v+1}', mix(n, (0, note(F(root), 1.2, 'bell')), (0.07, note(F(root+4), 1.15, 'bell')*0.8), (0.14, note(F(root+7), 1.1, 'bell')*0.8), (0.21, note(F(root+12), 1.05, 'bell')*0.6)))
# good: single/double ding
for v, (a, b) in enumerate([(76, 83), (79, 84), (74, 81), (77, 84)]):
    n = int(SR*0.9)
    save(f'good-{v+1}', mix(n, (0, note(F(a), 0.85, 'bell')), (0.09, note(F(b), 0.8, 'bell')*0.7)))
# inaccuracy: "hmm?" formant hum with rising wobble
def hum(f0, d, up=0.25, wob=0.03):
    x = t(d); f = f0*(1 + up*np.clip((x-d*0.45)/(d*0.5), 0, 1)**1.5 + wob*np.sin(2*np.pi*4.5*x))
    ph = 2*np.pi*np.cumsum(f)/SR
    src = sum((1/k)*np.sin(k*ph) for k in range(1, 30))
    out = np.zeros_like(src)
    for fc, g in [(300, 1.0), (900, 0.35), (2400, 0.12)]:
        # crude resonator: bandpass via two lowpasses difference
        out += g*(lowpass(src, fc*1.2) - lowpass(src, fc*0.8))
    return out*env(len(x), 0.06, 0.1, 0.9, 0.18)
for v, (f0, up, wob) in enumerate([(150, 0.3, 0.04), (175, 0.22, 0.06), (130, 0.35, 0.03)]):
    save(f'inaccuracy-{v+1}', hum(f0, 0.8, up, wob))
# mistake: two-tone descending buzz "uh-oh"
for v, (a, b) in enumerate([(64, 59), (62, 56), (65, 60)]):
    n = int(SR*0.85)
    s1 = lowpass(note(F(a-12), 0.28, 'square'), 1800); s2 = lowpass(note(F(b-12), 0.45, 'square', bend=-0.04), 1500)
    save(f'mistake-{v+1}', mix(n, (0, s1), (0.3, s2)))
# blunder: sad trombone + crash
for v in range(3):
    n = int(SR*2.6); root = [55, 53, 57][v]
    seq = [(0, 0.38, root), (0.42, 0.38, root-1), (0.84, 0.38, root-2), (1.26, 1.2, root-3)]
    parts = [(st, lowpass(note(F(m-12), d, 'saw', vib=0.012 if d > 1 else 0.004, bend=-0.03 if d > 1 else 0), 900)) for st, d, m in seq]
    if v != 1: parts.append((1.26, noise(1.0, dec=3.5, cut=5000)*0.35))
    if v == 1: parts.append((1.3, lowpass(note(F(30), 0.9, 'sine'), 300)*1.2))
    save(f'blunder-{v+1}', mix(n, *parts))
# capture: impact thump + whoosh
for v in range(3):
    n = int(SR*0.5)
    thump = lowpass(note(F(36+v*2), 0.35, 'sine', bend=-0.5), 400)*1.4
    save(f'capture-{v+1}', mix(n, (0, noise(0.25, dec=14, cut=2500+v*900)*0.8), (0.01, thump)))
# check: alert sting
for v, root in enumerate([69, 72]):
    n = int(SR*0.7)
    save(f'check-{v+1}', mix(n, (0, note(F(root), 0.12, 'brass')), (0.12, note(F(root+6), 0.45, 'brass', vib=0.01))))
# mate: timpani roll + big chord
for v, root in enumerate([60, 58]):
    n = int(SR*2.6); parts = []
    for k in range(10): parts.append((k*0.06, lowpass(note(F(36), 0.3, 'sine', bend=-0.2), 300)*(0.4+k*0.06)))
    for iv in [0, 4, 7, 12, 16]: parts.append((0.65, note(F(root+iv), 1.8, 'brass', vib=0.007)*0.5))
    parts.append((0.65, noise(1.6, dec=2.5, cut=7000)*0.3))
    save(f'mate-{v+1}', mix(n, *parts))
print(sorted(os.listdir('.')))
