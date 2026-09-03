import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).parents[1]
CHECKER = ROOT / "scripts/check-zotero-contract"


class ContractTests(unittest.TestCase):
    def fixture(self, directory: str, version: str, *, audio: bool = True) -> Path:
        root = Path(directory) / "zotero"
        app = root / "app"
        app.mkdir(parents=True)
        (app / "application.ini").write_text(f"[App]\nVersion={version}\n", encoding="utf-8")
        api = "async getReadAloudVoices() {}\n"
        if audio:
            api += "async getReadAloudAudio(segment, voiceID) {}\n"
        reader = """_getReadAloudRemoteInterface(win) {
          client.getReadAloudVoices();
          client.getReadAloudAudio(segment, voice.id);
        }
        """
        with zipfile.ZipFile(app / "omni.ja", "w") as archive:
            archive.writestr("chrome/content/zotero/xpcom/sync/syncAPIClient.js", api)
            archive.writestr("chrome/content/zotero/xpcom/reader.js", reader)
        return root

    def run_checker(self, root: Path):
        return subprocess.run([CHECKER, root, "--json"], text=True, capture_output=True)

    def test_accepts_zotero_9_and_10_contracts(self):
        for version in ("9.0.4", "10.0.1"):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as directory:
                result = self.run_checker(self.fixture(directory, version))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(json.loads(result.stdout)["compatible"])

    def test_rejects_future_version(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_checker(self.fixture(directory, "11.0"))
            self.assertEqual(result.returncode, 1)
            self.assertFalse(json.loads(result.stdout)["supportedVersion"])

    def test_rejects_missing_api_method(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_checker(self.fixture(directory, "10.0.1", audio=False))
            self.assertEqual(result.returncode, 1)
            self.assertFalse(json.loads(result.stdout)["checks"]["getReadAloudAudio"])


if __name__ == "__main__":
    unittest.main()
