"""Regression tests for failure cases, without models or reference-song answers."""
import common
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import soundfile as sf
from lyric_timing import align_lyrics, sections_from_lyrics, snap_section
from measurement import activity, envelope_metric, vocal_attack
from separate import measure_offset
from rhythm import fit_grid, bar_phase


class MeasurementTests(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(common.tokens("Tap-tap-tapping, I’m COM-MIT!"),
                         ["tap", "tap", "tapping", "im", "com", "mit"])

    def test_empty_transcription_has_no_anchors(self):
        config = dict(sections=[dict(name="verse", bars=8, first_line="We go now")], beats_per_bar=4)
        with patch.object(common, "CONFIG", config, create=True), patch.object(common, "load_lyrics_src", return_value=[(None, None, "We go now")]):
            metric, anchors, _ = align_lyrics({"segments": []})
            sections = sections_from_lyrics(anchors, dict(beat_period=.5, first_downbeat=.1), 12.)
        self.assertEqual(metric["match_rate"], 0)
        self.assertEqual([w["word"] for w in metric["unmatched_words"]], ["we", "go", "now"])
        self.assertIsNone(sections[0]["start"])

    def test_aliases_do_not_inflate_match_rate(self):
        transcript = {"segments": [{"words": [dict(word=w, start=i, end=i + .4) for i, w in enumerate(["pee", "doom"])]}]}
        with patch.object(common, "CONFIG", {"lyric_aliases": {"P(doom)": "pee doom"}}, create=True), patch.object(common, "load_lyrics_src", return_value=[(None, None, "P(doom)")]):
            metric, anchors, _ = align_lyrics(transcript)
        self.assertEqual(metric["match_rate"], 0)
        self.assertEqual(anchors[0]["start"], 0)

    def test_repeat_alignment_and_real_length_override_nominal(self):
        config = dict(sections=[dict(name="verse", bars=8, first_line="Start here"),
                               dict(name="chorus1", bars=8, first_line="We go"),
                               dict(name="bridge", bars=8, first_line="Slow down"),
                               dict(name="chorus2", bars=8, first_line="We go")], beats_per_bar=4)
        texts = ["Start here", "We go", "Slow down", "We go"]
        anchors = [dict(text=text, start=t, coverage=1., line_index=i) for i, (text, t) in enumerate(zip(texts, [0.1, 10.1, 16.1, 24.1]))]
        with patch.object(common, "CONFIG", config, create=True):
            sections = sections_from_lyrics(anchors, dict(beat_period=.5, first_downbeat=.1), 32.)
        self.assertAlmostEqual(sections[0]["measured_bars"], 5.)
        self.assertAlmostEqual(sections[1]["start"], 10.1)
        self.assertAlmostEqual(sections[3]["start"], 24.1)

    def test_pickup_rule(self):
        self.assertAlmostEqual(snap_section(1.6, .1, .5, 4), 2.1)
        self.assertAlmostEqual(snap_section(.8, .1, .5, 4), .1)

    def test_non_increasing_asr_candidate_uses_independent_alternative(self):
        config = dict(beats_per_bar=4, sections=[dict(name="intro", bars=1, first_line=None),
            dict(name="verse", bars=8, first_line="Start here")])
        anchors = [dict(text="Start here", start=.1, coverage=1., line_index=0,
            timing_candidates=[dict(start=.1, coverage=1.), dict(start=2.2, coverage=.5)])]
        with patch.object(common, "CONFIG", config, create=True):
            rows = sections_from_lyrics(anchors, dict(beat_period=.5, first_downbeat=0.), 10.)
        self.assertEqual(rows[1]["start"], 2.)

    def test_signed_delay(self):
        rng = np.random.default_rng(42)
        mix = rng.normal(0, .1, 16000).astype("float32")
        with tempfile.TemporaryDirectory(dir=common.CACHE / "tmp") as tmp:
            path = Path(tmp)
            for delay in (-37, 53):
                shifted = np.pad(mix, (max(0, delay), max(0, -delay)))[max(0, -delay):][:len(mix)]
                for stem in common.STEM_NAMES:
                    sf.write(path / f"{stem}.wav", shifted / 4, 8000, subtype="FLOAT")
                with patch.object(common, "STEMS", path, create=True), patch.object(common, "WORK", path, create=True), patch.object(common, "load_mix", return_value=(mix, 8000)):
                    result = measure_offset()
                    self.assertEqual(result["offset_samples"], delay)
                    y, _ = common.load_stem("vocals")
                if delay > 0:
                    np.testing.assert_allclose(y, mix[:-delay] / 4, atol=1e-7)
                else:
                    np.testing.assert_allclose(y[-delay:len(mix)], mix[-delay:] / 4, atol=1e-7)

    def test_advisory_thresholds_and_missing_window(self):
        e = np.ones(1000)
        e[100:200] = .01
        self.assertEqual(activity(envelope_metric(e, 1, 2)), "absent")
        self.assertEqual(activity(envelope_metric(e, 3, 4)), "present")
        self.assertEqual(activity(envelope_metric(e, None, None)), "uncertain")

    def test_silent_hook_is_unresolved(self):
        result = vocal_attack(np.zeros(16000), 16000, dict(start=.2, end=.5, probability=1.), 2)
        self.assertIsNone(result["onset"])

    def test_four_on_floor_grid_uses_measured_tempo(self):
        sr, bpm, duration = 22050, 118., 30.
        y = np.zeros(int(sr * duration), dtype=np.float32)
        pulse_t = np.arange(int(.07 * sr)) / sr
        pulse = np.sin(2 * np.pi * 90 * pulse_t) * np.exp(-pulse_t * 70)
        for t in np.arange(.17, duration - .1, 60 / bpm):
            i = int(t * sr)
            y[i:i + len(pulse)] += pulse
        grid = fit_grid(y, y, sr, 132.)
        self.assertAlmostEqual(grid["bpm"], bpm, delta=.03)
        self.assertLess(grid["stability"]["max_phase_deviation_ms"], 3.)
        # Identical quarter-note kicks alone cannot establish the bar phase.
        config = dict(beats_per_bar=4, sections=[])
        stems = dict(drums=y, other=np.zeros_like(y), bass=np.zeros_like(y))
        with patch.object(common, "CONFIG", config, create=True):
            phase = bar_phase(stems, sr, grid, [])
        self.assertEqual(phase["bar_phase"]["confidence"], "low")


if __name__ == "__main__":
    unittest.main()
