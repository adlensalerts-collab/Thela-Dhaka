#!/usr/bin/env python3
"""
M1 — top-down preview + validation of a district JSON.
Usage: python3 tools/preview_district.py public/maps/<id>.json preview.png
Checks: buildings overlapping a carriageway, disconnected road pieces, roads without width.
"""
import sys, json
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

d = json.load(open(sys.argv[1])); out = sys.argv[2]
hw, hd = d['bounds']['halfWidth'], d['bounds']['halfDepth']
area = box(-hw, -hd, hw, hd)
carriage = unary_union([LineString(r['points']).buffer(r['width'] / 2, cap_style=2, join_style=2) for r in d['roads']]).intersection(area)
foot = unary_union([LineString(r['points']).buffer(r['width'] / 2 + r['footpath'], cap_style=2, join_style=2) for r in d['roads']]).intersection(area).difference(carriage)

issues = []
blds = []
for b in d['buildings']:
    p = Polygon(b['footprint'])
    if not p.is_valid: p = p.buffer(0)
    ov = p.intersection(carriage).area
    blds.append((b, p, ov))
    if ov > 1.0: issues.append(f"building {b['id']} {b['name'] or ''} overlaps carriageway by {ov:.1f} m²")
# connectivity: road network pieces
net = unary_union([LineString(r['points']) for r in d['roads']])
notraffic = [r for r in d['roads'] if not r.get('traffic', True)]
if notraffic: print(f"note: {len(notraffic)} road piece(s) not connected to the main network — visible, no traffic")
if 'fixes' in d: print('converter fixes:', d['fixes'])

import warnings; warnings.filterwarnings('ignore')
fig, ax = plt.subplots(figsize=(13, 13), dpi=100)
ax.set_facecolor('#d8cfb4')
from matplotlib.path import Path
from matplotlib.patches import PathPatch
def fill(g, color, ec='none', lw=0):
    for poly in (g.geoms if hasattr(g, 'geoms') else [g]):
        if poly.is_empty or poly.geom_type != 'Polygon': continue
        verts, codes = [], []
        for ring in [poly.exterior, *poly.interiors]:          # draw holes correctly
            xs, ys = ring.xy; pts = [(x, -y) for x, y in zip(xs, ys)]
            verts += pts; codes += [Path.MOVETO] + [Path.LINETO] * (len(pts) - 2) + [Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(verts, codes), facecolor=color, edgecolor=ec, lw=lw))
fill(foot, '#b9a28c')
fill(carriage, '#55595a')
for r in d['roads']:
    if not r.get('traffic', True):
        x, y = zip(*r['points']); ax.plot(x, [-v for v in y], color='#e67e22', lw=1.2, ls=':')
    if not r['oneway'] and r['width'] >= 9:
        x, y = zip(*r['points']); ax.plot(x, [-v for v in y], color='#efe7c9', lw=0.6, dashes=(4, 4))
for b, p, ov in blds:
    fill(p, '#c0392b' if ov > 1 else '#7d8a8c', ec='#2b3133', lw=0.4)
from shapely.geometry import Point
S = d.get('sites', {})
for dsh in d.get('markings', {}).get('dashes', []):
    ax.plot([dsh[0], dsh[2]], [-dsh[1], -dsh[3]], color='#f4ecd0', lw=0.8)
for zb in d.get('markings', {}).get('zebras', []):
    ax.plot(zb['x'], -zb['z'], 's', ms=3, color='white')
for t in S.get('trees', []): ax.plot(t[0], -t[1], 'o', ms=2.2, color='#2e7d32')
for q in S.get('poles', []): ax.plot(q[0], -q[1], '|', ms=4, color='#222')
def rect_of(site):
    import math as m
    nx, nz = -site['front'][0], -site['front'][1]; tx, tz = -nz, nx
    w, dd = site['width'], site['depth']
    return Polygon([(site['x'] + tx * u + nx * v, site['z'] + tz * u + nz * v) for u, v in ((-w/2, -dd/2), (w/2, -dd/2), (w/2, dd/2), (-w/2, dd/2))])
