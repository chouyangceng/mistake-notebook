(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ShitiTaxonomy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ACTIVE_SUBJECTS = ["英语", "数学", "822控制"];
  const CONFIG_SCHEMA_VERSION = 2;
  const uid = (name) =>
    `${String(name || "分类").replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 9)}`;
  const node = (name, children = []) => ({ id: uid(name), name, children });
  const defaults = () => ({
    英语: {
      knowledgeTree: [node("阅读"), node("翻译"), node("作文")],
      questionTypes: ["阅读", "翻译", "作文"],
      examEnabled: false,
    },
    数学: {
      knowledgeTree: [node("高等数学"), node("线性代数"), node("概率论")],
      questionTypes: ["选择题", "填空题", "大题", "证明题"],
      examEnabled: true,
    },
    "822控制": {
      knowledgeTree: [
        "系统建模与方块图",
        "时域分析",
        "稳定性判据",
        "根轨迹",
        "频域分析",
        "校正与设计",
        "状态空间",
      ].map((x) => node(x)),
      questionTypes: ["选择题", "大题"],
      examEnabled: true,
    },
  });
  function normalizeNode(raw) {
    if (typeof raw === "string") return node(raw);
    const name = String(raw?.name || "").trim();
    if (!name) return null;
    return {
      id: String(raw.id || uid(name)),
      name,
      children: (Array.isArray(raw.children) ? raw.children : [])
        .map(normalizeNode)
        .filter(Boolean),
    };
  }
  function normalizeTypes(raw, fallback = []) {
    const list = Array.isArray(raw) ? raw : fallback;
    return [
      ...new Set(
        list
          .map((x) => String(typeof x === "string" ? x : x?.name || "").trim())
          .filter(Boolean),
      ),
    ];
  }
  function normalizeSubject(raw, fallback) {
    if (Array.isArray(raw))
      return {
        knowledgeTree: raw.map(normalizeNode).filter(Boolean),
        questionTypes: [...fallback.questionTypes],
        examEnabled: fallback.examEnabled,
      };
    return {
      knowledgeTree: (Array.isArray(raw?.knowledgeTree)
        ? raw.knowledgeTree
        : fallback.knowledgeTree
      )
        .map(normalizeNode)
        .filter(Boolean),
      questionTypes: normalizeTypes(raw?.questionTypes, fallback.questionTypes),
      examEnabled:
        raw?.examEnabled === undefined
          ? fallback.examEnabled
          : Boolean(raw.examEnabled),
    };
  }
  function normalizeConfig(raw) {
    const base = defaults(),
      source = raw && typeof raw === "object" ? raw : {},
      legacy = Number(source._schemaVersion || 0) < CONFIG_SCHEMA_VERSION;
    const out = {};
    ACTIVE_SUBJECTS.forEach((subject) => {
      const normalized = normalizeSubject(source[subject], base[subject]);
      if (legacy && subject === "英语") {
        normalized.knowledgeTree = normalized.knowledgeTree.filter(
          (item) => item.name !== "小三门",
        );
        for (const required of base.英语.knowledgeTree) {
          if (
            !normalized.knowledgeTree.some(
              (item) => item.name === required.name,
            )
          )
            normalized.knowledgeTree.push(normalizeNode(required));
        }
        normalized.questionTypes = normalized.questionTypes.filter(
          (type) => type !== "小三门",
        );
        for (const required of base.英语.questionTypes) {
          if (!normalized.questionTypes.includes(required))
            normalized.questionTypes.push(required);
        }
      }
      out[subject] = normalized;
    });
    out._schemaVersion = CONFIG_SCHEMA_VERSION;
    return out;
  }
  function normalizePath(raw, module, unit) {
    let path = Array.isArray(raw)
      ? raw.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!path.length && module) path.push(String(module).trim());
    if (
      unit &&
      String(unit).trim() &&
      String(unit).trim() !== path[0] &&
      String(unit).trim() !== "未填单元"
    )
      path.push(String(unit).trim());
    return path.length ? path : ["未分类"];
  }
  function findNode(tree, path) {
    let list = Array.isArray(tree) ? tree : [],
      found = null;
    for (const part of Array.isArray(path) ? path : []) {
      found = list.find((x) => x.name === part);
      if (!found) return null;
      list = found.children || [];
    }
    return found;
  }
  function getListAtPath(tree, parentPath = []) {
    if (!parentPath.length) return tree;
    return findNode(tree, parentPath)?.children || null;
  }
  function samePath(left, right) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((part, index) => part === right[index])
    );
  }
  function pathStartsWith(path, prefix) {
    return (
      Array.isArray(path) &&
      Array.isArray(prefix) &&
      prefix.length <= path.length &&
      prefix.every((part, index) => path[index] === part)
    );
  }
  function rebasePath(path, sourcePath, destinationPath) {
    if (!pathStartsWith(path, sourcePath)) return Array.isArray(path) ? [...path] : [];
    return [...destinationPath, ...path.slice(sourcePath.length)];
  }
  function flattenTree(tree, parents = []) {
    return (Array.isArray(tree) ? tree : []).flatMap((item) => {
      const path = [...parents, item.name];
      return [{ node: item, path }, ...flattenTree(item.children, path)];
    });
  }
  function addNode(config, subject, parentPath, name) {
    const clean = String(name || "").trim();
    if (!clean) return false;
    const list = getListAtPath(config?.[subject]?.knowledgeTree, parentPath);
    if (!list || list.some((x) => x.name === clean)) return false;
    list.push(node(clean));
    return true;
  }
  function removeNode(config, subject, path) {
    if (!Array.isArray(path) || !path.length) return false;
    const list = getListAtPath(
      config?.[subject]?.knowledgeTree,
      path.slice(0, -1),
    );
    if (!list) return false;
    const index = list.findIndex((x) => x.name === path.at(-1));
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
  function renameNode(config, subject, path, nextName) {
    if (!Array.isArray(path) || !path.length) return null;
    const clean = String(nextName || "").trim();
    if (!clean) return null;
    const parentPath = path.slice(0, -1);
    const list = getListAtPath(config?.[subject]?.knowledgeTree, parentPath);
    if (!list) return null;
    const current = list.find((item) => item.name === path.at(-1));
    if (!current || list.some((item) => item !== current && item.name === clean))
      return null;
    current.name = clean;
    return [...parentPath, clean];
  }
  function moveNode(config, subject, sourcePath, destinationParentPath = []) {
    if (!Array.isArray(sourcePath) || !sourcePath.length) return null;
    const targetPath = Array.isArray(destinationParentPath)
      ? destinationParentPath
      : [];
    if (pathStartsWith(targetPath, sourcePath)) return null;
    const sourceParent = sourcePath.slice(0, -1);
    if (samePath(sourceParent, targetPath)) return null;
    const sourceList = getListAtPath(
      config?.[subject]?.knowledgeTree,
      sourceParent,
    );
    const targetList = getListAtPath(
      config?.[subject]?.knowledgeTree,
      targetPath,
    );
    if (!sourceList || !targetList) return null;
    const index = sourceList.findIndex((item) => item.name === sourcePath.at(-1));
    if (index < 0) return null;
    const moving = sourceList[index];
    if (targetList.some((item) => item.name === moving.name)) return null;
    sourceList.splice(index, 1);
    targetList.push(moving);
    return [...targetPath, moving.name];
  }
  return {
    ACTIVE_SUBJECTS,
    CONFIG_SCHEMA_VERSION,
    defaults,
    normalizeConfig,
    normalizePath,
    findNode,
    getListAtPath,
    flattenTree,
    samePath,
    pathStartsWith,
    rebasePath,
    addNode,
    removeNode,
    renameNode,
    moveNode,
  };
});
