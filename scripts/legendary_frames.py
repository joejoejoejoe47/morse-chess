# Draw 9-slice frame images for Legendary panels (4x scale; slice = 48px = 12 ref px).
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
S=4; N=160; import os; OUT=os.path.join(os.path.dirname(__file__), '..', 'public', 'legendary', 'ui') + '/'
def cham(c, inset, n=N):
    i=inset; c=max(c-i*0.42,1)
    return [(i+c,i),(n-1-i-c,i),(n-1-i,i+c),(n-1-i,n-1-i-c),(n-1-i-c,n-1-i),(i+c,n-1-i),(i,n-1-i-c),(i,i+c)]
def rr(r, inset, n=N): return (inset,inset,n-1-inset,n-1-inset), max(r-inset,1)
def vgrad(stops, n=N):
    ys=np.linspace(0,1,n); cols=np.zeros((n,3))
    for k in range(3):
        cols[:,k]=np.interp(ys,[s[0] for s in stops],[s[1][k] for s in stops])
    return Image.fromarray(np.repeat(cols[:,None,:],n,axis=1).astype(np.uint8),'RGB')
GOLD=[(0,(255,232,160)),(0.18,(226,180,84)),(0.5,(140,98,34)),(0.82,(214,168,80)),(1,(250,222,140))]
def mask(shape_fn):
    m=Image.new('L',(N,N),0); d=ImageDraw.Draw(m); shape_fn(d); return m
def layer(img, fill_img, m): img.paste(fill_img, (0,0), m)
def frame(name, fill, c=28, line=GOLD, outer=7, gap=5, inner_line=(205,160,78,120), round_=False, glow=None):
    img=Image.new('RGBA',(N,N),(0,0,0,0))
    shp=(lambda ins: (lambda d: d.rounded_rectangle(rr(c,ins)[0], radius=rr(c,ins)[1], fill=255))) if round_ else (lambda ins: (lambda d: d.polygon(cham(c,ins), fill=255)))
    layer(img, vgrad(line).convert('RGBA'), mask(shp(0)))
    # dark seam under the gold line
    layer(img, Image.new('RGBA',(N,N),(20,12,6,255)), mask(shp(outer)))
    layer(img, vgrad(fill).convert('RGBA'), mask(shp(outer+1)))
    if inner_line:
        lm=mask(shp(outer+gap)); inner=mask(shp(outer+gap+2))
        ring=Image.fromarray(np.clip(np.asarray(lm,np.int16)-np.asarray(inner,np.int16),0,255).astype(np.uint8),'L')
        layer(img, Image.new('RGBA',(N,N),inner_line[:3]+(255,)), ring.point(lambda v: v*inner_line[3]//255))
    if glow:
        g=Image.new('RGBA',(N,N),(0,0,0,0)); d=ImageDraw.Draw(g)
        for y in (outer+gap+6, N-1-outer-gap-6):
            d.line([(40,y),(N-40,y)], fill=glow, width=3)
        g=g.filter(ImageFilter.GaussianBlur(3)); img.alpha_composite(g)
    img=img.resize((N//2,N//2), Image.LANCZOS)  # 2x final: slice 24px
    img.save(OUT+name+'.png'); print(name)
DARK=[(0,(26,21,30)),(0.5,(15,12,18)),(1,(10,8,12))]
frame('frame-gold', DARK)
frame('frame-purple', [(0,(66,30,112)),(0.5,(42,16,80)),(1,(28,10,56))], inner_line=(190,140,255,90))
frame('frame-row', [(0,(22,18,24)),(1,(12,10,14))], c=20, line=[(0,(176,138,70)),(0.5,(110,80,36)),(1,(170,130,64))], outer=4, gap=0, inner_line=None)
frame('frame-violet', [(0,(16,11,30)),(0.5,(10,7,20)),(1,(14,9,28))], glow=(170,90,255,230))
frame('frame-chip', [(0,(30,24,30)),(1,(12,10,14))], c=40, line=[(0,(120,96,60)),(1,(70,54,30))], outer=4, gap=0, inner_line=None, round_=True)
frame('frame-btn', [(0,(28,22,26)),(1,(14,11,15))], c=20, outer=6, gap=0, inner_line=None)
# gear-menu buttons: thick outer gold band, dark seam, bright inner gold line, chamfered ends
MGOLD=[(0,(255,236,170)),(0.2,(232,186,90)),(0.5,(150,104,36)),(0.8,(222,176,86)),(1,(255,228,150))]
frame('frame-menu-gold', [(0,(40,30,22)),(0.45,(20,15,12)),(1,(12,9,8))], c=30, line=MGOLD, outer=10, gap=6, inner_line=(236,192,98,255))
frame('frame-menu-purple', [(0,(78,36,128)),(0.5,(48,18,92)),(1,(30,10,62))], c=30, line=MGOLD, outer=10, gap=6, inner_line=(236,192,98,255))
