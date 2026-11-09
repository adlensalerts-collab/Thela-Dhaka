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
| Working-day clock + daily profit targets & rent/food accounting | `src/game/day.ts` | `DAY_DURATION_SECONDS`, `DAY_RENT_COST`, `DAY_FOOD_COST`, `formatDayClock`, `getDayProfitTarget`, `evaluateDayOutcome` |
| Run statistics | `src/game/stats.ts` | `StatsTracker`, `RunStats` |
| Solo-vendor campaign, defeat rules, day progression and Endless | `src/game/campaign.ts` | `Campaign`, `vendorFailure`, `campaignTarget` (engine integration in `simulation.ts`) |
| Campaign difficulty anchors, interpolation and briefing data | `src/game/difficulty.ts` | `difficultyForDay`, `dayBriefing` |
| Bounded solo police, road-junction patrol destinations, sighting memory, search, backup and interception, officer hurt/aggression (`vendorContact`, `aggressive`, `onInjury`) | `src/game/campaignPolice.ts` | `CampaignPolice` (engine applies population at day/mode reset) |
| Police field of view, obstacle occlusion, chase speed and tactical unlocks | `src/game/policePerception.ts` | `inPoliceView`, `policeLineOfSight`, `policeTactics` |
| Pedestrians (activities, crossings, hotspot customers, near/far detail; legacy rage remains dormant) | `src/game/pedestrians.ts` | `PedestrianManager.summonCustomers`, `updateDetail`, `setTimeOfDay`, `setRoadProbes`, `setBrowsePoints`, `dispose` |
| Time-of-day crowd density and hotspot pull | `src/game/crowd/crowdSchedule.ts` | `activeFraction` |
| Active hotspot windows, demand and nearest-site selection | `src/game/hotspots.ts` | `scheduleHotspots`, `hotspotPeriod`, `nearbyHotspot` (shared by engine, crowd, HUD and radar) |
| Dynamic hotspot event labels | `src/game/hotspotEvents.ts` | `activeHotspotEvent` (engine populates the nearby vendor badge) |
| Instanced far-crowd representation | `src/game/crowd/crowdImpostors.ts` | `CrowdImpostors` |
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
| Radar projection, bounded actor payloads and service bearings | `src/game/ui/radar.ts` | `radarPosition`, `radarEdge`, `nearbyRadarPoints`, `radarPois` (snapshot collected in `GameEngine.publishState`) |

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
Renderer: `WebGPURenderer` (WebGPU, or WebGL 2 fallback). `vite.config.ts` aliases `three` → `three/webgpu`, so all materials must be node-compatible: no `ShaderMaterial`, `onBeforeCompile` or `WebGLRenderer`; write custom shading in TSL (`three/tsl`). Credits: `THIRD_PARTY_NOTICES.md`.

