"""X3 regressions: changing tempo, missing hits, CTC windows and interrupted caches."""
import common
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from align import coarse_anchors
from beat_tracking import track, nearest_residual
from ctcalign import align, ALPHA
from pron import pron, display_text
from stage3 import section_grid, valid_emission


class Stage3Tests(unittest.TestCase):
    def test_display_pronunciation_and_compounds(self):
        self.assertEqual(display_text('Clear the cash and count'), 'Clear the cache and count')
        self.assertEqual(pron('cache,'), ['cash'])
        self.assertEqual(pron('COMMIT!'), ['com', 'mit'])
        self.assertEqual(pron('Tap-tap-tapping,'), ['tap', 'tap', 'tapping'])
        self.assertEqual(pron('—'), [])

    def test_whisper_anchors_preserve_repeated_lines(self):
        toks = [['I', 'need', 'commit'], ['We', 'go'], ['I', 'need', 'commit']]
        text = ['I', 'need', 'commit,', 'We', 'go', 'I', 'need', 'commit.']
        transcript = dict(segments=[dict(words=[dict(word=w, start=i * 2, end=i * 2 + .5,
            probability=.9) for i, w in enumerate(text)])])
        anchors, matched = coarse_anchors(toks, [transcript])
        self.assertEqual(len(anchors), 10)
        self.assertEqual(matched[0, 2, 1]['start'], 4)
        self.assertEqual(matched[2, 2, 1]['start'], 14)
        self.assertAlmostEqual(anchors[2, 2, 1][0], 13.2)

    def test_ctc_respects_dynamic_duration_and_infeasible_windows(self):
        # A lyric after the old fixed 156.66 s boundary must still align.
        e = np.full((8100, len(ALPHA)), -20.)
        e[:, 0] = 0
        e[8020:8023, ALPHA.index('a')] = 5
        spans, _, _, _ = align(e, [['a']], anchors={(0, 0, 0): (160.3, 160.6)})
        self.assertGreater(spans[0, 0][0][0], 160)
        with self.assertRaisesRegex(ValueError, 'No feasible CTC path'):
            align(e, [['a']], anchors={(0, 0, 0): (170, 171)})

    def test_truncated_emission_is_not_a_cache_hit(self):
        with tempfile.TemporaryDirectory(dir=common.CACHE / 'tmp') as tmp:
            path = Path(tmp) / 'emission.npy'
            self.assertFalse(valid_emission(path, 20))
            path.write_bytes(b'\x93NUMPY')
            self.assertFalse(valid_emission(path, 20))
            np.save(path, np.zeros((20, 28)))
            self.assertTrue(valid_emission(path, 20))
            self.assertFalse(valid_emission(path, 21))
            np.save(path, np.full((20, 28), np.nan))
            self.assertFalse(valid_emission(path, 20))

    def test_variable_sections_use_beat_indexes_and_nominal_null_rule(self):
        beats = np.cumsum(np.r_[.1, np.linspace(.5, .43, 99)])
        config = dict(sections=[dict(name='intro', bars=2, first_line=None),
            dict(name='verse', bars=8, first_line='Hello'),
            dict(name='outro', bars=5, first_line=None)])
        lyrics = dict(lines=[dict(i=0, text='Hello', start=float(beats[7] + .05))])
        with patch.object(common, 'CONFIG', config, create=True):
            sections = section_grid(lyrics, beats, 0, 48.)
        self.assertEqual(sections[0]['start'], 0)
        self.assertAlmostEqual(sections[1]['start'], beats[8])
        self.assertAlmostEqual(sections[2]['start'], beats[40])
        self.assertEqual(sections[2]['end'], 48.)

    @staticmethod
    def pulse_train(variable):
        sr, duration = 22050, 40.
        y = np.zeros(int(sr * duration), dtype=np.float32)
        t = np.arange(int(.07 * sr)) / sr
        pulse = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 70)
        beats, current = [], .17
        while current < duration - .1:
            beats.append(current)
            if not 14 < current < 18:
                i = round(current * sr)
                y[i:i + len(pulse)] += pulse
            current += 60 / (126 + .3 * current if variable else 132)
        return y, sr, np.array(beats)

    def test_constant_clock_survives_missing_hits(self):
        y, sr, expected = self.pulse_train(False)
        actual, evidence = track(dict(drums=y), y, sr, 132)
        self.assertEqual(evidence['mode'], 'constant')
        self.assertAlmostEqual(evidence['bpm'], 132, delta=.03)
        self.assertLess(np.max(np.abs(nearest_residual(expected, actual))), .015)

    def test_accelerating_clock_is_not_forced_constant(self):
        y, sr, expected = self.pulse_train(True)
        actual, evidence = track(dict(drums=y), y, sr, 132)
        self.assertEqual(evidence['mode'], 'elastic')
        self.assertLess(np.max(np.abs(nearest_residual(expected, actual))), .025)
        bpm = [b['local_bpm'] for b in evidence['per_beat']]
        self.assertGreater(np.median(bpm[-20:]) - np.median(bpm[:20]), 6)


if __name__ == '__main__':
    unittest.main()
