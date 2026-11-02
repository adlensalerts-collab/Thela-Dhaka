# Character animation prototype — provenance

Author: Quaternius. Asset and animation licence: CC0 1.0 Universal (full text in `CC0-LICENSE.txt`).

Primary source and licence declaration:
https://quaternius.com/packs/universalanimationlibrary.html
https://quaternius.itch.io/universal-animation-library

Retrieved from the public mirror:
https://github.com/J-Ponzo/gltf-universal-animation-library
Pinned mirror revision: `e24c23cf2a1323488a3faa226ea7ea21f644b73e`.

Source files:
- `glTF/AnimationLibrary_Godot_Standard.gltf` SHA-256: `0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765`
- `glTF/AnimationLibrary_Godot_Standard.bin` SHA-256: `6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c`

Derived file: `locomotion-prototype.glb` (868,632 bytes).
SHA-256: `bd457993208bc53a89ab0f8baf1e0ff3d8ef62b9f165023da2c8e47c54101952`.

Preparation: `scripts/prepare-character.py` keeps the original skinned mannequin and only `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Push_Loop`, renamed idle/walk/jog/sprint/push. Root-bone translation channels are removed for in-place playback; skeletal pose animation remains. Unused accessors/buffer views are pruned and the remaining data is packed into one GLB. No textures or animation retargeting are required. No combat/injury/death clips are shipped.

This is a technical animation mannequin, not a final Bangladeshi character. Final clothing, skin/hair styling, vendor/cart hand placement, and hero/crowd integration belong to the following Sprint 9 steps.