| Area | File | Key exports |
|---|---|---|
| PBR materials, per-surface tuning, world UVs | `src/game/render/pbr.ts` | `pbrMaterial`, `createPbrMaterials`, `applyWorldUV` (tuning const: `SURFACE_TUNING`) |
| Worn road paint + deterministic flush footpath drains (existing marking batch) | `src/game/render/streetDetails.ts` | `createStreetPaint`, `collectDrainGrates` |
| World-space wear (TSL): asphalt/pavement cracks and patches, plaster rain streaks, Dhaka facade slab bands + monsoon damp (plaster, brick), wet roads and puddles | `src/game/render/surfaceWear.ts` | `applySurfaceWear`, `roadWetness` (set by `WeatherSystem`) |
| Shared shop-sign atlases + chunked merged sign meshes | `src/game/render/signboards.ts` | `SignboardBatch.add`, `SignboardBatch.build` |
| WebGPU lighting: SkyMesh sky + clouds, 2-cascade SunLight, sky PMREM, aerial fog, day-clock presets (dawn → night) | `src/game/render/lighting.ts` | `setupRealisticLighting`, `LightingRig.setHour`, `rendererReady`, `setWeather`, `look` |
| Colour grade + bloom + vignette (TSL RenderPipeline; ACES once at output) | `src/game/render/postfx.ts` | `GamePipeline`, `LOOKS` |
| Interior-mapped window glass, street-lamp heads + light pools, clock-driven glow | `src/game/render/windows.ts` | `createWindowMaterial`, `createLampHeadMaterial`, `createLampPoolMaterial`, `interiorGlow`, `streetLamps` |
| Perf probe + benchmark overlay (F3 / `?perf`) | `src/game/render/perfProbe.ts` | `PerfProbe` (engine calls `perfProbe.frame()` each render) |
| Speech bubbles over heads (pooled sprites, Bangla font stack) | `src/game/dialogue/speechBubble.ts` | `SpeechBubbles.say/update/clear/setLowQuality` (engine field `bubbles`) |
| Bangla police lines by situation, no immediate repeats | `src/game/dialogue/policeLines.ts` | `POLICE_LINES`, `PoliceLinePicker` (engine: `policeSay`, `policeSayNearest`) |
| Street fights between pedestrians (approach, argue, blows, knock-down, police break-up) | `src/game/pedestrians.ts` | `PedestrianManager.startFight`, `updateFights`, `activeFightPoint`, `setFightRate`, `officers` (engine sets it each frame) |
| Officer approach state machine (spot → walk up → warn → escalate / stand down) | `src/game/policeApproach.ts` | `stepApproach`, `chooseApproacher`, `createApproach` (used by `CampaignPolice`) |
| Instanced ground blood decals (max 24, 8 on Low) for knock-downs | `src/game/render/bloodDecals.ts` | `BloodDecals` (owned by `PedestrianManager`; officers use `pedestrianManager.bloodDecals`) |
| Ground glow quad used instead of PointLights | `src/game/render/glow.ts` | `createGlowPool` (garages, aarots) |
| Vehicle look: road grime, painted rickshaw hoods, night lamps, contact shadows, headlight pools | `src/game/render/vehicleLook.ts` | `grimy`, `rickshawHoodMaterial`, `lampMaterial`, `addGroundEffects` (used by `world/traffic.ts`) |
| Quality presets (render height, shadows, `post` none/grade/full, `clouds`, `aerialFog`), adaptive resolution | `src/game/render/quality.ts` | `QUALITY_PRESETS`, `defaultQuality` (phone Low, computer Medium), `AdaptiveResolution` |
| Display settings storage | `src/game/render/display.ts` | `loadDisplaySettings` |

## UI (React)
| Area | File |
|---|---|
| Separate character animation preview | `character-preview.html` + `src/dev/characterPreview.ts` |
| Separate street-sound preview | `sound-preview.html` + `src/dev/soundPreview.ts` (synthesis: `src/game/audio/streetSounds.ts`) |
| App shell, socket wiring, modals | `src/App.tsx` |
| In-game HUD (stats, minimap, button bar, hotspot badge) — **31 KB** | `src/components/GameHUD.tsx` |
| Circular heading-up radar, actor markers, service bearings and map key | `src/components/GameRadar.tsx` |
| Title screen (role, solo/online, OSM credit) | `src/components/TitleScreen.tsx` |
| Settings (keys, mouse, display, graphics) — **22 KB** | `src/components/SettingsModal.tsx` |
| End-of-run statistics | `src/components/StatsScreen.tsx` |
| Solo campaign result, totals and New Market shop ending | `src/components/CampaignEnding.tsx` (selected by `EventModal.tsx`; day cards from `StatsScreen.tsx`) |
| Next-day district, target and difficulty briefing | `src/components/LevelBriefing.tsx` (selected by `EventModal.tsx`) |
| Pause / bribe / arrest modals | `src/components/EventModal.tsx` |

## Not part of the game
| Path | What it is |
|---|---|
| `extracted_proto/`, `public/assets/aistudio/` | Old prototype material. Never read. |
| `tools/osm2district.py`, `tools/preview_district.py` | Offline map converter + preview/validator (see `OPERATIONS.md`) |
| `public/assets/textures/` | CC0 photo textures (pavement, brick, metal) + `CREDITS.md` |
