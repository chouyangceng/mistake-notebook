const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { appendPdfAttachments } = require("../exam-pdf");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shiti-exam-pdf-"));
  try {
    const targetPath = path.join(root, "target.pdf");
    const sourcePath = path.join(root, "source.pdf");
    const brokenPath = path.join(root, "broken.pdf");
    const target = await PDFDocument.create();
    target.addPage([595, 842]);
    fs.writeFileSync(targetPath, await target.save());
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    source.addPage([595, 842]);
    fs.writeFileSync(sourcePath, await source.save());
    fs.writeFileSync(brokenPath, "not a pdf");
    const warnings = await appendPdfAttachments(
      targetPath,
      [
        {
          title: "有效 PDF",
          attachment: {
            type: "application/pdf",
            fileName: "source.pdf",
            name: "两页原题.pdf",
          },
        },
        {
          title: "损坏 PDF",
          attachment: {
            type: "application/pdf",
            fileName: "broken.pdf",
            name: "损坏.pdf",
          },
        },
      ],
      root,
    );
    const result = await PDFDocument.load(fs.readFileSync(targetPath));
    assert.equal(result.getPageCount(), 3);
    assert.deepEqual(warnings, ["无法附加 PDF：损坏.pdf"]);
    console.log("exam-pdf tests passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
