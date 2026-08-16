const assert = require("node:assert/strict");
const {
  ACTIVE_SUBJECTS,
  CONFIG_SCHEMA_VERSION,
  normalizeConfig,
  normalizePath,
  addNode,
  removeNode,
} = require("../taxonomy-utils");

const migrated = normalizeConfig({
  英语: {
    knowledgeTree: ["小三门", "阅读"],
    questionTypes: [],
  },
  数学: ["高数", "线性代数"],
  政治: ["马原"],
});
assert.deepEqual(
  Object.keys(migrated).filter((key) => !key.startsWith("_")),
  ACTIVE_SUBJECTS,
);
assert.equal(migrated._schemaVersion, CONFIG_SCHEMA_VERSION);
assert.equal("政治" in migrated, false);
assert.equal("专业课" in migrated, false);
assert.deepEqual(
  migrated.英语.knowledgeTree.map((x) => x.name),
  ["阅读", "翻译", "作文"],
);
assert.deepEqual(migrated.英语.questionTypes, ["阅读", "翻译", "作文"]);
assert.deepEqual(
  migrated.数学.knowledgeTree.map((x) => x.name),
  ["高数", "线性代数"],
);
assert.equal(migrated.数学.questionTypes.includes("证明题"), true);
assert.deepEqual(normalizePath(null, "高数", "极限"), ["高数", "极限"]);
assert.equal(addNode(migrated, "数学", ["高数"], "极限"), true);
assert.equal(addNode(migrated, "数学", ["高数"], "极限"), false);
assert.equal(removeNode(migrated, "数学", ["高数", "极限"]), true);

const customized = normalizeConfig({
  _schemaVersion: CONFIG_SCHEMA_VERSION,
  英语: { knowledgeTree: [], questionTypes: [], examEnabled: false },
});
assert.deepEqual(customized.英语.knowledgeTree, []);
assert.deepEqual(customized.英语.questionTypes, []);

console.log("taxonomy-utils tests passed");
