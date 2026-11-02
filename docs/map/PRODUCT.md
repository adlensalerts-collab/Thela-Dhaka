# Map — product code

Which file owns which feature. Sizes as of Hotfix 8.1. Files over ~20 KB: read via `HOTSPOTS.md` anchors.

## Engine and game loop
| Area | File | Key exports / functions |
|---|---|---|
| Game engine (state, input, movement, AI police, sales, restock, repair, upgrades, render loop) — **85 KB** | `src/game/simulation.ts` | `GameEngine`, `GameState`, `USE_REAL_MAP`, `REAL_MAP_ID` |
| Key bindings + defaults | `src/game/keybindings.ts` | `DEFAULT_BINDINGS`, `ACTION_METADATA`, `loadBindings` |
| Collision (circle/box/polygon, sliding) | `src/game/collision.ts` | `resolveMovement`, `checkCircleVsObstacle`, `circleVsPolygon`, `PolyObstacle` |
| Vehicle damage + repair cost | `src/game/damage.ts` | `DamageSystem`, `checkVehicleImpact` |
| Sprint stamina + levels | `src/game/stamina.ts` | `StaminaSystem`, `STAMINA_LEVELS` |
| Run statistics | `src/game/stats.ts` | `StatsTracker`, `RunStats` |
| Pedestrians (crowd AI, hotspot customers, AI Studio's dormant rage code) — **26 KB** | `src/game/pedestrians.ts` | `PedestrianManager.summonCustomers`, `releaseSummoned`, `setHotspots` |
| Footpath route graph + A* | `src/game/pathfinding.ts` | `SidewalkGraph` |
| Weather | `src/game/world/weather.ts` | `WeatherSystem` |
| Ambient city audio — **26 KB** | `src/game/audio/ambient.ts` | `SpatialSoundManager.setDistrict` |
| Sale/repair/restock timer ring | `src/game/ui/saleIndicator.ts` | `SaleIndicator` |
| Multiplayer server (rooms, relay, `/healthz`, origin allowlist, static `dist/` host) | `server.ts` (`render.yaml`, `.env.pages`) | Socket.io events `create_room`, `join_room`, `leave_room`, `request_rematch`, `player_update`, `player_action` |

## Real map (OpenStreetMap districts)
| Area | File | Key exports |
|---|---|---|
| District data types, level → district | `src/game/map/district.ts` | `District`, `districtForLevel` |
| Bundled maps (New Market, Gulistan) | `src/game/map/districtData.ts` + `data/*.json` | `getDistrict` |
| Builds the whole district (roads, footpaths, buildings, props, garages/aarots, collision) | `src/game/map/districtWorld.ts` | `buildDistrictWorld`, `nearestService`, `setServiceMode` (police: hospitals, no aarots) |
| Road network queries, lanes, routing | `src/game/map/roadGraph.ts` | `RoadGraph.isOnCarriageway`, `nearest`, `lanePose`, `route` |
| Traffic on real roads | `src/game/map/graphTraffic.ts` | `GraphTraffic` |
| Pedestrian graph on real footpaths | `src/game/map/footpathGraph.ts` | `buildFootpathGraph` |
| Spatial obstacle grid | `src/game/map/obstacleGrid.ts` | `ObstacleGrid.near` |
| Chunked visibility | `src/game/map/chunks.ts` | `ChunkManager`, `VIEW_DISTANCE` |
| Minimap background + road audit | `src/game/map/minimap.ts` | `createDistrictMinimap`, `auditDistrict` |

## World models (shared by both maps)
| Area | File | Key exports |
|---|---|---|
| People (procedural fallback, compact crowd controls, skeletal visual attachment) | `src/game/world/humans.ts` | `createHumanRig`, `animateHuman`, `setPushPose`, `outfitForArchetype` |
| Cached skeletal clips, dressed character loader and actor lifecycle | `src/game/world/animatedCharacter.ts` | `loadAnimatedCharacter`, `CHARACTER_MOTIONS` |
| Clothed vendor/police/civilian mesh, bound to the CC0 rig | `src/game/world/characterAppearance.ts` | `buildCharacterAppearance`, `CharacterAppearance` |
| Cart grip arm solver | `src/game/world/characterIK.ts` | `fitCharacterHands` |
| Procedural fallback switching, hero visuals and near-crowd budgets | `src/game/world/characterVisual.ts` | `CharacterVisual`, `CrowdCharacterLOD` |
| Vehicle models | `src/game/world/traffic.ts` | `buildVehicle`, `SPECS` (`spawnTraffic` = old grid only) |
| Trees | `src/game/world/trees.ts` | `buildTreesAt` (`buildPavementTrees` = old grid) |
| Garage / aarot models | `src/game/world/garages.ts`, `aarots.ts` | `buildGarage`, `buildAarot` (`*_SITES`, `nearest*` = old grid) |
| Dhaka buildings (old grid only) | `src/game/world/buildings.ts` | `buildDhakaBuilding` |
| Old grid layout audit | `src/game/world/layout.ts` | `auditObstacles` |

## Rendering
| Area | File | Key exports |
|---|---|---|
| PBR materials, per-surface tuning, world UVs | `src/game/render/pbr.ts` | `pbrMaterial`, `createPbrMaterials`, `applyWorldUV` (tuning const: `SURFACE_TUNING`) |
| Worn road paint + deterministic flush footpath drains (existing marking batch) | `src/game/render/streetDetails.ts` | `createStreetPaint`, `collectDrainGrates` |
| World-space asphalt/pavement cracks, repair patches and plaster rain streaks (material shader; no extra geometry) | `src/game/render/surfaceWear.ts` | `applySurfaceWear` |
| Shared shop-sign atlases + chunked merged sign meshes | `src/game/render/signboards.ts` | `SignboardBatch.add`, `SignboardBatch.build` |
| Sky, sun, ambient light, clouds, brightness | `src/game/render/lighting.ts` | `setupRealisticLighting` (ambient strength const: `ENV_INTENSITY`) |
| Quality presets, adaptive resolution | `src/game/render/quality.ts` | `QUALITY_PRESETS`, `AdaptiveResolution` |
| Display settings storage | `src/game/render/display.ts` | `loadDisplaySettings` |

## UI (React)
| Area | File |
|---|---|
| Separate character animation preview | `character-preview.html` + `src/dev/characterPreview.ts` |
| App shell, socket wiring, modals | `src/App.tsx` |
| In-game HUD (stats, minimap, button bar, hotspot badge) — **31 KB** | `src/components/GameHUD.tsx` |
| Title screen (role, solo/online, OSM credit) | `src/components/TitleScreen.tsx` |
| Settings (keys, mouse, display, graphics) — **22 KB** | `src/components/SettingsModal.tsx` |
| End-of-run statistics | `src/components/StatsScreen.tsx` |
| Pause / bribe / arrest modals | `src/components/EventModal.tsx` |

## Not part of the game
| Path | What it is |
|---|---|
| `extracted_proto/`, `public/assets/aistudio/` | Old prototype material. Never read. |
| `tools/osm2district.py`, `tools/preview_district.py` | Offline map converter + preview/validator (see `OPERATIONS.md`) |
| `public/assets/textures/` | CC0 photo textures (pavement, brick, metal) + `CREDITS.md` |
