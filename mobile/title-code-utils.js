(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ShitiTitleCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_BOOKS = Object.freeze(
    ["1000a", "1000b", "1000c", "1000d", "1000e", "1000f"].map(
      (code) => Object.freeze({ code, name: "" }),
    ),
  );

  function cleanBookCode(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function cleanBookName(value) {
    return String(value ?? "").trim().slice(0, 40);
  }

  function normalizeBooks(raw) {
    const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_BOOKS;
    const seen = new Set();
    return source
      .map((item) => ({
        code: cleanBookCode(typeof item === "string" ? item : item?.code),
        name: cleanBookName(typeof item === "string" ? "" : item?.name),
      }))
      .filter((item) => {
        if (!item.code || seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
      });
  }

  function validateInteger(value, label) {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text))
      throw new Error(`${label}只能填写 0 或正整数`);
    return text;
  }

  function cleanNote(value) {
    let text = String(value ?? "").trim();
    while (text.startsWith("(") && text.endsWith(")"))
      text = text.slice(1, -1).trim();
    return text;
  }

  function buildQuestionTitle({ bookCode, chapter, question, note } = {}) {
    const code = cleanBookCode(bookCode);
    if (!code) throw new Error("请选择书籍");
    const base = `${code}-${validateInteger(chapter, "章节号")}-${validateInteger(question, "题号")}`;
    const suffix = cleanNote(note);
    return suffix ? `${base}(${suffix})` : base;
  }

  function parseQuestionTitle(value) {
    const match = String(value ?? "")
      .trim()
      .match(/^([a-z0-9._]+)-(\d+)-(\d+)(?:\((.*)\))?$/i);
    if (!match) return null;
    return {
      bookCode: cleanBookCode(match[1]),
      chapter: match[2],
      question: match[3],
      note: match[4] || "",
    };
  }

  function addBook(books, candidate) {
    const list = normalizeBooks(books);
    const book = {
      code: cleanBookCode(candidate?.code),
      name: cleanBookName(candidate?.name),
    };
    if (!book.code) throw new Error("请填写书籍代号");
    if (!/^[a-z0-9._]+$/.test(book.code))
      throw new Error("书籍代号只能使用字母、数字、点或下划线");
    if (list.some((item) => item.code === book.code))
      throw new Error("这个书籍代号已经存在");
    return [...list, book];
  }

  return {
    DEFAULT_BOOKS,
    cleanBookCode,
    cleanNote,
    normalizeBooks,
    buildQuestionTitle,
    parseQuestionTitle,
    addBook,
  };
});
