import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { chunkText } from "./retrieval.js";

try {
  const buffer = await readFile(workerData.path);
  let pages = [];
  if (workerData.format === "pdf") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const document = await loadingTask.promise;
    if (document.numPages > 500)
      throw new Error(
        "PDFs are limited to 500 pages. Split the document first.",
      );
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      pages.push({ page, text });
    }
    await loadingTask.destroy();
  } else if (workerData.format === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    pages = [{ page: null, text: result.value }];
  } else if (workerData.format === "pptx" || workerData.format === "epub") {
    const { pptxPages, epubPages } = await import("./office.js");
    pages = (workerData.format === "pptx" ? pptxPages : epubPages)(buffer);
  } else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (text.includes("\0"))
      throw new Error("This file is binary, not UTF-8 text.");
    pages = [{ page: null, text }];
  }
  const chunks = pages.flatMap((p) =>
    chunkText(p.text).map((text) => ({ page: p.page, text })),
  );
  if (!chunks.length)
    throw new Error(
      "No readable text found. Scanned PDFs need OCR before import.",
    );
  if (chunks.length > 5000)
    throw new Error(
      "Document exceeds the 5,000-chunk limit. Split it into smaller files.",
    );
  parentPort.postMessage({ chunks });
} catch (error) {
  parentPort.postMessage({
    error: error.message || "Document parsing failed.",
  });
}
