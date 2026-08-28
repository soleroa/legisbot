import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
} from "docx";
import type { ReportData } from "@/app/api/report/route";

function sanitizeFilename(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "informe-legisbot"
  );
}

export function downloadReportAsPdf(report: ReportData): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function ensureSpace(lineHeight: number) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function writeParagraph(text: string, fontSize: number, style: "normal" | "bold" = "normal") {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    const lineHeight = fontSize * 1.4;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
  }

  writeParagraph(report.title, 18, "bold");
  y += 6;
  writeParagraph(
    `LegisBot Santa Fe — Informe generado el ${new Date().toLocaleDateString("es-AR")}`,
    9
  );
  y += 12;

  writeParagraph("Resumen", 13, "bold");
  y += 2;
  writeParagraph(report.summary, 11);
  y += 10;

  for (const section of report.sections) {
    y += 6;
    writeParagraph(section.heading, 13, "bold");
    y += 2;
    writeParagraph(section.content, 11);
  }

  if (report.sources.length > 0) {
    y += 14;
    writeParagraph("Fuentes", 13, "bold");
    y += 2;
    for (const source of report.sources) {
      writeParagraph(`[${source.index}] ${source.citation}`, 10);
    }
  }

  doc.save(`${sanitizeFilename(report.title)}.pdf`);
}

export async function downloadReportAsDocx(report: ReportData): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      text: report.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `LegisBot Santa Fe — Informe generado el ${new Date().toLocaleDateString("es-AR")}`,
          italics: true,
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "", spacing: { after: 200 } }),
    new Paragraph({ text: "Resumen", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: report.summary }),
  ];

  for (const section of report.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const para of section.content.split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({ text: para }));
    }
  }

  if (report.sources.length > 0) {
    children.push(new Paragraph({ text: "Fuentes", heading: HeadingLevel.HEADING_1 }));
    for (const source of report.sources) {
      const isExternal = !source.url.startsWith("legisbot://");
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${source.index}] ` }),
            isExternal
              ? new ExternalHyperlink({
                  link: source.url,
                  children: [
                    new TextRun({ text: source.citation, style: "Hyperlink" }),
                  ],
                })
              : new TextRun({ text: source.citation }),
          ],
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(report.title)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
