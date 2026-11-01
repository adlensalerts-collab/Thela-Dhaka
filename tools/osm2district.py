#!/usr/bin/env python3
"""
M1 — OpenStreetMap export (.osm XML) -> Thela Dhaka district JSON.

Usage:  python3 tools/osm2district.py <export.osm> <district_id> "<Display Name>" > public/maps/<district_id>.json

Coordinates: 1 game unit = 1 metre. Origin = centre of the export's <bounds>.
x = east, z = south (north is -Z, matching the game's "forward" and the minimap's "up").
Data © OpenStreetMap contributors, ODbL. The game must show that credit.
"""
import sys, json, math, xml.etree.ElementTree as ET

# Carriageway width in metres by OSM highway class (used when the way has no width/lanes tag).
ROAD_CLASSES = {
    'trunk': 16, 'primary': 14, 'secondary': 12, 'tertiary': 10,
    'unclassified': 8, 'residential': 7, 'living_street': 6, 'service': 5,
    'trunk_link': 8, 'primary_link': 8, 'secondary_link': 7, 'tertiary_link': 7,
}
FOOT_CLASSES = {'footway', 'pedestrian', 'path', 'steps'}
LANE_WIDTH = 3.3
FOOTPATH_WIDTH = {'trunk': 3.0, 'primary': 3.0, 'secondary': 2.6, 'tertiary': 2.4}  # default 1.8
LANDMARK_KEYS = [('amenity', 'marketplace'), ('shop', 'mall'), ('shop', 'department_store'),
                 ('amenity', 'bus_station'), ('amenity', 'place_of_worship'), ('leisure', 'stadium'),
                 ('amenity', 'university'), ('amenity', 'school'), ('amenity', 'college'),
                 ('railway', 'station'), ('public_transport', 'station'), ('amenity', 'hospital')]

def num(v, default=None):
    if v is None: return default
    try: return float(str(v).split(';')[0].replace('m', '').strip())
    except ValueError: return default

