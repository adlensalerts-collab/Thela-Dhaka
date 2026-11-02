"""Build the Sprint 9A GLB from the CC0 Quaternius standard animation-library glTF.
Usage: python3 scripts/prepare-character.py SOURCE.gltf OUTPUT.glb
Uses the source's adjacent .bin; no downloads or third-party Python packages.
"""
import copy
import json
from pathlib import Path
import struct
import sys


def prepare(source, output):
    document = json.loads(source.read_text())
    if len(document['buffers']) != 1 or document.get('images'):
        raise ValueError('Expected the texture-free, single-buffer standard mannequin')
    binary = (source.parent / document['buffers'][0]['uri']).read_bytes()
    names = {'Idle_Loop': 'idle', 'Walk_Loop': 'walk', 'Jog_Fwd_Loop': 'jog',
             'Sprint_Loop': 'sprint', 'Push_Loop': 'push'}
    selected = []
    for original in document['animations']:
        if original['name'] not in names:
            continue
        animation = copy.deepcopy(original)
        animation['name'] = names[original['name']]
        animation['channels'] = [channel for channel in animation['channels'] if not (
            document['nodes'][channel['target']['node']].get('name') == 'root'
            and channel['target']['path'] == 'translation')]
        used = sorted({channel['sampler'] for channel in animation['channels']})
        remap = {old: new for new, old in enumerate(used)}
        animation['samplers'] = [animation['samplers'][index] for index in used]
        for channel in animation['channels']:
            channel['sampler'] = remap[channel['sampler']]
        selected.append(animation)
    if {animation['name'] for animation in selected} != set(names.values()):
        raise ValueError('Missing an expected locomotion clip')
    document['animations'] = selected
    used_accessors = set()
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            used_accessors.update(primitive['attributes'].values())
            if 'indices' in primitive:
                used_accessors.add(primitive['indices'])
            for target in primitive.get('targets', []):
                used_accessors.update(target.values())
    for skin in document.get('skins', []):
        if 'inverseBindMatrices' in skin:
            used_accessors.add(skin['inverseBindMatrices'])
    for animation in selected:
        for sampler in animation['samplers']:
            used_accessors.update((sampler['input'], sampler['output']))
    accessor_ids = sorted(used_accessors)
    accessors = [document['accessors'][index] for index in accessor_ids]
    if any('sparse' in accessor for accessor in accessors):
        raise ValueError('Sparse accessors are not supported by this source-specific converter')
    view_ids = sorted({accessor['bufferView'] for accessor in accessors})
    view_map = {old: new for new, old in enumerate(view_ids)}
    packed = bytearray()
    views = []
    for index in view_ids:
        view = copy.deepcopy(document['bufferViews'][index])
        while len(packed) % 4:
            packed.append(0)
        start = view.get('byteOffset', 0)
        data = binary[start:start + view['byteLength']]
        if len(data) != view['byteLength']:
            raise ValueError('Truncated source buffer')
        view['buffer'] = 0
        view['byteOffset'] = len(packed)
        packed.extend(data)
        views.append(view)
    for accessor in accessors:
        accessor['bufferView'] = view_map[accessor['bufferView']]
    accessor_map = {old: new for new, old in enumerate(accessor_ids)}
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            primitive['attributes'] = {key: accessor_map[value] for key, value in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] = accessor_map[primitive['indices']]
            for target in primitive.get('targets', []):
                for key, value in target.items():
                    target[key] = accessor_map[value]
    for skin in document.get('skins', []):
        if 'inverseBindMatrices' in skin:
            skin['inverseBindMatrices'] = accessor_map[skin['inverseBindMatrices']]
    for animation in selected:
        for sampler in animation['samplers']:
            sampler['input'] = accessor_map[sampler['input']]
            sampler['output'] = accessor_map[sampler['output']]
    document['accessors'] = accessors
    document['bufferViews'] = views
    document['buffers'] = [{'byteLength': len(packed)}]
    document['asset']['copyright'] = 'Quaternius — CC0 1.0 Universal'
    document['asset']['generator'] += '; Thela Dhaka locomotion-only GLB subset'
    text = json.dumps(document, separators=(',', ':'), ensure_ascii=True).encode()
    text += b' ' * (-len(text) % 4)
    packed += b'\0' * (-len(packed) % 4)
    result = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(packed))
              + struct.pack('<II', len(text), 0x4E4F534A) + text
              + struct.pack('<II', len(packed), 0x004E4942) + packed)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    print(f'{output}: {len(result):,} bytes; {len(selected)} clips')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
