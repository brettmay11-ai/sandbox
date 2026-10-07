from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
WORKSHEET = ROOT / "assets" / "worksheets" / "my-cause-my-cleats-worksheet.pdf"
TEMP_DIR = ROOT / "tmp" / "pdfs"

INK = colors.HexColor("#222222")
MUTED = colors.HexColor("#666666")
GUIDE = colors.HexColor("#969696")


def draw_tongue_panel(pdf):
    # Erase the RC-04 combined top-view panel without touching the scan mark at x=750.
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(colors.white)
    pdf.rect(540, 309, 198, 142, stroke=0, fill=1)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(548, 441, "TONGUE DESIGN")

    pdf.setStrokeColor(GUIDE)
    pdf.setLineWidth(0.9)
    pdf.setFillColor(colors.white)
    tongue = pdf.beginPath()
    tongue.moveTo(563, 428)
    tongue.curveTo(553, 428, 548, 421, 548, 412)
    tongue.lineTo(550, 389)
    tongue.curveTo(551, 380, 558, 375, 568, 375)
    tongue.lineTo(717, 375)
    tongue.curveTo(728, 375, 734, 380, 736, 389)
    tongue.lineTo(736, 412)
    tongue.curveTo(736, 421, 730, 428, 720, 428)
    tongue.close()
    pdf.drawPath(tongue, stroke=1, fill=1)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawString(548, 361, "LACE COLOR - COLOR THIS STRAND")

    pdf.setStrokeColor(GUIDE)
    pdf.setLineWidth(0.9)
    pdf.setFillColor(colors.white)
    pdf.roundRect(548, 332, 188, 21, 10.5, stroke=1, fill=1)

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(548, 316, "Keep the tongue artwork and lace color in their own areas.")


def draw_footer(pdf):
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(colors.white)
    pdf.rect(32, 18, 728, 47, stroke=0, fill=1)

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica", 8.4)
    pdf.drawString(
        36,
        53,
        "Color the large side and sole. Add tongue art above, then color the lace strand. Keep the corner marks clear.",
    )

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(36, 29, "RC-05  /  SEPARATE TONGUE + LACE AREAS")
    pdf.setFont("Helvetica", 8)
    pdf.drawString(322, 29, "Print landscape at 100% / Actual size. Scan the whole page in color.")


def build_overlay():
    stream = BytesIO()
    pdf = canvas.Canvas(stream, pagesize=landscape(letter))
    draw_tongue_panel(pdf)
    draw_footer(pdf)
    pdf.save()
    stream.seek(0)
    return PdfReader(stream).pages[0]


def update_worksheet():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    source = PdfReader(str(WORKSHEET))
    if len(source.pages) != 1:
        raise ValueError("The cleat worksheet must remain a one-page PDF.")

    page = source.pages[0]
    page.merge_page(build_overlay())

    writer = PdfWriter()
    writer.add_page(page)
    writer.add_metadata(
        {
            "/Title": "My Cause My Cleats - RC-05 Rendering Worksheet",
            "/Author": "NFL Classroom Project",
            "/Subject": "Student cleat design worksheet with separate tongue and lace areas",
        }
    )

    output = TEMP_DIR / "my-cause-my-cleats-worksheet-rc05.pdf"
    with output.open("wb") as handle:
        writer.write(handle)
    output.replace(WORKSHEET)


if __name__ == "__main__":
    update_worksheet()
