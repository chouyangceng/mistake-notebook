const assert = require("node:assert/strict");
const {
  DEFAULT_BOOKS,
  addBook,
  buildQuestionTitle,
  normalizeBooks,
  parseQuestionTitle,
  updateBook,
} = require("../mobile/title-code-utils");

assert.equal(
  buildQuestionTitle({
    bookCode: "1000A",
    chapter: "0",
    question: "12",
    note: "xxxx-xx-xx",
  }),
  "1000a-0-12(xxxx-xx-xx)",
);
assert.equal(
  buildQuestionTitle({
    bookCode: "1000b",
    chapter: 3,
    question: 7,
    note: "((二刷))",
  }),
  "1000b-3-7(二刷)",
);
assert.equal(
  buildQuestionTitle({ bookCode: "1000a", chapter: 0, question: 12 }),
  "1000a-0-12",
);
assert.throws(
  () =>
    buildQuestionTitle({
      bookCode: "1000a",
      chapter: "1.2",
      question: "3",
    }),
  /章节号只能/,
);
assert.throws(
  () =>
    buildQuestionTitle({ bookCode: "1000a", chapter: "1", question: "-2" }),
  /题号只能/,
);

const books = addBook(DEFAULT_BOOKS, { code: "BOOK_1", name: "高数习题册" });
assert.deepEqual(books.at(-1), { code: "book_1", name: "高数习题册" });
assert.throws(() => addBook(books, { code: "book_1" }), /已经存在/);
assert.equal(normalizeBooks([{ code: "1000a" }, { code: "1000A" }]).length, 1);
assert.deepEqual(parseQuestionTitle("1000a-0-12(xxxx-xx-xx)"), {
  bookCode: "1000a",
  chapter: "0",
  question: "12",
  note: "xxxx-xx-xx",
});
assert.equal(parseQuestionTitle("普通自定义标题"), null);
const updatedBooks = updateBook(books, "book_1", {
  code: "BOOK_2",
  name: "线性代数讲义",
});
assert.deepEqual(updatedBooks.at(-1), {
  code: "book_2",
  name: "线性代数讲义",
});
assert.throws(
  () => updateBook(updatedBooks, "book_2", { code: "1000a" }),
  /已经存在/,
);

console.log("title-code-utils tests passed");
