# Builds the fight sounds in src/client/audio/sfx from the Kenney CC0 packs
# "Impact Sounds" and "RPG Audio" (kenney.nl/assets), for phone speakers:
# layers (a bright one over a heavy one), a cut below 110 Hz, a lift of the
# 1-3 kHz band, compression, the same loudness for all, MP3 mono 96 kb/s.
# Phone speakers play almost nothing below 300 Hz, where most of the packs'
# thuds are. Needs Python 3 and ffmpeg:
#   python3 tools/build-sfx.py <folder with the unzipped packs> src/client/audio/sfx
import glob, os, re, subprocess, sys

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
TARGET_RMS = -15.0  # dBFS of the whole file
CHAIN = ('highpass=f=110,highpass=f=110,equalizer=f=1200:t=q:w=1.2:g=8,equalizer=f=3000:t=q:w=1:g=6,'
         'acompressor=threshold=0.1:ratio=6:attack=1:release=80:makeup=3')

def find(name):
    return glob.glob(f'{SRC}/**/{name}.ogg', recursive=True)[0]

# name: list of (source, gain, speed); speed > 1 is higher and shorter.
SOUNDS = {
    'blade-1': [('knifeSlice', 1, 1)],
    'blade-2': [('knifeSlice2', 1, 1)],
    'axe-1': [('chop', 1, 0.9), ('impactPunch_heavy_001', 0.5, 1)],
    'axe-2': [('chop', 1, 1.05), ('impactPunch_heavy_003', 0.5, 1)],
    'fist-1': [('impactPunch_medium_000', 1, 1), ('impactGeneric_light_000', 0.7, 1.2)],
    'fist-2': [('impactPunch_medium_001', 1, 1), ('impactGeneric_light_001', 0.7, 1.2)],
    'bite-1': [('chop', 0.8, 1.3), ('impactPunch_medium_001', 0.6, 1.1)],
    'bite-2': [('chop', 0.8, 1.45), ('impactGeneric_light_002', 0.6, 1.3)],
    'claw-1': [('knifeSlice2', 0.9, 0.8), ('impactPunch_heavy_001', 0.6, 1)],
    'claw-2': [('knifeSlice', 0.9, 0.85), ('impactPunch_heavy_003', 0.6, 1)],
    'charge-1': [('impactPunch_heavy_003', 1, 0.9), ('dropLeather', 0.8, 1)],
    'charge-2': [('impactPunch_heavy_001', 1, 0.85), ('dropLeather', 0.8, 0.9)],
    'peck-1': [('impactWood_light_000', 1, 1.2), ('impactGeneric_light_000', 0.6, 1.5)],
    'peck-2': [('impactWood_light_001', 1, 1.3), ('impactGeneric_light_001', 0.6, 1.5)],
    'arrow-1': [('impactGeneric_light_000', 1, 1), ('impactWood_light_000', 0.7, 0.9)],
    'arrow-2': [('impactGeneric_light_001', 1, 1.05), ('impactWood_light_001', 0.7, 0.9)],
    'crit-1': [('impactPlate_light_000', 1, 1)],
    'crit-2': [('impactPlate_light_002', 1, 0.95)],
    'dodge-1': [('cloth1', 1, 1.1)],
    'dodge-2': [('cloth2', 1, 1.15)],
    'fall-1': [('dropLeather', 1, 0.8), ('impactPunch_heavy_001', 0.7, 0.8)],
    'fall-2': [('dropLeather', 1, 0.75), ('impactPunch_heavy_003', 0.7, 0.75)],
}

def run(args):
    return subprocess.run(args, capture_output=True, text=True)

def rms(path):
    out = run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'astats', '-f', 'null', '-']).stderr
    return float(re.search(r'RMS level dB: (-?[\d.]+)', out).group(1))

for name, layers in SOUNDS.items():
    inputs, filters = [], []
    for index, (source, gain, speed) in enumerate(layers):
        inputs += ['-i', find(source)]
        filters.append(f'[{index}:a]aformat=channel_layouts=mono,aresample=44100,asetrate={round(44100 * speed)},aresample=44100,volume={gain}[l{index}]')
    mix = ''.join(f'[l{i}]' for i in range(len(layers)))
    graph = ';'.join(filters) + f';{mix}amix=inputs={len(layers)}:normalize=0:duration=longest,{CHAIN}[out]'
    raw = f'{OUT}/{name}.wav'
    result = run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *inputs, '-filter_complex', graph, '-map', '[out]', raw])
    if result.returncode:
        sys.exit(result.stderr)
    gain = TARGET_RMS - rms(raw)
    final = f'{OUT}/{name}.mp3'
    result = run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af',
                  f'volume={gain:.2f}dB,alimiter=limit=0.89:attack=1:release=40,silenceremove=start_periods=1:start_threshold=-50dB,apad=pad_dur=0.02',
                  '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', '-id3v2_version', '0', final])
    if result.returncode:
        sys.exit(result.stderr)
    os.remove(raw)
    print(f'{name}: {os.path.getsize(final)} B, RMS {rms(final):.1f} dBFS')
