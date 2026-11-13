"""OCR for user-selected images. Images are processed in memory and never written to disk."""
import io

from ..config import MAX_IMAGE_BYTES


class ScreenError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def _prepare(img):
    """Make a screenshot easier for Tesseract: grayscale, light-on-dark inversion, upscale small captures, contrast."""
    from PIL import ImageOps, ImageStat

    gray = img.convert("L")
    # Tesseract is much weaker on light text over a dark background (dark-mode apps, video call UIs).
    if ImageStat.Stat(gray).mean[0] < 110:
        gray = ImageOps.invert(gray)
    if gray.width < 1400:
        factor = min(2.0, 1400 / max(gray.width, 1))
        gray = gray.resize((int(gray.width * factor), int(gray.height * factor)))
    return ImageOps.autocontrast(gray)


def ocr_image(data: bytes) -> str:
    if not data:
        raise ScreenError("The image is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ScreenError("Image is too large (limit 10 MB).")
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise ScreenError("This file is not a readable image (PNG, JPG, WEBP or BMP).")
    try:
        import pytesseract
        text = pytesseract.image_to_string(_prepare(img), timeout=25)
    except ImportError:
        raise ScreenError("pytesseract is not installed. Run: pip install pytesseract", 503)
    except Exception as e:
        if e.__class__.__name__ == "TesseractNotFoundError":
            raise ScreenError(
                "Tesseract OCR is not installed or not on PATH. Install it (Windows: "
                "https://github.com/UB-Mannheim/tesseract/wiki, Linux: apt install tesseract-ocr, macOS: brew install tesseract) "
                "and restart the backend.", 503)
        if isinstance(e, RuntimeError) and "timeout" in str(e).lower():
            raise ScreenError("OCR took too long on this image.", 504)
        raise ScreenError("OCR failed on this image.", 500)
    return text.strip()
