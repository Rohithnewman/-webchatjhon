"""Turn an uploaded file into plain text for chunking.

Dispatch is by file extension first (the browser's content type for a
drag-and-drop upload is often application/octet-stream), then by content
type. Anything unknown is read as UTF-8 text with replacement, which is
what the worker did for every file before this module existed.
"""

import re
from pathlib import Path

_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]+")


def _pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path), strict=False)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _docx(path: Path) -> str:
    import docx

    return "\n".join(paragraph.text for paragraph in docx.Document(str(path)).paragraphs)


def _html(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="replace")
    return _WS.sub(" ", _TAG.sub(" ", raw)).strip()


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_text(path: Path, content_type: str = "") -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf" or content_type == "application/pdf":
        return _pdf(path)
    if suffix == ".docx" or content_type == _DOCX_TYPE:
        return _docx(path)
    if suffix in (".html", ".htm") or content_type == "text/html":
        return _html(path)
    return _text(path)