def main(path, did, name):
    root = ET.parse(path).getroot()
    b = root.find('bounds')
    if b is None: sys.exit('No <bounds> in the export; use openstreetmap.org Export.')
    minlat, minlon, maxlat, maxlon = (float(b.get(k)) for k in ('minlat', 'minlon', 'maxlat', 'maxlon'))
    lat0, lon0 = (minlat + maxlat) / 2, (minlon + maxlon) / 2
    mlat = 111_320.0
    mlon = 111_320.0 * math.cos(math.radians(lat0))
    def xz(lat, lon): return (round((lon - lon0) * mlon, 2), round(-(lat - lat0) * mlat, 2))
    half_w = (maxlon - minlon) * mlon / 2
    half_h = (maxlat - minlat) * mlat / 2

    nodes, node_tags = {}, {}
    for n in root.iter('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
        t = {tg.get('k'): tg.get('v') for tg in n.findall('tag')}
        if t: node_tags[n.get('id')] = t

    def inside(p, margin=0.0):
        return abs(p[0]) <= half_w + margin and abs(p[1]) <= half_h + margin

    roads, footpaths, buildings, landmarks = [], [], [], []
    node_use = {}
    for w in root.iter('way'):
        t = {tg.get('k'): tg.get('v') for tg in w.findall('tag')}
        refs = [nd.get('ref') for nd in w.findall('nd') if nd.get('ref') in nodes]
        if len(refs) < 2: continue
        pts = [xz(*nodes[r]) for r in refs]
        hw = t.get('highway')
        if hw in ROAD_CLASSES:
            if not any(inside(p, 40) for p in pts): continue
            lanes = num(t.get('lanes'))
            width = num(t.get('width')) or (lanes * LANE_WIDTH if lanes else ROAD_CLASSES[hw])
            width = max(4.0, min(width, 28.0))
            oneway = t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout'
            roads.append({'id': w.get('id'), 'name': t.get('name:en') or t.get('name') or '',
                          'nameBn': t.get('name:bn') or '', 'class': hw, 'width': round(width, 1),
                          'footpath': FOOTPATH_WIDTH.get(hw.replace('_link', ''), 1.8),
                          'oneway': oneway, 'nodes': refs, 'points': pts})
            for r in refs: node_use[r] = node_use.get(r, 0) + 1
        elif hw in FOOT_CLASSES:
            if any(inside(p, 20) for p in pts):
                footpaths.append({'id': w.get('id'), 'points': pts})
        elif 'building' in t and refs[0] == refs[-1] and len(refs) >= 4:
            ring = pts[:-1]
            if not all(inside(p, 30) for p in ring): continue
            area = 0.5 * sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
            if abs(area) < 12: continue                      # skip sheds / slivers
            if area > 0: ring = ring[::-1]                    # consistent winding (clockwise in x/z)
            levels = num(t.get('building:levels'))
            height = num(t.get('height')) or (levels * 3.2 if levels else None)
            buildings.append({'id': w.get('id'), 'name': t.get('name:en') or t.get('name') or '',
                              'kind': t.get('building'), 'levels': levels, 'height': height,
                              'footprint': ring, 'area': round(abs(area), 1)})
        for k, v in LANDMARK_KEYS:
            if t.get(k) == v and t.get('name'):
                cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
                if inside((cx, cz)):
                    landmarks.append({'name': t.get('name:en') or t['name'], 'nameBn': t.get('name:bn') or '',
                                      'kind': v, 'x': round(cx, 1), 'z': round(cz, 1)})
                break
    for nid, t in node_tags.items():
        for k, v in LANDMARK_KEYS:
            if t.get(k) == v and t.get('name'):
                x, z = xz(*nodes[nid])
                if inside((x, z)):
                    landmarks.append({'name': t.get('name:en') or t['name'], 'nameBn': t.get('name:bn') or '',
                                      'kind': v, 'x': x, 'z': z})
                break

    # ---- Auto-fixes (need shapely) -------------------------------------------------
    # 1) Keep buildings off carriageways AND footpaths: trim each footprint back to the road
    #    clearance; drop it if less than 60% would remain (it really sits in the road).
    from shapely.geometry import LineString, Polygon
    from shapely.ops import unary_union
    clearance = unary_union([LineString(r['points']).buffer(r['width'] / 2 + r['footpath'], cap_style=2, join_style=2)
                             for r in roads]) if roads else None
    kept, trimmed, dropped = [], 0, 0
    for b in buildings:
        poly = Polygon(b['footprint'])
        if not poly.is_valid: poly = poly.buffer(0)
        if clearance is not None and poly.intersects(clearance):
            rest = poly.difference(clearance)
            if rest.geom_type == 'MultiPolygon': rest = max(rest.geoms, key=lambda g: g.area)
            if rest.is_empty or rest.area < 0.6 * poly.area: dropped += 1; continue
            rest = rest.simplify(0.3)
            ring = [(round(x, 2), round(z, 2)) for x, z in list(rest.exterior.coords)[:-1]]
            a = 0.5 * sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
            if a > 0: ring = ring[::-1]
            b['footprint'] = ring; b['area'] = round(abs(a), 1); trimmed += 1
        kept.append(b)
    buildings = kept
    # 2) Road connectivity: union-find over shared OSM nodes; only the largest connected
    #    network carries traffic (other pieces stay visible).
    parent = {}
    def find(a):
        parent.setdefault(a, a)
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for i, r in enumerate(roads):
        find(('r', i))
        for nid in r['nodes']: parent[find(('n', nid))] = find(('r', i))
    comp = {}
    for i in range(len(roads)): comp.setdefault(find(('r', i)), []).append(i)
    biggest = max(comp.values(), key=lambda c: sum(len(roads[i]['points']) for i in c)) if comp else []
    for i, r in enumerate(roads): r['traffic'] = i in biggest
    fixes = {'buildingsTrimmed': trimmed, 'buildingsDropped': dropped,
             'roadsWithoutTraffic': sum(1 for r in roads if not r['traffic'])}

    # ---- 3) Ready-to-draw surfaces (merged, so junctions are clean) -------------------
    from shapely.geometry import Point, box as sbox, mapping
    area_box = sbox(-half_w, -half_h, half_w, half_h)
    carriage = unary_union([LineString(r['points']).buffer(r['width'] / 2, cap_style=2, join_style=2) for r in roads]).intersection(area_box)
    footpath = clearance.intersection(area_box).difference(carriage) if clearance is not None else None
    def polys(g, tol=0.15):
        out = []
        for poly in (g.geoms if hasattr(g, 'geoms') else [g]):
            if poly.is_empty or poly.geom_type != 'Polygon' or poly.area < 2: continue
            poly = poly.simplify(tol)
            rd = lambda ring: [[round(x, 2), round(z, 2)] for x, z in list(ring.coords)[:-1]]
            out.append({'outer': rd(poly.exterior), 'holes': [rd(h) for h in poly.interiors if Polygon(h).area > 1]})
        return out
    surfaces = {'carriageway': polys(carriage), 'footpath': polys(footpath) if footpath is not None else []}

    # Junction areas: where 2+ roads meet; markings and props stay out of them.
    junction_pts = {}
    for r in roads:
        for nid in r['nodes']:
            if node_use.get(nid, 0) >= 2: junction_pts[nid] = xz(*nodes[nid])
    jr = {}
    for r in roads:
        for nid in r['nodes']:
            if nid in junction_pts: jr[nid] = max(jr.get(nid, 0), r['width'] / 2 + 2)
    junction_zone = unary_union([Point(junction_pts[n]).buffer(jr[n] + 2) for n in junction_pts]) if junction_pts else None

    # ---- 4) Road markings: centre dashes on two-way roads >= 9 m, zebra crossings at major junctions
    dashes, zebras = [], []
    for r in roads:
        line = LineString(r['points'])
        if not r['oneway'] and r['width'] >= 9:
            L, dpos = line.length, 2.0
            while dpos + 3 < L:
                a, b2 = line.interpolate(dpos), line.interpolate(dpos + 3)
                seg = LineString([a, b2])
                if (junction_zone is None or not seg.intersects(junction_zone)) and area_box.contains(seg):
                    dashes.append([round(a.x, 2), round(a.y, 2), round(b2.x, 2), round(b2.y, 2)])
                dpos += 8
        if r['width'] >= 9:
            for end_i in (0, len(r['nodes']) - 1):
                nid = r['nodes'][end_i]
                if nid not in junction_pts: continue
                dist = jr[nid] + 1.5
                L = line.length
                if L < dist + 4: continue
                pt = line.interpolate(dist if end_i == 0 else L - dist)
                nxt = line.interpolate(dist + 1 if end_i == 0 else L - dist - 1)
                ang = math.atan2(nxt.x - pt.x, nxt.y - pt.y)
                if area_box.contains(pt):
                    zebras.append({'x': round(pt.x, 2), 'z': round(pt.y, 2), 'angle': round(ang, 4), 'width': r['width'], 'depth': 3.0})
    # Also zebras at junctions reached mid-way along a road (shared interior nodes)
    markings = {'dashes': dashes, 'zebras': zebras}

    # ---- 5) Placements (deterministic, so multiplayer worlds match) --------------------
    bpolys = unary_union([Polygon(b['footprint']) for b in buildings]) if buildings else Polygon()
    blocked = unary_union([carriage, bpolys] + ([junction_zone] if junction_zone is not None else []))
    trees, poles, stalls = [], [], []
    def along(line, step, start):
        d = start
        while d < line.length - 2: yield line.interpolate(d), line.interpolate(min(d + 0.5, line.length)); d += step
    used = []
    def free(pt, r): return all(pt.distance(u) >= r for u in used)
    for r in roads:
        line = LineString(r['points'])
        fp = r['footpath']
        for side in (-1, 1):
            for i, (p0, p1) in enumerate(along(line, 15, 7)):
                dx, dz = p1.x - p0.x, p1.y - p0.y; L = math.hypot(dx, dz) or 1
                nx, nz = -dz / L * side, dx / L * side          # perpendicular to the road
                kerb = r['width'] / 2
                if fp >= 2.2:   # tree on the outer half of a wide footpath
                    t = Point(p0.x + nx * (kerb + fp * 0.7), p0.y + nz * (kerb + fp * 0.7))
                    if area_box.contains(t) and footpath is not None and footpath.contains(t.buffer(0.4)) \
                            and not t.buffer(0.5).intersects(blocked) and free(t, 6):
                        trees.append([round(t.x, 2), round(t.y, 2)]); used.append(t)

        if r['class'] in ('primary', 'secondary', 'trunk', 'tertiary'):
            for side in (-1, 1):
                for p0, p1 in along(line, 30, 14.5):          # electric poles at the kerb, between trees
                    dx, dz = p1.x - p0.x, p1.y - p0.y; L = math.hypot(dx, dz) or 1
                    nx, nz = -dz / L * side, dx / L * side
                    q = Point(p0.x + nx * (r['width'] / 2 + 0.45), p0.y + nz * (r['width'] / 2 + 0.45))
                    if area_box.contains(q) and footpath is not None and footpath.contains(q.buffer(0.15)) \
                            and not q.buffer(0.3).intersects(blocked) and free(q, 2.5):
                        poles.append([round(q.x, 2), round(q.y, 2), round(math.atan2(-nx, -nz), 4)]); used.append(q)

    # Service lots (garages, aarots) and stalls: free rectangles just behind the footpath.
    def find_sites(count, w, d, min_gap, classes, tag):
        found = []
        for r in sorted(roads, key=lambda r: -r['width']):
            if not r.get('traffic') or r['class'] not in classes: continue
            line = LineString(r['points'])
            for side in (-1, 1):
                for p0, p1 in along(line, 9, 12):
                    dx, dz = p1.x - p0.x, p1.y - p0.y; L = math.hypot(dx, dz) or 1
                    tx, tz = dx / L, dz / L; nx, nz = -tz * side, tx * side
                    off = r['width'] / 2 + r['footpath'] + 0.3 + d / 2
                    cx, cz = p0.x + nx * off, p0.y + nz * off
                    rect = Polygon([(cx + tx * a + nx * b, cz + tz * a + nz * b) for a, b in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2))])
                    c = Point(cx, cz)
                    if not inner_box.contains(rect) or rect.intersects(blocked): continue
                    if any(c.distance(Point(f['x'], f['z'])) < min_gap for f in found + all_sites): continue
                    ex, ez = p0.x + nx * (r['width'] / 2 + r['footpath'] * 0.5), p0.y + nz * (r['width'] / 2 + r['footpath'] * 0.5)
                    found.append({'kind': tag, 'x': round(cx, 2), 'z': round(cz, 2), 'front': [round(-nx, 4), round(-nz, 4)],
                                  'width': w, 'depth': d, 'entrance': [round(ex, 2), round(ez, 2)], 'road': r['name']})
                    if len(found) >= count: return found
        return found
    all_sites = []
    inner_box = sbox(-half_w + 40, -half_h + 40, half_w - 40, half_h - 40)   # keep lots away from the map edge
    major = ('trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified')
    garages = find_sites(2, 14, 11, 220, major, 'garage'); all_sites += garages
    aarots = find_sites(3, 14, 11, 160, major, 'aarot'); all_sites += aarots
    stall_sites = find_sites(10, 3.9, 1.8, 45, major, 'stall'); all_sites += stall_sites
    for site in all_sites:      # clear props from service-ring entrances
        e = Point(*site['entrance'])
        trees[:] = [t for t in trees if e.distance(Point(t)) > 5]
        poles[:] = [q for q in poles if e.distance(Point(q[0], q[1])) > 5]
    # Hotspots: landmarks + the busiest junctions (most roads meeting)
    hot = [{'x': l['x'], 'z': l['z'], 'name': l['name'], 'kind': l['kind']} for l in landmarks]
    busy = sorted(junction_pts.items(), key=lambda kv: -node_use.get(kv[0], 0))[:4]
    hot += [{'x': v[0], 'z': v[1], 'name': 'Junction', 'kind': 'junction'} for _, v in busy]
    # Spawn: footpath point nearest the centre
    spawn = None
    if footpath is not None and not footpath.is_empty:
        from shapely.ops import nearest_points
        sp = nearest_points(footpath.buffer(-0.6) if not footpath.buffer(-0.6).is_empty else footpath, Point(0, 0))[0]
        spawn = [round(sp.x, 2), round(sp.y, 2)]
    sites = {'trees': trees, 'poles': poles, 'stalls': stall_sites, 'garages': garages, 'aarots': aarots,
             'hotspots': hot, 'spawn': spawn}
    fixes['missingSites'] = [k for k, n in (('garages', 2), ('aarots', 3)) if len(sites[k]) < n]

    # Junctions: OSM nodes shared by 2+ road ways, or used twice by one way (loops).
    junctions = {}
    for r in roads:
        for nid in r['nodes']:
            if node_use.get(nid, 0) >= 2 and nid not in junctions:
                junctions[nid] = xz(*nodes[nid])
    out = {
        'id': did, 'name': name, 'version': 1,
        'attribution': 'Map data © OpenStreetMap contributors (ODbL)',
        'origin': {'lat': round(lat0, 7), 'lon': round(lon0, 7)},
        'bounds': {'halfWidth': round(half_w, 1), 'halfDepth': round(half_h, 1)},
        'roads': roads,
        'junctions': [{'id': k, 'x': v[0], 'z': v[1]} for k, v in junctions.items()],
        'footpaths': footpaths,
        'buildings': buildings,
        'landmarks': landmarks,
        'surfaces': surfaces,
        'markings': markings,
        'sites': sites,
        'fixes': fixes,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(',', ':'))
    print(f"[osm2district] {name}: {len(roads)} roads, {len(junctions)} junctions, {len(buildings)} buildings, "
          f"{len(trees)} trees, {len(poles)} poles, {len(stall_sites)} stalls, {len(garages)} garages, {len(aarots)} aarots, {len(landmarks)} landmarks, area {2*half_w:.0f} x {2*half_h:.0f} m; fixes {fixes}", file=sys.stderr)

if __name__ == '__main__':
    if len(sys.argv) < 4: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
