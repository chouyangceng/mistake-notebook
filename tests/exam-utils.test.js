const assert = require("node:assert/strict");
const { normalizeQuotas, selectExamQuestions } = require("../exam-utils");

assert.deepEqual(
  normalizeQuotas([
    { subject: "数学", knowledge: "高数", questionType: "选择题", count: 2 },
    { subject: "数学", knowledge: "高数", questionType: "选择题", count: 1 },
    { subject: "数学", knowledge: "高数", questionType: "大题", count: 1 },
  ]),
  [
    { subject: "数学", knowledge: "高数", questionType: "选择题", count: 3 },
    { subject: "数学", knowledge: "高数", questionType: "大题", count: 1 },
  ],
);

const questions = [
  {
    id: "c1",
    subject: "数学",
    knowledgePath: ["高数", "极限"],
    questionType: "选择题",
  },
  {
    id: "c2",
    subject: "数学",
    knowledgePath: ["高数", "导数"],
    questionType: "选择题",
  },
  {
    id: "p1",
    subject: "数学",
    knowledgePath: ["高数"],
    questionType: "证明题",
  },
  {
    id: "l1",
    subject: "数学",
    knowledgePath: ["线性代数"],
    questionType: "选择题",
  },
  {
    id: "e1",
    subject: "英语",
    knowledgePath: ["阅读"],
    questionType: "不区分题型",
  },
  {
    id: "deleted",
    subject: "数学",
    knowledgePath: ["高数"],
    questionType: "选择题",
    deletedAt: "2026-08-12",
  },
];
let result = selectExamQuestions({
  questions,
  quotas: [
    { subject: "数学", knowledge: "高数", questionType: "选择题", count: 2 },
    { subject: "数学", knowledge: "高数", questionType: "证明题", count: 1 },
  ],
  history: [],
});
assert.deepEqual(result.selected.map((x) => x.id).sort(), ["c1", "c2", "p1"]);
assert.equal(result.missing.length, 0);

result = selectExamQuestions({
  questions,
  quotas: [
    { subject: "数学", knowledge: "高数", questionType: "填空题", count: 2 },
  ],
  history: [],
});
assert.equal(result.selected.length, 0);
assert.deepEqual(result.missing, [
  {
    subject: "数学",
    knowledge: "高数",
    questionType: "填空题",
    count: 2,
    requested: 2,
    available: 0,
  },
]);

console.log("exam-utils tests passed");
