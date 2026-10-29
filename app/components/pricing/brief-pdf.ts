import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { buildBrief, money, investmentLabel, services, type BriefModel } from "./catalog";

// Exact path from the existing Wordmark component. Keep geometry and stroke unchanged.
export const wordmarkPath = "M1 3v18M16 3v18M1 12h15M31 21 39 3l8 18M62 3v18h14M105 3H91v18h14M91 12h12M120 21V3l15 18V3M150 21V3l15 18V3";
export type BriefAssets = { regular: Uint8Array; medium: Uint8Array; silk: Uint8Array };
const width = 595.28, height = 841.89, margin = 48, contentWidth = width - margin * 2;
const dark = rgb(8 / 255, 11 / 255, 16 / 255);
const ink = rgb(20 / 255, 34 / 255, 47 / 255);
const muted = rgb(76 / 255, 94 / 255, 109 / 255);
const blue = rgb(220 / 255, 235 / 255, 248 / 255);
const pale = rgb(247 / 255, 249 / 255, 251 / 255);

export async function createBriefPdf(brief: BriefModel, assets: BriefAssets, date = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(assets.regular, { subset: true });
  const medium = await pdf.embedFont(assets.medium, { subset: true });
  const silk = await pdf.embedPng(assets.silk);
  pdf.setTitle(`Halenn | ${brief.projectName} project brief`);
  pdf.setAuthor("Halenn, a company by Aevell");
  pdf.setSubject("Indicative starting estimate for discussion. Excluding VAT.");
  pdf.setCreator("Halenn project builder");
  pdf.setLanguage("en-GB");
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);
  const mail = `mailto:contact@halenn.com?subject=${encodeURIComponent("My project with Halenn")}&body=${encodeURIComponent(`I'd like to discuss this project.\n\n${buildBrief(brief.selection, brief.customNotes)}`)}`;
  const text = (page: PDFPage, value: string, x: number, top: number, size: number, color = ink, font = regular) =>
    page.drawText(value, { x, y: height - top - size, size, font, color });
  const line = (page: PDFPage, top: number, color = rgb(0.81, 0.85, 0.88)) =>
    page.drawLine({ start: { x: margin, y: height - top }, end: { x: width - margin, y: height - top }, thickness: 0.6, color });
  const wrap = (value: string, size: number, max = contentWidth, font: PDFFont = regular) => {
    const lines: string[] = [];
    let current = "";
    for (const word of value.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) { current = next; continue; }
      if (current) { lines.push(current); current = ""; }
      // A pasted URL or unbroken custom note must wrap inside the page margins.
      for (const char of word) {
        if (current && font.widthOfTextAtSize(current + char, size) > max) { lines.push(current); current = ""; }
        current += char;
      }
    }
    if (current) lines.push(current);
    return lines;
  };
  const paragraph = (page: PDFPage, value: string, top: number, size = 10.5, color = muted, max = contentWidth, x = margin) => {
    const lines = wrap(value, size, max);
    lines.forEach((value, i) => text(page, value, x, top + i * size * 1.5, size, color));
    return top + lines.length * size * 1.5;
  };
  const logo = (page: PDFPage, top: number, color = ink) => {
    page.drawSvgPath(wordmarkPath, { x: margin, y: height - top, scale: 0.86, borderWidth: 1.6, borderColor: color });
    text(page, "A company by Aevell", margin, top + 29, 9, color);
  };
  const link = (page: PDFPage, label: string, uri: string, x: number, top: number, color: ReturnType<typeof rgb>, filled = false) => {
    const size = 11;
    const labelWidth = medium.widthOfTextAtSize(label, size);
    const w = labelWidth + (filled ? 44 : 0);
    if (filled) {
      // A pill drawn from native PDF shapes retains crisp edges at any zoom.
      page.drawRectangle({ x: x + 20, y: height - top - 40, width: w - 40, height: 40, color: blue });
      page.drawEllipse({ x: x + 20, y: height - top - 20, xScale: 20, yScale: 20, color: blue });
      page.drawEllipse({ x: x + w - 20, y: height - top - 20, xScale: 20, yScale: 20, color: blue });
    }
    text(page, label, x + (filled ? 22 : 0), top + (filled ? 12 : 0), size, color, medium);
    const ref = pdf.context.register(pdf.context.obj({
      Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"),
      Rect: [x, height - top - (filled ? 40 : 18), x + w, height - top],
      Border: [0, 0, 0], A: { Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(uri) },
    }));
    page.node.addAnnot(ref);
  };

  const cover = pdf.addPage([width, height]);
  cover.drawRectangle({ x: 0, y: 0, width, height, color: dark });
  cover.drawImage(silk, { x: -100, y: 0, width: 820, height, opacity: 0.15 });
  logo(cover, 48, blue);
  text(cover, "Your project,", margin, 178, 44, pale);
  text(cover, "taking shape.", margin, 230, 44, pale);
  text(cover, `${brief.projectName} / Project brief`, margin, 306, 17, blue);
  text(cover, new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(date), margin, 337, 10, rgb(0.66, 0.72, 0.78));
  line(cover, 409, rgb(0.22, 0.29, 0.35));
  text(cover, "One-time starting investment", margin, 433, 12, blue);
  text(cover, investmentLabel(brief), margin, 458, 40, pale);
  text(cover, brief.quoteRequired ? brief.oneTime ? "Plus custom work, quoted separately. Excluding VAT." : "Scope and price to be agreed. Excluding VAT." : "Excluding VAT. Final scope agreed together.", margin, 516, 10, blue);
  text(cover, "Optional monthly care", margin, 560, 12, blue);
  paragraph(cover, brief.monthlyLines.length ? `${money(brief.monthly)} / month · ${brief.monthlyLines.map(line => line.name).join(" + ")}` : brief.selection.services.includes("automation") ? "No care selected. Automation support quoted separately." : "No care plan selected", 586, 16, pale);
  link(cover, "Discuss this project", mail, margin, 665, ink, true);
  link(cover, "Visit Halenn", "https://halenn.com", 260, 678, blue);
  text(cover, "contact@halenn.com", margin, 720, 11, blue);
  text(cover, "Indicative starting estimate. Prepared for discussion, not a quote.", margin, 762, 9, rgb(0.66, 0.72, 0.78));

  let page: PDFPage;
  let y = 0;
  const nextPage = () => {
    page = pdf.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width, height, color: pale });
    logo(page, 42);
    text(page, brief.projectName, width - margin - regular.widthOfTextAtSize(brief.projectName, 10), 48, 10, muted);
    y = 119;
    if (pdf.getPageCount() > 2) {
      text(page, "Project details, continued.", margin, y, 27);
      y += 50;
    }
  };
  const room = (needed: number) => { if (y + needed > 775) nextPage(); };
  nextPage();
  text(page!, "Your scope, clearly set out.", margin, y, 27);
  y += 47;
  text(page!, "One-time work", margin, y, 12, muted, medium);
  y += 27;
  let lastService = "";
  for (const item of brief.lines) {
    const description = item.scope.join(". ") + ".";
    const lines = wrap(description, 10.5, contentWidth - 125);
    const startsService = brief.selection.services.length > 1 && lastService !== item.service;
    room(40 + lines.length * 15.75 + (startsService ? 34 : 0));
    if (startsService) {
      text(page!, services[item.service].name, margin, y, 16, ink, medium);
      y += 34;
      lastService = item.service;
    }
    line(page!, y - 7);
    text(page!, item.name, margin, y + 5, 12, ink, medium);
    const price = item.price === null ? "Quote required" : money(item.price);
    text(page!, price, width - margin - medium.widthOfTextAtSize(price, 12), y + 5, 12, ink, medium);
    y = paragraph(page!, description, y + 27, 10.5, muted, contentWidth - 125) + 19;
  }
  room(90);
  line(page!, y);
  text(page!, "Known one-time starting investment", margin, y + 17, 11, ink, medium);
  const total = brief.oneTime ? money(brief.oneTime) : "Quote required";
  text(page!, total, width - margin - medium.widthOfTextAtSize(total, 20), y + 10, 20, ink, medium);
  y += 49;
  for (const note of brief.notes.filter((note) => !note.startsWith("Ongoing automation"))) {
    room(wrap(note, 10).length * 15 + 8);
    y = paragraph(page!, note, y, 10) + 8;
  }
  for (const [key, note] of Object.entries(brief.customNotes)) {
    if (!note) continue;
    room(30 + wrap(note, 10.5).length * 15.75 + 18);
    text(page!, `Your ${key === "web" ? "web" : "automation"} requirements`, margin, y + 4, 14, ink, medium);
    y = paragraph(page!, note, y + 30) + 18;
  }
  const careTexts = brief.monthlyLines.length
    ? brief.monthlyLines.map(item => `${item.name}: ${money(item.price ?? 0)} per month. ${item.scope.join(". ")}.`)
    : ["No monthly care selected. Third-party services still need to be arranged separately."];
  room(45 + wrap(careTexts[0], 10.5).length * 15.75);
  text(page!, "Ongoing care", margin, y + 7, 15, ink, medium);
  y += 33;
  for (const careText of careTexts) {
    room(wrap(careText, 10.5).length * 15.75 + 12);
    y = paragraph(page!, careText, y) + 12;
  }
  if (brief.monthlyLines.length > 1) {
    room(35); y = paragraph(page!, `Total optional care: ${money(brief.monthly)} per month.`, y, 11, ink) + 12;
  }
  y += 13;
  room(49 + wrap(brief.exclusions, 10.5).length * 15.75 + wrap(`${brief.disclaimer} ${brief.proposalTerms}`, 10).length * 15);
  text(page!, "Before we begin", margin, y, 15, ink, medium);
  y = paragraph(page!, brief.exclusions, y + 27) + 10;
  y = paragraph(page!, `${brief.disclaimer} ${brief.proposalTerms}`, y, 10) + 22;
  room(25 + wrap("Share what you have in mind. We will discuss the requirements and prepare a proposal with you.", 10.5).length * 15.75 + 55);
  text(page!, "The next step is a conversation.", margin, y, 14);
  y = paragraph(page!, "Share what you have in mind. We will discuss the requirements and prepare a proposal with you.", y + 25) + 15;
  link(page!, "Discuss this project", mail, margin, y, ink, true);
  link(page!, "Visit Halenn", "https://halenn.com", 260, y + 12, ink);
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    const color = index === 0 ? blue : muted;
    text(item, "HALENN  /  Project brief", margin, 805, 8.5, color);
    text(item, `${index + 1} / ${pages.length}`, width - margin - 22, 805, 8.5, color);
  });
  return pdf.save();
}

async function asset(path: string) {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Brief asset unavailable");
  return new Uint8Array(await response.arrayBuffer());
}
export async function downloadBriefPdf(brief: BriefModel) {
  const [regular, medium, silk] = await Promise.all([
    asset("/brand/pricing-fonts/Geist-Regular.ttf"),
    asset("/brand/pricing-fonts/Geist-Medium.ttf"),
    asset("/brand/halenn-silk-v1.png"),
  ]);
  const bytes = await createBriefPdf(brief, { regular, medium, silk });
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "halenn-project-brief.pdf";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