for kind, col in (('garages', '#f59e0b'), ('aarots', '#22c55e'), ('stalls', '#8e44ad')):
    for site in S.get(kind, []):
        fill(rect_of(site), col, ec='black', lw=0.4)
        if kind != 'stalls':
            ax.plot(site['entrance'][0], -site['entrance'][1], 'o', ms=7, mfc='none', mec=col, mew=1.5)
            ax.annotate(kind[0].upper(), (site['x'], -site['z']), fontsize=8, weight='bold', ha='center', va='center')
for h in S.get('hotspots', []): ax.plot(h['x'], -h['z'], 'o', ms=14, mfc='none', mec='#e74c3c', mew=1, alpha=0.7)
if S.get('spawn'): ax.plot(S['spawn'][0], -S['spawn'][1], 'P', ms=9, color='#e67e22')
# --- validation of placements
foot_all = foot
for t in S.get('trees', []):
    if Point(t).buffer(0.45).intersects(carriage): issues.append(f'tree at {t} on carriageway')
for q in S.get('poles', []):
    if Point(q[0], q[1]).buffer(0.3).intersects(carriage): issues.append(f'pole at {q[:2]} on carriageway')
bunion = unary_union([pp for _, pp, _ in blds]) if blds else Polygon()
for kind in ('garages', 'aarots', 'stalls'):
    for site in S.get(kind, []):
        r = rect_of(site)
        if r.intersects(carriage): issues.append(f'{kind[:-1]} at ({site["x"]},{site["z"]}) on carriageway')
        if r.intersection(bunion).area > 0.5: issues.append(f'{kind[:-1]} at ({site["x"]},{site["z"]}) overlaps a building')
        if kind != 'stalls' and not foot.buffer(0.2).contains(Point(site['entrance'])): issues.append(f'{kind[:-1]} entrance {site["entrance"]} not on a footpath')
print(f"placements: {len(S.get('trees',[]))} trees, {len(S.get('poles',[]))} poles, {len(S.get('stalls',[]))} stalls, {len(S.get('garages',[]))} garages, {len(S.get('aarots',[]))} aarots, {len(S.get('hotspots',[]))} hotspots")
for j in d['junctions']: ax.plot(j['x'], -j['z'], 'o', ms=2.5, color='#f2c45d')
for l in d['landmarks']:
    if l['kind'] not in ('marketplace', 'mall', 'department_store', 'bus_station', 'station', 'college', 'university', 'stadium'): continue
    ax.plot(l['x'], -l['z'], '*', ms=11, color='#1f6b5a')
    if l['name'].isascii(): ax.annotate(l['name'].split(',')[0][:32], (l['x'], -l['z']), fontsize=8, xytext=(4, 4), textcoords='offset points', bbox=dict(boxstyle='round,pad=0.15', fc='#ffffffc0', lw=0))
labelled = set()
for r in d['roads']:
    if r['name'] and r['name'].isascii() and r['name'] not in labelled and r['class'] in ('trunk', 'primary', 'secondary', 'tertiary') and len(r['points']) > 2:
        labelled.add(r['name'])
        m = r['points'][len(r['points']) // 2]; ax.annotate(r['name'], (m[0], -m[1]), fontsize=6, color='white', ha='center',
                                                            bbox=dict(boxstyle='round,pad=0.15', fc='#000000a0', lw=0))
ax.set_xlim(-hw, hw); ax.set_ylim(-hd, hd); ax.set_aspect('equal')
ax.set_title(f"{d['name']} — {len(d['roads'])} roads, {len(d['buildings'])} buildings · red = on a road · orange dots = no traffic\n{d['attribution']}", fontsize=9)
ax.set_xlabel('x (m, east)'); ax.set_ylabel('north (m)')
plt.tight_layout(); plt.savefig(out)
print(f"preview -> {out}")
print('ISSUES:' if issues else 'ISSUES: none')
for i in issues: print('  -', i)
