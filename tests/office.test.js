import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { unzip, pptxPages, epubPages } from "../server/office.js";
import { validateUpload } from "../server/ingestion.js";

/** A ZIP archive of `files` (name -> text), deflated, with no checksums. */
function zip(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text),
      data = deflateRawSync(raw),
      label = Buffer.from(name),
      head = Buffer.alloc(30),
      entry = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(label.length, 26);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(label.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, label, data);
    central.push(entry, label);
    offset += 30 + label.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const slide = (...lines) =>
  `<p:sld><p:txBody>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`;

test("a PowerPoint file gives one page of text per slide, in slide order", () => {
  const deck = zip({
    "ppt/slides/slide10.xml": slide("Last slide"),
    "ppt/slides/slide2.xml": slide("Mitochondria", "Energy &amp; ATP"),
    "ppt/slides/slide1.xml": slide("Cells"),
    "ppt/slides/_rels/slide1.xml.rels": "<Relationships/>",
    "ppt/media/image1.png": "not text",
  });
  assert.deepEqual(pptxPages(deck), [
    { page: 1, text: "Cells" },
    { page: 2, text: "Mitochondria\nEnergy & ATP" },
    { page: 10, text: "Last slide" },
  ]);
  assert.equal(validateUpload("lesson.pptx", deck), "pptx");
});

test("an EPUB gives its chapters in reading order, without markup", () => {
  const book = zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml":
      '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    "OEBPS/content.opf":
      '<package><manifest><item id="b" href="text/two.xhtml"/><item id="a" href="one.xhtml"/><item id="css" href="s.css"/><item id="bad" href="%zz.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="bad"/><itemref idref="b"/></spine></package>',
    "OEBPS/one.xhtml":
      "<html><head><title>x</title><style>p{color:red}</style></head><body><h1>Chapter 1</h1><p>Cells are <b>small</b>.</p></body></html>",
    "OEBPS/text/two.xhtml":
      "<html><body><p>Caf&#233; &amp; ATP</p><script>alert(1)</script></body></html>",
  });
  assert.deepEqual(epubPages(book), [
    { page: null, text: "Chapter 1\nCells are small." },
    { page: null, text: "Café & ATP" },
  ]);
  assert.equal(validateUpload("book.epub", book), "epub");
});

test("archives that are broken or expand too far are refused", () => {
  assert.throws(() => unzip(Buffer.from("PK not an archive at all......")));
  assert.throws(() => validateUpload("fake.pptx", Buffer.from("plain text")));
  const bomb = zip({ "ppt/slides/slide1.xml": slide("x".repeat(5000)) });
  assert.throws(() => pptxPages(bomb, { maxBytes: 1000 }), /too large/);
  assert.throws(() => pptxPages(zip({ "readme.txt": "hi" })), /no slides/i);
});
