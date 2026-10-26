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
    # A dying hiss: the cry when hit, 20% lower and slower, without the
    # sharp top, fading out.
    'hiss-low': {'longest': 0.8, 'chain': f'asetrate={round(SR * 0.8)},aresample={SR},' + VOICE_CHAIN.replace('lowpass=f=10000', 'lowpass=f=6000,lowpass=f=6000'), 'tail': 35, 'rms': -16},
    # Coins spilling from a chest: the whole jingle, quieter in the file, as
    # its many sharp peaks would otherwise hit full scale.
    'coins': {'longest': 2.5, 'chain': 'highpass=f=150,lowpass=f=14000', 'tail': 40, 'rms': -21},
    # A skill as it wakes or strikes: up to 1.4 s, without the rumble a phone
    # cannot play, lifted where it plays, a little quieter than a blow.
    'skill': {'longest': 1.4, 'chain': 'highpass=f=150,highpass=f=150,equalizer=f=1500:t=q:w=1.2:g=4,equalizer=f=3500:t=q:w=1:g=2,lowpass=f=13000', 'tail': 35, 'rms': -17},
}

# Output name: (draft file under SRC, kind).
SOUNDS = {
    'tab-1': ('ui/tab-wood-20261024T1244-1.mp3', 'click'),
    'tab-2': ('ui/tab-wood-20261024T1244-0.mp3', 'click'),
    'swing-1': ('effects/swing-20261024T1244-1.mp3', 'whoosh'),
    'swing-2': ('effects/swing-20261024T1244-0.mp3', 'whoosh'),
    'magic-1': ('effects/magic-20261024T1252-0.mp3', 'spark'),
    'magic-2': ('effects/magic-20261024T1252-1.mp3', 'spark'),
    # The chest of the narrator's quests (quests.js).
    'chest-1': ('effects/chest-coins-20261025T1130-1.mp3', 'coins'),
}
# The takes kept from the newest draft of a voice that has more than two,
# chosen by measure: the least rumble below 300 Hz, the fewest clicks (a cry,
# not speech), the softest top. Likho has one: its other takes were rumble.
TAKES = {
    'wolf-hurt': [1, 3],
    'alpha-wolf-hurt': [0, 2],
    'boar-hurt': [2, 1],
    'likho-hurt': [1],
    'spider-hurt': [2, 0],
    'spider-death': [1, 2],
    'male-death': [1, 2],
}
# The skills' sounds (effects/skill-<id>-<time>-<take>.mp3): skill-<id>-1 is
# in the game, skill-<id>-2 on the listening page to choose from. First chosen
# by measure: the least energy below 300 Hz, a clean fade. The four drafts of
# 26.10 07:02 were recorded again, brighter, as the first ones were mostly
# rumble. Then the author picked on the listening page (26.10): the other
# take of Potężny cios, Szeroki zamach, Nieugięty, Przyszpilenie and
# Egzorcyzm is in the game now. Six were recorded again by the author's notes
# (07:43; Osłona many and Taniec cieni once more at 07:46, as the drop came
# out too short and the dance all rumble, and Cios w plecy at 07:49, as its
# one low step stood almost a second before the slash). The author then
# picked the other take of Zatrute ostrze, and Celny strzał was recorded
# once more (08:10) without its whistle, which sounded like a squeak. Then
# once more (09:22) as an arrow in the bullseye with a soft magical chime
# after it, as the author asked: take 0 rings on longer, and the author
# picked the shorter take 1 for the game.
SKILL_TAKES = {
    'power-strike': ['0650-0', '0650-1'],
    'wide-sweep': ['0650-0', '0650-1'],
    'unyielding': ['0650-1', '0650-0'],
    'aimed-shot': ['0922-1', '0922-0'],
    'arrow-rain': ['0743-0', '0743-1'],
    'pinning-shot': ['0650-1', '0650-0'],
    'fireball': ['0702-1', '0650-1'],
    'frost-gust': ['0650-1', '0650-0'],
    'mana-shield': ['0746-0', '0746-1'],
    'prayer-of-health': ['0650-1', '0650-0'],
    'exorcism': ['0650-1', '0650-0'],
    'blessing': ['0650-0', '0650-1'],
    'backstab': ['0749-1', '0749-0'],
    'poisoned-blade': ['0743-1', '0743-0'],
    'shadow-dance': ['0746-0', '0746-1'],
}
for id, takes in SKILL_TAKES.items():
    for number, take in enumerate(takes):
        time, index = take.split('-')
        SOUNDS[f'skill-{id}-{number + 1}'] = (f'effects/skill-{id}-20261026T{time}-{index}.mp3', 'skill')

# A voice made from another voice's drafts. ElevenLabs gave only sharp
# hisses for a dying viper (three tries, ten takes, all turned down), so its
# death is its cry when hit, which the author kept, lower and fading.
DERIVED = {'viper-death': ('viper-hurt', 'hiss-low')}

# Voices, when their drafts are there: <id>-1 and <id>-2 from the newest
# draft of each id (takes 0 and 1, or the ones in TAKES).
VOICES = os.path.join(SRC, 'voices')
if os.path.isdir(VOICES):
    newest = {}  # id → its newest draft (the names sort by time)
    for meta in sorted(f for f in os.listdir(VOICES) if f.endswith('.json')):
        draft = json.load(open(os.path.join(VOICES, meta)))
        newest[draft['id']] = draft
    for id, draft in newest.items():
        kind = 'cry' if id.endswith('-hurt') else 'dying'
        for number, take in enumerate(TAKES.get(id, [0, 1])):
            SOUNDS[f'{id}-{number + 1}'] = (os.path.relpath(draft['files'][take], 'audio/drafts'), kind)
    for id, (source, kind) in DERIVED.items():
        for number, take in enumerate([0, 1]):
            SOUNDS[f'{id}-{number + 1}'] = (os.path.relpath(newest[source]['files'][take], 'audio/drafts'), kind)


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
