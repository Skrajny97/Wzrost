# Builds game sounds from ElevenLabs drafts (the "Dźwięki (szkice)" workflow,
# art-drafts branch, audio/drafts/) for phone speakers: from the first sound
# to its fading end, a cut of the low band phones do not play, a lift where
# they do, the same loudness for all, MP3 mono 96 kb/s. Needs Python 3,
# numpy and ffmpeg:
#   git archive origin/art-drafts audio/drafts | tar -x -C <folder>
#   python3 tools/build-drafts.py <folder>/audio/drafts src/client/audio/sfx
import json, os, subprocess, sys

import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
SR = 44100
VOICE_CHAIN = ('highpass=f=140,highpass=f=140,equalizer=f=1200:t=q:w=1.2:g=6,equalizer=f=3000:t=q:w=1:g=3,'
               'lowpass=f=10000,acompressor=threshold=0.1:ratio=4:attack=2:release=80:makeup=2')
# Per kind: the longest length kept, the filters, the tail kept below the
# loudest moment (dB) and the loudness (RMS in dBFS from the start to the
# fading end). The level in the game is the gain in data/sounds.json.
KINDS = {
    # A click: its body only, without boom or hiss. Quieter in the file, so
    # its sharp peak stays below full scale.
    'click': {'longest': 0.12, 'chain': 'highpass=f=200,highpass=f=200,lowpass=f=9000', 'tail': 30, 'rms': -18},
    # A magic spark: its bright start, as long as a bolt flies.
    'spark': {'longest': 0.45, 'chain': 'highpass=f=300,lowpass=f=12000', 'tail': 30, 'rms': -18},
    # A whoosh, lifted into the band phone speakers carry.
    'whoosh': {'longest': 0.3, 'chain': 'highpass=f=150,equalizer=f=1200:t=q:w=1.2:g=6,equalizer=f=3000:t=q:w=1:g=4', 'tail': 35, 'rms': -15},
    # Voices, like the blows: without rumble, lifted at 1.2 and 3 kHz and
    # evened out, so that deep growls still carry on a phone. A cry when hit
    # stays short, since blows come fast; a dying cry may last a second.
    'cry': {'longest': 0.6, 'chain': VOICE_CHAIN, 'tail': 35, 'rms': -15},
    'dying': {'longest': 1.0, 'chain': VOICE_CHAIN, 'tail': 40, 'rms': -15},
}

# Output name: (draft file under SRC, kind).
SOUNDS = {
    'tab-1': ('ui/tab-wood-20261024T1244-1.mp3', 'click'),
    'tab-2': ('ui/tab-wood-20261024T1244-0.mp3', 'click'),
    'swing-1': ('effects/swing-20261024T1244-1.mp3', 'whoosh'),
    'swing-2': ('effects/swing-20261024T1244-0.mp3', 'whoosh'),
    'magic-1': ('effects/magic-20261024T1252-0.mp3', 'spark'),
    'magic-2': ('effects/magic-20261024T1252-1.mp3', 'spark'),
}
# Voices, when their drafts are there: <id>-1 and <id>-2 from takes 0 and 1
# of the newest draft of each id.
VOICES = os.path.join(SRC, 'voices')
if os.path.isdir(VOICES):
    for meta in sorted(f for f in os.listdir(VOICES) if f.endswith('.json')):
        draft = json.load(open(os.path.join(VOICES, meta)))
        for take, path in enumerate(draft['files']):
            kind = 'cry' if draft['id'].endswith('-hurt') else 'dying'
            SOUNDS[f"{draft['id']}-{take + 1}"] = (os.path.relpath(path, 'audio/drafts'), kind)


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, **kwargs)


def decode(path, chain=None):
    args = ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR)]
    if chain:
        args += ['-af', chain]
    return np.frombuffer(run(args + ['-f', 'f32le', '-']).stdout, dtype=np.float32)


def span(samples, tail, longest):
    """From the first sound to where it fades `tail` dB below its loudest moment."""
    frame = SR // 200  # 5 ms
    count = len(samples) // frame
    level = 10 * np.log10((samples[: count * frame].reshape(count, frame) ** 2).mean(axis=1) + 1e-12)
    loud = np.where(level > level.max() - tail)[0]
    start = max(0, loud[0] * frame - frame)
    end = min(len(samples), (loud[-1] + 2) * frame, start + int(longest * SR))
    return start / SR, (end - start) / SR


report = []
for name, (draft, kind) in SOUNDS.items():
    settings = KINDS[kind]
    source = os.path.join(SRC, draft)
    filtered = decode(source, settings['chain'])
    start, length = span(filtered, settings['tail'], settings['longest'])
    part = filtered[int(start * SR): int((start + length) * SR)]
    gain = settings['rms'] - 20 * np.log10(np.sqrt((part ** 2).mean()) + 1e-12)
    fade = length * 0.4
    chain = (f"{settings['chain']},atrim=start={start:.3f}:duration={length:.3f},asetpts=PTS-STARTPTS,"
             f"afade=t=in:d=0.003,afade=t=out:st={length - fade:.3f}:d={fade:.3f},"
             f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false")
    out = os.path.join(OUT, f'{name}.mp3')
    result = run(['ffmpeg', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', str(SR), '-af', chain,
                  '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', out], text=True)
    if result.returncode:
        sys.exit(f'{name}: {result.stderr}')
    report.append(f'{name}: {draft}, from {start:.3f} s, {length:.3f} s, {gain:+.1f} dB')

print('\n'.join(report))
