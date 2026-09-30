"""Reproducible X3 analysis and listening artifacts, entirely inside the worktree."""
import common
import argparse
import csv
import json
import shutil
import numpy as np


def dump(path, doc, compact=False):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(doc, indent=None if compact else 2,
        separators=(',', ':') if compact else None, ensure_ascii=False, allow_nan=False) + '\n')
    temporary.replace(path)


def prepare():
    from separate import measure_offset
    if not all((common.STEMS / f'{n}.wav').is_file() for n in common.STEM_NAMES):
        raise FileNotFoundError('Run separate.py first; this stage reuses supplied stems')
    measure_offset()


def load_signals():
    sr = 44100
    mix, _ = common.load_mix(sr)
    stems = {}
    for name in common.STEM_NAMES:
        y, _ = common.load_stem(name, sr)
        stems[name] = np.pad(y[:len(mix)], (0, max(0, len(mix) - len(y))))
    return sr, mix, stems


def beats_stage():
    from beat_tracking import track
    sr, mix, stems = load_signals()
    beats, report = track(stems, mix, sr, common.CONFIG['bpm'])
    report['beats'] = beats.tolist()
    dump(common.WORK / 'beats.json', report)
    print(json.dumps({k: report[k] for k in ('mode', 'bpm', 'constant_test', 'residual_summary')}, indent=2), flush=True)


def align_stage():
    from ctc_emissions import compute
    from vocal_feats import compute as features
    from align import main as align
    expected_frames = len(common.load_stem('vocals', 16000)[0]) // 320
    for name in ('mms', 'lv60k'):
        if not valid_emission(common.WORK / f'emission_{name}.npy', expected_frames):
            compute(name, source='vocals')
    if not (common.WORK / 'vocal_feats.npz').exists():
        features(pitch=False)
    align()


def valid_emission(path, expected_frames):
    """A killed writer must not turn a truncated cache into a completed stage."""
    try:
        data = np.load(path, allow_pickle=False)
        return data.ndim == 2 and data.shape[0] == expected_frames and np.isfinite(data).all()
    except (OSError, ValueError, EOFError):
        return False


def regression(reference):
    """Generate from audio first; reference data is only used for comparison."""
    beats_stage()
    from beat_tracking import stats, nearest_residual
    measured = json.loads((common.WORK / 'beats.json').read_text())
    expected = json.loads(reference.read_text())
    b, r = np.array(measured['beats']), np.array(expected['beats'])
    result = dict(mode=measured['mode'], bpm=measured['bpm'], reference_bpm=expected['bpm'],
                  measured_count=len(b), reference_count=len(r),
                  measured_to_reference=stats(nearest_residual(b, r)),
                  reference_to_measured=stats(nearest_residual(r, b)),
                  interval_range_ms=float(np.ptp(np.diff(b)) * 1000))
    dump(common.WORK / 'regression.json', result)
    print(json.dumps(result, indent=2), flush=True)


def envelopes(sr, mix, stems, rhythm):
    """Retain upstream envelope/onset definitions, without a second beat fit."""
    import librosa
    from scipy.signal import sosfiltfilt
    from signal_features import band_sos, frame_rms, norm01, smooth_env, drum_onsets, strength01
    env = dict(rms=frame_rms(mix, sr))
    for name, (lo, hi) in dict(low=(None, 150), mid=(150, 2000), high=(4000, None)).items():
        env[name] = frame_rms(sosfiltfilt(band_sos(lo, hi, sr), mix), sr)
    for name, y in stems.items():
        env['vocal' if name == 'vocals' else name] = frame_rms(y, sr)
    normalized = {k: np.round(norm01(smooth_env(y)), 3).tolist() for k, y in env.items()}
    # Upstream drum_onsets accepts grid arguments but does not snap to that grid.
    kick, snare, hat, _ = drum_onsets(stems['drums'], sr, 60 / rhythm['bpm'], rhythm['beats'][0])
    onset = {name: [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ts, strength01(db))]
             for name, (ts, db) in zip(('kick', 'snare', 'hat'), (kick, snare, hat))}
    vocal = librosa.resample(stems['vocals'], orig_sr=sr, target_sr=22050)
    onset['vocal'] = [[float(t), 1.] for t in librosa.onset.onset_detect(
        y=vocal, sr=22050, hop_length=110, units='time')]
    return dict(duration=len(mix) / sr, fps=100, time_signature=common.CONFIG['beats_per_bar'],
                **normalized, onsets=onset)


