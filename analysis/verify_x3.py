"""Run the requested technical checks and retain complete logs; never inspect images."""
import common
import hashlib
import json
import os
import subprocess
import sys
import time
import math


def data_checks():
    audio = json.loads((common.PROJECT / 'data/audio.json').read_text())
    lyrics = json.loads((common.PROJECT / 'data/lyrics.json').read_text())
    features = ['rms', 'low', 'mid', 'high', 'vocal', 'drums', 'bass', 'other']
    n = math.ceil(audio['duration'] * audio['fps'])
    for name in features:
        assert len(audio[name]) == n, name
        assert all(math.isfinite(x) and 0 <= x <= 1 for x in audio[name]), name
    for key in ['beats', 'downbeats']:
        times = audio[key]
        assert all(0 <= a < b < audio['duration'] for a, b in zip(times, times[1:])), key
    assert set(audio['downbeats']).issubset(audio['beats'])
    assert audio['sections'][0]['start'] == 0
    assert audio['sections'][-1]['end'] == audio['duration']
    for i, section in enumerate(audio['sections']):
        assert section['start'] < section['end']
        if i:
            assert audio['sections'][i - 1]['end'] == section['start']
    for key in ['kick', 'snare', 'hat', 'vocal']:
        events = audio['onsets'][key]
        assert all(0 <= t < audio['duration'] and 0 <= s <= 1 for t, s in events), key
        assert all(a[0] <= b[0] for a, b in zip(events, events[1:])), key
    words = [w for line in lyrics['lines'] for w in line['words']]
    for i, w in enumerate(words):
        assert 0 <= w['start'] < w['end'] <= audio['duration'], w
        if i:
            assert words[i - 1]['end'] <= w['start'], w
        for a, b in w.get('syl', []):
            assert w['start'] <= a < b <= w['end'], w
    assert any(w['w'].lower().strip(',.!?') == 'cache' for w in words)
    assert not any(w['w'].lower().strip(',.!?') == 'cash' for w in words)
    master = common.PROJECT / 'audio/candidates/c1-works-on-my-machine.wav'
    copy = common.PROJECT / 'audio/song.wav'
    digest = hashlib.sha256(master.read_bytes()).hexdigest()
    assert hashlib.sha256(copy.read_bytes()).hexdigest() == digest
    assert not (common.PROJECT / 'data/audio.approx.json').exists()
    assert not (common.PROJECT / 'data/lyrics.approx.json').exists()
    import soundfile as sf
    info = {name: dict(duration=sf.info(common.PROJECT / f'out/x3/{name}.wav').duration,
                       frames=sf.info(common.PROJECT / f'out/x3/{name}.wav').frames,
                       sample_rate=sf.info(common.PROJECT / f'out/x3/{name}.wav').samplerate)
            for name in ['click-check', 'click-check-hooks']}
    assert info['click-check']['duration'] == audio['duration']
    return dict(duration=audio['duration'], beats=len(audio['beats']), downbeats=len(audio['downbeats']),
                sections=len(audio['sections']), lines=len(lyrics['lines']), words=len(words),
                envelope_frames=n, envelope_count=len(features), master_sha256=digest, click_files=info)


def main():
    out = common.PROJECT / 'out/x3'
    out.mkdir(parents=True, exist_ok=True)
    checks = [
        ('unittest', [sys.executable, '-m', 'unittest', 'discover', '-s', 'analysis', '-p', 'test_*.py', '-v'], common.PROJECT),
        ('typescript', ['bunx', 'tsc', '--noEmit', '-p', 'tsconfig.json'], common.PROJECT / 'app'),
        ('video', ['bun', 'scripts/render.ts', 'video', '--from', '20', '--to', '25', '--preset', 'veryfast',
                   '--out', '../out/x3/check.mp4', '--url', 'http://localhost:59983'], common.PROJECT / 'app'),
        ('stills', ['bun', 'scripts/render.ts', 'stills', '--t', '5,30,90', '--out', '../out/x3/stills',
                    '--url', 'http://localhost:59983'], common.PROJECT / 'app'),
        ('preview', ['bun', 'analysis/check_preview.ts'], common.PROJECT),
    ]
    result = dict(data=data_checks())
    for name, command, cwd in checks:
        started = time.perf_counter()
        print(f'Running {name}: {command}', flush=True)
        with (out / f'{name}.log').open('w') as log:
            run = subprocess.run(command, cwd=cwd, env=os.environ.copy(), stdout=log, stderr=subprocess.STDOUT)
        text = (out / f'{name}.log').read_text()
        result[name] = dict(command=command, cwd=str(cwd), exit_code=run.returncode,
                            seconds=time.perf_counter() - started, log=f'out/x3/{name}.log',
                            browser_log=text.split('BROWSER LOG:\n', 1)[-1].splitlines() if 'BROWSER LOG:\n' in text else [])
        print(text, flush=True)
        (out / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    if result['video']['exit_code'] == 0:
        probe = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels',
            '-of', 'json', str(out / 'check.mp4')], text=True)
        result['ffprobe'] = json.loads(probe)
        (out / 'check.ffprobe.json').write_text(probe)
    result['stills_files'] = [p.name for p in sorted((out / 'stills').glob('*.png'))]
    (out / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    if any(result[name]['exit_code'] for name, _, _ in checks):
        raise SystemExit('One or more X3 checks failed; see out/x3/*.log')


if __name__ == '__main__':
    main()
