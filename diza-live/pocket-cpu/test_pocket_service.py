"""No-model-download contract tests for the isolated Pocket CPU worker."""
import importlib.util
import os
from pathlib import Path
import unittest

import numpy as np
from fastapi.testclient import TestClient

os.environ["POCKET_VOICE_TOKEN"] = "unit-test-only-token-1234567890123456"

spec = importlib.util.spec_from_file_location(
    "pocket_voice_worker", Path(__file__).with_name("pocket_service.py")
)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FakeAudio:
    def __init__(self, audio):
        self.audio = audio
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return self.audio


class FakeModel:
    sample_rate = 24000
    def __init__(self, invalid=False): self.invalid = invalid
    def generate_audio(self, state, text):
        assert state == "fake-approved-female"
        assert text
        audio = np.zeros(24000, dtype=np.float32)
        if self.invalid:
            audio[10] = np.nan
        return FakeAudio(audio)


class PocketContractTests(unittest.TestCase):
    def setUp(self):
        worker.MODEL = FakeModel()
        worker.VOICE_STATE = "fake-approved-female"
        self.client = TestClient(worker.app)
        self.token = "Bearer " + worker.VOICE_TOKEN
    def tearDown(self):
        worker.MODEL = None
        worker.VOICE_STATE = None
        self.client.close()
    def post(self, text="Halo, ini Diza.", token=None, **kw):
        body = {"text": text, "language": "id", "voice": "female", **kw}
        auth = token if token is not None else self.token
        return self.client.post("/v1/tts", json=body, headers={"Authorization": auth})
    def test_valid_authenticated_wav_response(self):
        r = self.post()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "audio/wav")
        self.assertEqual(r.headers["cache-control"], "no-store")
        self.assertEqual(r.content[:4], b"RIFF")
        self.assertEqual(r.content[8:12], b"WAVE")
    def test_auth_is_mandatory(self):
        self.assertEqual(self.post(token="Bearer invalid").status_code, 401)
        self.assertEqual(self.client.post("/v1/tts", json={"text":"Halo"}).status_code, 401)
    def test_only_indonesian_female(self):
        self.assertEqual(self.post(language="en").status_code, 422)
        self.assertEqual(self.post(voice="male").status_code, 422)
    def test_empty_overlong_or_invalid_audio_rejected(self):
        self.assertEqual(self.post(text=" ").status_code, 422)
        self.assertEqual(self.post(text="a"*1201).status_code, 422)
        worker.MODEL = FakeModel(invalid=True)
        self.assertEqual(self.post().status_code, 503)
    def test_not_ready_and_health(self):
        self.assertEqual(self.client.get("/health").json()["ready"], True)
        worker.MODEL = None
        self.assertEqual(self.client.get("/health").json()["ready"], False)
        self.assertEqual(self.post().status_code, 503)

if __name__ == "__main__":
    unittest.main()