def phase_scores(beats, stems, sr, lyrics):
    import librosa
    from scipy.signal import sosfiltfilt
    from signal_features import band_sos
    y = librosa.resample(stems['other'] + stems['bass'], orig_sr=sr, target_sr=22050)
    chroma = librosa.feature.chroma_stft(y=y, sr=22050, hop_length=256)
    low = sosfiltfilt(band_sos(None, 150, sr), stems['bass'])
    novelty, bass = [], []
    for i, t in enumerate(beats):
        p = beats[min(i + 1, len(beats) - 1)] - beats[max(i - 1, 0)]
        p /= 2 if 0 < i < len(beats) - 1 else 1
        def win(a, b):
            ia, ib = max(0, int(a * 22050 / 256)), min(chroma.shape[1], int(b * 22050 / 256))
            return chroma[:, ia:max(ia + 1, ib)].mean(axis=1)
        a, b = win(t - .7 * p, t - .15 * p), win(t + .15 * p, t + .7 * p)
        novelty.append(1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        bass.append(np.sqrt(np.mean(low[int(t * sr):min(len(low), int((t + .18 * p) * sr))] ** 2)))
    hook_times = [w['syl'][1][0] for l in lyrics['lines'] for w in l['words']
                  if common.tokens(w['w']) == ['commit'] and len(w.get('syl', [])) > 1]
    line_times = [l['start'] for l in lyrics['lines'] if not l['text'].startswith('I need')]
    features = np.array([novelty, bass]).T
    def score_window(a, b):
        candidates = []
        for phase in range(4):
            mask = (np.arange(len(beats)) % 4 == phase) & (beats >= a) & (beats < b)
            selected = beats[mask]
            def proximity(times):
                times = [t for t in times if a <= t < b]
                return float(np.mean([np.exp(-(np.min(abs(selected - t)) / .18) ** 2) for t in times])) if len(selected) and times else 0.
            candidates.append(dict(phase=phase,
                harmony=float(features[mask, 0].mean()) if mask.any() else 0.,
                bass=float(features[mask, 1].mean()) if mask.any() else 0.,
                lyric=proximity(line_times), hook=proximity(hook_times)))
        for key, weight in (('harmony', .55), ('bass', .20), ('lyric', .10), ('hook', .15)):
            vals = np.array([c[key] for c in candidates])
            v = (vals - vals.min()) / (np.ptp(vals) + 1e-9)
            for c, x in zip(candidates, v):
                c['score'] = c.get('score', 0.) + weight * float(x)
        ranked = sorted(candidates, key=lambda c: c['score'], reverse=True)
        margin = ranked[0]['score'] - ranked[1]['score']
        return dict(selected=ranked[0]['phase'], margin=margin,
                    confidence='medium' if margin >= .15 else 'low', candidates=candidates)
    return score_window, hook_times


def section_grid(lyrics, beats, phase, duration):
    from lyric_timing import section_lines
    anchors = [dict(line_index=l['i'], text=l['text'], start=l['start']) for l in lyrics['lines']]
    mapped = section_lines(anchors)
    indexes = np.arange(len(beats))
    def time_at(i):
        if i < 0:
            return float(beats[0] + i * np.median(np.diff(beats[:17])))
        if i > len(beats) - 1:
            return float(beats[-1] + (i - len(beats) + 1) * np.median(np.diff(beats[-17:])))
        return float(np.interp(i, indexes, beats))
    result = []
    for i, (s, anchor) in enumerate(zip(common.CONFIG['sections'], mapped)):
        if anchor:
            pos = float(np.interp(anchor['start'], beats, indexes))
            bar = np.floor((pos - phase + .12) / 4)
            if pos - phase - bar * 4 > 2:
                bar += 1
            beat_i = phase + int(bar) * 4
            start, source = max(0., time_at(beat_i)), 'CTC first word + variable bar grid; pickup <2 beats'
        elif i == 0:
            beat_i, start, source = phase, 0., 'file start'
        else:
            beat_i = result[-1]['beat_index'] + 4 * result[-1]['nominal_bars']
            start, source = time_at(beat_i), 'previous section nominal bars (inferred)'
        if start >= duration or (result and start <= result[-1]['start']):
            raise ValueError(f'Non-increasing section: {s["name"]} at {start}')
        result.append(dict(name=s['name'], start=start, beat_index=beat_i, nominal_bars=s['bars'],
                           lyric_start=anchor['start'] if anchor else None, source=source))
    for i, s in enumerate(result):
        s['end'] = result[i + 1]['start'] if i + 1 < len(result) else duration
    return result


def click_checks(audio, lyrics):
    import soundfile as sf
    y, sr = common.load_mix(48000, mono=False)
    y = y.T.copy() * .75
    beats, down = np.array(audio['beats']), np.array(audio['downbeats'])
    n = int(.035 * sr)
    t = np.arange(n) / sr
    for b in beats:
        freq = 1800 if np.min(abs(down - b)) < .001 else 1100
        click = .18 * np.sin(2 * np.pi * freq * t) * np.exp(-t / .008)
        i = round(b * sr)
        m = min(n, len(y) - i)
        y[i:i + m] += click[:m, None]
    peak = float(np.max(abs(y)))
    if peak > .98:
        y *= .98 / peak
    out = common.PROJECT / 'out/x3'
    out.mkdir(parents=True, exist_ok=True)
    sf.write(out / 'click-check.wav', y, sr, subtype='PCM_24')
    parts, windows = [], []
    for s in audio['sections']:
        if 'chorus' not in s['name']:
            continue
        line = next(l for l in lyrics['lines'] if l['text'].startswith('I need') and l['start'] >= s['start'] - 1.)
        first, last = np.searchsorted(down, line['start'], side='right') - 1, np.searchsorted(down, line['end'])
        a, b = max(0, first - 4), min(len(down) - 1, last + 4)
        lo, hi = float(down[a]), float(down[b])
        if parts:
            parts.append(np.zeros((sr, 2), dtype=np.float32))
        parts.append(y[round(lo * sr):round(hi * sr)])
        windows.append(dict(section=s['name'], start=lo, end=hi, lyric_start=line['start'], lyric_end=line['end']))
    sf.write(out / 'click-check-hooks.wav', np.concatenate(parts), sr, subtype='PCM_24')
    dump(out / 'click-check-windows.json', windows)
    return windows


def vocal_event(y, sr, near):
    """Measure the nearest short activity run; identity cannot be inferred from RMS."""
    from signal_features import frame_rms
    from scipy.ndimage import median_filter
    from align import runs
    db = median_filter(20 * np.log10(frame_rms(y, sr, fps=200, win=round(.01 * sr)) + 1e-12), 5)
    t = np.arange(len(db)) / 200
    window = (t >= near - .5) & (t <= near + .5)
    spans = []
    for threshold in (-48, -51, -54, -57):
        candidates = [(a / 200, b / 200) for a, b in runs(window & (db > threshold)) if b - a >= 6]
        if candidates:
            a, b = min(candidates, key=lambda ab: abs((ab[0] + ab[1]) / 2 - near))
            spans.append(dict(threshold_dbfs=threshold, start=a, end=b))
    return dict(requested_near=near, threshold_spans=spans,
                confidence='low; vocal-stem activity only, may contain separation bleed')


def deliver(extra_vocal_near=None):
    from beat_tracking import stats, nearest_residual
    sr, mix, stems = load_signals()
    duration = len(mix) / sr
    lyrics = json.loads((common.DATA / 'lyrics.json').read_text())
    rhythm = json.loads((common.WORK / 'beats.json').read_text())
    audio = envelopes(sr, mix, stems, rhythm)
    beats = np.array(rhythm['beats'])
    score, hooks = phase_scores(beats, stems, sr, lyrics)
    phase = score(0, duration)
    sections = section_grid(lyrics, beats, phase['selected'], duration)
    downbeats = beats[np.arange(len(beats)) % 4 == phase['selected']]
    audio.update(beats=beats.tolist(), downbeats=downbeats.tolist(), sections=sections,
                 bpm=rhythm['bpm'], beat_period=float(np.median(np.diff(beats))),
                 notes='Source WAV timeline. Elastic beat DP, per-song stem delay, 100 fps envelopes. BPM is median only; use beats/downbeats. See analysis/X3_REPORT.md.')
    drum_times = np.sort(np.concatenate([rhythm['events'][k]['times'] for k in ('kick', 'snare_band', 'hat_band')]))
    rows = []
    for s in sections:
        mask = (beats >= s['start']) & (beats < s['end'])
        b = beats[mask]
        p = np.diff(b)
        phase_local = score(s['start'], s['end'])
        local_bpm = np.array([x['local_bpm'] for x in rhythm['per_beat']])[mask]
        rows.append(dict(**s, bpm_median=float(60 / np.median(p)),
                          bpm_p10=float(np.percentile(60 / p, 10)), bpm_p90=float(np.percentile(60 / p, 90)),
                          local_bpm_median=float(np.median(local_bpm)),
                          local_bpm_min=float(local_bpm.min()), local_bpm_max=float(local_bpm.max()),
                          residual=stats(nearest_residual(b, drum_times)), phase=phase_local,
                          phase_ambiguous=phase_local['selected'] != phase['selected'] or phase_local['confidence'] == 'low'))
    # Extra vocal spans are measured on the separated signal; ASR text is an interpretation.
    from signal_features import frame_rms
    from scipy.ndimage import median_filter
    rms = frame_rms(stems['vocals'], sr, fps=200, win=441)
    db = 20 * np.log10(rms + 1e-12)
    from align import runs
    extra = []
    outro = sections[-1]['start']
    mask = (np.arange(len(db)) / 200 >= outro) & (median_filter(db, 5) > -42)
    for a, b in runs(mask):
        if extra and a / 200 - extra[-1]['end'] < .2:
            extra[-1]['end'] = b / 200
        elif (b - a) / 200 >= .06:
            extra.append(dict(start=a / 200, end=b / 200, desc='unlisted vocal activity; -42 dBFS threshold'))
    lyrics['extras'] = extra
    report = dict(rhythm=rhythm, phase=phase, sections=rows, hook_stressed_starts=hooks, extra_vocals=extra)
    if extra_vocal_near is not None:
        report['outro_event'] = vocal_event(stems['vocals'], sr, extra_vocal_near)
        for span in report['outro_event']['threshold_spans']:
            if span['threshold_dbfs'] == -54:
                lyrics['extras'].append(dict(start=span['start'], end=span['end'],
                    desc='weak vocal-stem event near requested outro time; word identity unconfirmed'))
        lyrics['extras'].sort(key=lambda e: e['start'])
    dump(common.WORK / 'stage3.json', report)
    dump(common.DATA / 'audio.json', audio, compact=True)
    dump(common.DATA / 'lyrics.json', lyrics)
    for name in ('audio', 'lyrics'):
        shutil.copyfile(common.DATA / f'{name}.json', common.PROJECT / f'data/{name}.json')
        (common.PROJECT / f'data/{name}.approx.json').unlink(missing_ok=True)
    shutil.copyfile(common.AUDIO, common.PROJECT / 'audio/song.wav')
    report['click_windows'] = click_checks(audio, lyrics)
    dump(common.WORK / 'stage3.json', report)
    with (common.ROOT / 'X3_BEATS.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['index', 'time', 'local_bpm', 'nearest_drum_residual_ms',
                                             'drum_supported', 'downbeat', 'section'])
        writer.writeheader()
        for beat in rhythm['per_beat']:
            section = next(s['name'] for s in sections if s['start'] <= beat['time'] < s['end'])
            writer.writerow(dict(**beat, downbeat=beat['index'] % 4 == phase['selected'], section=section))
    print('Delivered data/audio.json, data/lyrics.json, audio/song.wav and out/x3/click-check*.wav', flush=True)


def main():
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    from pathlib import Path
    parser.add_argument('--stage', choices=['prepare', 'transcribe', 'beats', 'align', 'deliver', 'regression'], required=True)
    parser.add_argument('--reference-audio-json', type=Path)
    parser.add_argument('--extra-vocal-near', type=float, help='Inspect an uncertain extra vocal near this source time')
    args = parser.parse_args()
    common.configure(args)
    if args.stage == 'prepare':
        prepare()
    elif args.stage == 'transcribe':
        from whisper_run import run_pair
        run_pair()
    elif args.stage == 'beats':
        beats_stage()
    elif args.stage == 'align':
        align_stage()
    elif args.stage == 'regression':
        if args.reference_audio_json is None:
            parser.error('--reference-audio-json is required for regression')
        regression(args.reference_audio_json)
    else:
        deliver(args.extra_vocal_near)


if __name__ == '__main__':
    main()
