import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_slice_import_contracts_hold():
    executable = Path(sys.executable).with_name("lint-imports.exe")
    result = subprocess.run(
        [str(executable)],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
