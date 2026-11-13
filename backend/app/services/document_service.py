"""Local CV text extraction. Files are parsed in memory; nothing is stored or executed."""
import io
import zipfile

from ..config import MAX_DOC_BYTES


class DocumentError(Exception):
    pass


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_DOC_BYTES:
        raise DocumentError("File is too large (limit 5 MB).")
    if not data:
        raise DocumentError("The file is empty.")
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        if not data.startswith(b"%PDF"):
            raise DocumentError("This does not look like a valid PDF file.")
        return _pdf(data)
    if name.endswith(".docx"):
        if not zipfile.is_zipfile(io.BytesIO(data)):
            raise DocumentError("This does not look like a valid DOCX file.")
        return _docx(data)
    if name.endswith(".txt"):
        return data.decode("utf-8", errors="replace").strip()
    raise DocumentError("Unsupported file type. Use PDF, DOCX or TXT.")


def _pdf(data: bytes) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise DocumentError("Encrypted PDFs are not supported.")
        text = "\n".join((p.extract_text() or "") for p in reader.pages[:30]).strip()
    except DocumentError:
        raise
    except Exception:
        raise DocumentError("Could not read this PDF. It may be corrupted.")
    if not text:
        raise DocumentError("No text found. Scanned PDFs need OCR; try the Screenshot tool or paste the text.")
    return text


def _docx(data: bytes) -> str:
    import docx
    try:
        d = docx.Document(io.BytesIO(data))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                parts.append(" | ".join(cell.text for cell in row.cells))
        text = "\n".join(parts).strip()
    except Exception:
        raise DocumentError("Could not read this DOCX file. It may be corrupted.")
    if not text:
        raise DocumentError("No text found in this document.")
    return text
