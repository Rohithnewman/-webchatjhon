"""Regression test for the module-identity bug in `python -m app.worker`.

`backend/app/worker.py` is executed as `__main__` when launched with
`python -m app.worker`. It imports `app.slices.knowledge.worker`, which does
`from app.worker import register` — that import resolves to a *second*
module object (`app.worker`, distinct from `__main__`), so `@register(...)`
fills `app.worker.HANDLERS` while the running loop reads `__main__.HANDLERS`,
which stays empty. This test runs the real entry point in a subprocess (so it
actually exercises `__main__`, not just an import) and asserts the
`ingest_document` handler shows up.
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_worker_entrypoint_registers_ingest_document_handler():
    output = subprocess.check_output(
        [sys.executable, "-m", "app.worker", "--list-handlers"],
        cwd=BACKEND_ROOT,
        env={**os.environ, "PYTHONPATH": str(BACKEND_ROOT)},
        text=True,
    )
    assert "ingest_document" in output
