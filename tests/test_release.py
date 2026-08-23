import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).parents[1]


class ReleaseTests(unittest.TestCase):
    def test_xpi_and_update_manifest(self):
        xpi = Path(subprocess.check_output([ROOT / "scripts/build-xpi"], text=True).strip())
        with zipfile.ZipFile(xpi) as archive:
            self.assertEqual(set(archive.namelist()), {"manifest.json", "bootstrap.js", "LICENSE"})
            manifest = json.loads(archive.read("manifest.json"))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "updates.json"
            subprocess.run([ROOT / "scripts/zotero-update-manifest.py", "--xpi", xpi,
                "--url", f"https://example.invalid/{xpi.name}", "--output", output], check=True)
            update = json.loads(output.read_text())["addons"][manifest["applications"]["zotero"]["id"]]["updates"][0]
        self.assertEqual(update["version"], manifest["version"])
        self.assertEqual(update["update_hash"], "sha256:" + hashlib.sha256(xpi.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
