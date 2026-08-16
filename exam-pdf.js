const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

async function appendPdfAttachments(targetPath, questions, attachmentRoot) {
  const sourceQuestions = (Array.isArray(questions) ? questions : []).filter(
    (question) =>
      question?.attachment?.type === "application/pdf" &&
      question.attachment.fileName,
  );
  if (!sourceQuestions.length) return [];
  const target = await PDFDocument.load(fs.readFileSync(targetPath));
  const warnings = [];
  for (const question of sourceQuestions) {
    const sourcePath = path.join(
      attachmentRoot,
      path.basename(question.attachment.fileName),
    );
    try {
      const source = await PDFDocument.load(fs.readFileSync(sourcePath), {
        ignoreEncryption: false,
      });
      const pages = await target.copyPages(source, source.getPageIndices());
      pages.forEach((page) => target.addPage(page));
    } catch {
      warnings.push(
        `无法附加 PDF：${question.attachment.name || question.title}`,
      );
    }
  }
  fs.writeFileSync(targetPath, await target.save());
  return warnings;
}

module.exports = { appendPdfAttachments };
