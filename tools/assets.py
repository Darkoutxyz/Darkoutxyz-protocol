# Palette + logo derivation. Run: python -I tools/assets.py  (build script calls it once; outputs committed in src/assets)
import json, statistics, numpy as np
from PIL import Image
im = Image.open('brand/LOGO DARKOUT PNG...png').convert('RGBA')
a = np.asarray(im).astype(np.float64)
op = a[...,3] > 250
rgb = a[...,:3]
yl = op & (rgb[...,0]>220)&(rgb[...,1]>190)&(rgb[...,2]<90)
sl = op & (rgb[...,2]>55)&(rgb[...,0]<80)&(rgb[...,2]-rgb[...,0]>10)&(rgb[...,1]<80)
def med(m): return tuple(int(np.median(rgb[...,i][m])) for i in range(3))
Y, S = med(yl), med(sl)
ref = np.asarray(Image.open('reference/SAMPUL DARKOUT JPG.jpg.jpeg').convert('RGB')).astype(int)
bgm = (ref.sum(axis=2) < 40); B = tuple(int(np.median(ref[...,i][bgm])) for i in range(3))
hx = lambda c: '#%02x%02x%02x' % c
print('yellow', hx(Y), 'slate', hx(S), 'bg(ref jpg median)', hx(B), 'yl px', int(yl.sum()), 'sl px', int(sl.sum()))
json.dump({'yellow': hx(Y), 'slate': hx(S), 'ground': hx(B)}, open('tools/palette.json','w'))

# premultiplied crop+resize (transparent pixels are pure black RGB -> would halo if resized straight)
ys, xs = np.where(a[...,3] > 0)
x0, x1, y0, y1 = xs.min(), xs.max()+1, ys.min(), ys.max()+1
print('alpha bbox', x0, y0, x1, y1)
def premul_resize(img, size):
    f = np.asarray(img).astype(np.float64) / 255.0
    f[...,:3] *= f[...,3:4]
    ch = [Image.fromarray(f[...,i].astype(np.float32), mode='F').resize(size, Image.LANCZOS) for i in range(4)]
    o = np.stack([np.asarray(c) for c in ch], -1)
    al = np.clip(o[...,3], 0, 1)
    c = np.where(al[...,None] > 1e-4, o[...,:3] / np.maximum(al[...,None], 1e-4), 0)
    out = np.dstack([np.clip(c,0,1), al]) * 255
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGBA')
side = max(x1-x0, y1-y0); pad = int(side*0.08); S2 = side + 2*pad
cx, cy = (x0+x1)//2, (y0+y1)//2
box = (cx-S2//2, cy-S2//2, cx-S2//2+S2, cy-S2//2+S2)
sq = im.crop(box)
for n in (512, 256, 128):
    premul_resize(sq, (n, n)).save(f'src/assets/logo-{n}.png', optimize=True)
# favicon: 32x32 grid traced from the real pixels
g = np.asarray(premul_resize(sq, (32, 32))).astype(int)
pal = {'y': Y, 's': S}
cells = [[None]*32 for _ in range(32)]
for r in range(32):
    for c in range(32):
        p = g[r,c]
        if p[3] < 110: continue
        cells[r][c] = min(pal, key=lambda k: sum((p[i]-pal[k][i])**2 for i in range(3)))
rects = []
for r in range(32):
    c = 0
    while c < 32:
        k = cells[r][c]
        if k is None: c += 1; continue
        e = c
        while e+1 < 32 and cells[r][e+1] == k: e += 1
        rects.append((k, c, r, e-c+1)); c = e+1
svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">']
for k in 'sy':
    d = ''.join(f'M{c} {r}h{w}v1h-{w}z' for kk,c,r,w in rects if kk==k)
    svg.append(f'<path fill="{hx(pal[k])}" d="{d}"/>')
svg.append('</svg>')
open('src/assets/favicon.svg','w').write('\n'.join(svg))
print('favicon rects', len(rects))
