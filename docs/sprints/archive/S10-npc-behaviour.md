# 10 — More NPCs + behaviour

Moved verbatim from ACTIVE.md.

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 10 | More NPCs + behaviour | ⏳ | Remove the 10–15 pedestrian cap; 60–120 people with distance-based detail; groups chatting, phones, browsing stalls, crossing at junctions, reacting to horns/accidents, haggling; density by time and hotspots |

Built by Claude (`3f3361f`); engine hooks in `b5c2ae8`, merged in `c40190c`. 60/80/100/120 people by quality; nearest 10–28 drawn as rigs, the rest as 3 instanced meshes; chat groups, phone calls/texting, stall browsing, kerb waiting at crossings, accident onlookers, haggling; density and hotspot pull by the day clock; crowd streamed around the camera. Fixed the footpath network (New Market 143 → 2,279 nodes, Gulistan 296 → 2,604; reachable hotspots 2/12 → 10/12 and 0/11 → 8/11; no node in a building). Follow-up fix (Claude, 2026-11-03): summoned customers only come over when their footpath route is direct (a 55 m customer could face a 414 m detour); chatting people within 15 m now turn to watch an accident; crowd test made robust (6/6 runs pass). Details: `docs/sprints/SPRINT-10.md`. Not covered: real-GPU frame rate; no women's outfits yet.
