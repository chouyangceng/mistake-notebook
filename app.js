const seed = [];
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
const read = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") ?? f;
  } catch {
    return f;
  }
};
const now = () => new Date().toISOString();
const makeId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let deviceId = localStorage.getItem("shiti-device-id") || makeId();
localStorage.setItem("shiti-device-id", deviceId);
let sync = read("shiti-sync", {
  endpoint: "",
  userId: "local",
  token: "",
  lastSync: "",
});
sync.deviceId = deviceId;
const {
  ACTIVE_SUBJECTS,
  defaults: subjectDefaults,
  normalizeConfig,
  normalizePath,
  findNode,
  flattenTree,
  samePath,
  pathStartsWith,
  rebasePath,
  addNode,
  removeNode,
  renameNode,
  moveNode,
} = ShitiTaxonomy;
const defaultSubjectConfig = subjectDefaults();
let subjectConfig = normalizeConfig(
  read("shiti-subject-config", defaultSubjectConfig),
);
let titleBooks = ShitiTitleCode.normalizeBooks(read("shiti-title-books", null));
let questions = read("shiti-questions", seed),
  currentSubject = "全部",
  pendingAttachment = null,
  pendingAnswerAttachment = null,
  pendingImageSource = null,
  pendingAnswerImageSource = null;
let editingClassificationId = null;
let textPromptResolver = null;
let plan = read("shiti-plan", { dailyTotal: 6, rows: {} }),
  dayPlan = read("shiti-dayplan", { date: "", sig: "", ids: [] }),
  done = read("shiti-done", {});
questions = questions.map(normalizeQuestion);
let syncAddressCache = [];
const guideFeatures = [
  [
    "错题整理",
    "按科目、知识路径、独立题型、知识点和标签归类，题目与答案分开填。",
    "已完成",
  ],
  [
    "归类编辑",
    "卡片里可直接修改知识路径和题型；配置页支持任意层级增删。",
    "已完成",
  ],
  ["滚动复习", "连续浏览全部题目，不记录熟练度，不要求额外标记。", "已完成"],
  [
    "本地存储",
    "题目、分类和同步设置保存在 localStorage，图片/PDF 正文保存在 IndexedDB。",
    "已完成",
  ],
  [
    "跨端准备",
    "Windows 主库已内置本地同步接收器，安卓可通过局域网地址把数据推到 Windows。",
    "进行中",
  ],
  [
    "备份恢复",
    "一键导出题库、分类、同步设置和附件正文，并可直接导入恢复。",
    "已完成",
  ],
];
const guideSteps = [
  "先录入错题，分别选择知识路径与题型，再填写知识点、题目和答案。",
  "在「科目配置」中继续添加单元级知识分类，或维护独立题型。",
  "打开「滚动复习」，从上到下浏览题目和答案即可，不需要熟练度标记。",
  "数学与 822 控制可在「智能组卷」按知识大类和题型分别设置数量。",
];
const guideFlow = [
  ["入口层", "桌面命令、浏览器、PWA 安装入口"],
  ["数据层", "localStorage 管题目与分类，IndexedDB 管附件"],
  ["分类层", "科目、知识分类树、独立题型和知识点"],
  ["展示层", "错题库、滚动复习、矩阵组卷、学习洞察"],
  ["同步层", "Windows 内置 HTTP 接收器，安卓/PWA 把变更 POST 到局域网地址"],
];
const brainstormIdeas = [
  ["真正云同步", "后面可再接 Firebase / Supabase / 自建 API"],
  ["完整备份恢复", "把 IndexedDB 附件一起导出、导入"],
  ["PDF/OCR 解析", "截图裁题、答案图分开存"],
  ["编辑删除归档", "清理错题与无用附件"],
  ["提醒通知", "每天自动提示该复习几题"],
  ["标签统计", "按错因、题型、知识点聚类"],
];
const guideData = [
  ["shiti-questions", "错题主表，保存题目、答案、分类、标签和附件元数据。"],
  ["shiti-subject-config", "英语/数学/822控制的知识分类树、题型与组卷开关。"],
  ["shiti-sync", "同步配置：endpoint / userId / lastSync。"],
  ["sync-store.json", "Windows 端内置同步接收器保存的最新同步包。"],
  ["shiti-assets", "IndexedDB 附件正文库。"],
  [
    "sync payload",
    "{ deviceId, sync, subjectConfig, questions, assets }（旧计划字段仅作兼容迁移）",
  ],
];
function today() {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function askText(title, hint, initialValue = "") {
  if (textPromptResolver) textPromptResolver(null);
  $("#textPromptTitle").textContent = title;
  $("#textPromptHint").textContent = hint;
  $("#textPromptInput").value = initialValue;
  $("#textPromptModal").classList.add("show");
  setTimeout(() => $("#textPromptInput").focus(), 0);
  return new Promise((resolve) => (textPromptResolver = resolve));
}
function closeTextPrompt(value = null) {
  $("#textPromptModal").classList.remove("show");
  let resolve = textPromptResolver;
  textPromptResolver = null;
  if (resolve) resolve(value);
}
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    toast("保存失败：本地存储空间不足，请先导出备份");
    return false;
  }
}
function saveQuestions() {
  return save("shiti-questions", questions);
}
function saveSubjectConfig() {
  subjectConfig = normalizeConfig(subjectConfig);
  save("shiti-subject-config", subjectConfig);
}
function normalizeQuestion(q) {
  let knowledgePath = normalizePath(q.knowledgePath, q.module, q.unit),
    module = knowledgePath[0] || "未分类",
    unit = knowledgePath[1] || "";
  return {
    ...q,
    knowledgePath,
    module,
    unit,
    questionType: String(q.questionType || "未分类题型"),
    topic: Array.isArray(q.topic) ? q.topic : q.topic ? [q.topic] : [],
    tags: Array.isArray(q.tags) ? q.tags : [],
    createdAt: q.createdAt || q.updatedAt || now(),
    reviewCount: +q.reviewCount || 0,
    reviewHistory: Array.isArray(q.reviewHistory) ? q.reviewHistory : [],
    lastReviewedAt: q.lastReviewedAt || "",
    userId: q.userId || sync.userId || "local",
    deviceId: q.deviceId || deviceId,
    updatedAt: q.updatedAt || now(),
    version: q.version || 2,
    deletedAt: q.deletedAt || null,
  };
}
function touch(q) {
  q.updatedAt = now();
  q.deviceId = deviceId;
  q.userId = sync.userId || "local";
  q.version = (q.version || 0) + 1;
}
function subjects() {
  return [...ACTIVE_SUBJECTS];
}
function questionTypes(subject) {
  return subjectConfig[subject]?.questionTypes || [];
}
function splitCSV(v) {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function saveTitleBooks() {
  titleBooks = ShitiTitleCode.normalizeBooks(titleBooks);
  save("shiti-title-books", titleBooks);
}

function desktopBookLabel(book) {
  return book.name ? `${book.code} · ${book.name}` : `${book.code} · 未命名书籍`;
}

function renderDesktopTitleBooks(selectedCode = "") {
  const select = $("#desktopTitleBook");
  const selected = selectedCode || select.value || titleBooks[0]?.code || "";
  select.innerHTML = titleBooks
    .map(
      (book) =>
        `<option value="${esc(book.code)}"${book.code === selected ? " selected" : ""}>${esc(desktopBookLabel(book))}</option>`,
    )
    .join("");
  if (!select.value && titleBooks[0]) select.value = titleBooks[0].code;
  $("#desktopBookList").innerHTML = titleBooks
    .map(
      (book) =>
        `<div class="book-list-item"><span><strong>${esc(book.code)}</strong>${book.name ? ` · ${esc(book.name)}` : " · 未命名书籍"}</span><button type="button" data-delete-desktop-book="${esc(book.code)}" aria-label="删除书籍 ${esc(book.code)}">删除</button></div>`,
    )
    .join("");
  $$('[data-delete-desktop-book]').forEach((button) => {
    button.onclick = () => {
      if (titleBooks.length <= 1) return toast("至少保留一本书");
      const code = button.dataset.deleteDesktopBook;
      if (!confirm(`删除书籍「${code}」？已保存错题的标题不会改变。`)) return;
      titleBooks = titleBooks.filter((book) => book.code !== code);
      saveTitleBooks();
      renderDesktopTitleBooks();
      updateDesktopTitlePreview();
      toast("书籍已删除，已有错题标题保持不变");
    };
  });
}

function updateDesktopTitlePreview() {
  const preview = $("#desktopTitlePreview");
  const button = $("#desktopUseTitleBtn");
  try {
    const value = ShitiTitleCode.buildQuestionTitle({
      bookCode: $("#desktopTitleBook").value,
      chapter: $("#desktopTitleChapter").value,
      question: $("#desktopTitleQuestion").value,
      note: $("#desktopTitleNote").value,
    });
    preview.textContent = value;
    preview.classList.remove("invalid");
    button.disabled = false;
    button.dataset.title = value;
  } catch (error) {
    preview.textContent = error.message;
    preview.classList.add("invalid");
    button.disabled = true;
    button.dataset.title = "";
  }
}

function resetDesktopTitleBuilder() {
  renderDesktopTitleBooks();
  $("#desktopTitleChapter").value = "";
  $("#desktopTitleQuestion").value = "";
  $("#desktopTitleNote").value = "";
  updateDesktopTitlePreview();
}
function fillSubjectSelect(sel, value) {
  if (!sel) return;
  sel.innerHTML = subjects()
    .map((s) => `<option${s === value ? " selected" : ""}>${esc(s)}</option>`)
    .join("");
}
function fillQuestionTypeSelect(sel, subject, value = "") {
  if (!sel) return;
  let list = [...questionTypes(subject)];
  if (value && !list.includes(value)) list = [value, ...list];
  if (!list.length) list = ["不区分题型"];
  sel.innerHTML = list
    .map(
      (x) =>
        `<option value="${esc(x)}"${x === value ? " selected" : ""}>${esc(x)}</option>`,
    )
    .join("");
}
function renderKnowledgePath(container, subject, path = []) {
  if (!container) return;
  let tree = subjectConfig[subject]?.knowledgeTree || [],
    html = "",
    selected = [];
  for (let depth = 0; tree.length || path[depth]; depth++) {
    let legacy =
        path[depth] && !tree.some((x) => x.name === path[depth])
          ? { name: path[depth], children: [] }
          : null,
      options = legacy ? [legacy, ...tree] : tree,
      value = path[depth] || (depth === 0 && tree[0] ? tree[0].name : "");
    html += `<select class="knowledge-level" data-depth="${depth}" aria-label="第 ${depth + 1} 级知识分类"><option value="">${depth ? "不再细分" : "请选择知识大类"}</option>${options.map((x) => `<option${x.name === value ? " selected" : ""}>${esc(x.name)}${legacy === x ? "（旧分类）" : ""}</option>`).join("")}</select>`;
    if (!value) break;
    selected.push(value);
    let configured = findNode(subjectConfig[subject].knowledgeTree, selected);
    tree =
      configured?.children ||
      (path[depth + 1] ? [{ name: path[depth + 1], children: [] }] : []);
  }
  container.innerHTML = html;
  container
    .querySelectorAll("select")
    .forEach(
      (select) =>
        (select.onchange = () =>
          renderKnowledgePath(
            container,
            subject,
            readKnowledgePath(container),
          )),
    );
}
function readKnowledgePath(container) {
  return [...(container?.querySelectorAll("select") || [])]
    .map((x) => x.value)
    .filter(Boolean);
}
function db() {
  return new Promise((ok, fail) => {
    let r = indexedDB.open("shiti-assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function putAsset(a) {
  let d = await db();
  return new Promise((ok, fail) => {
    let t = d.transaction("files", "readwrite");
    t.objectStore("files").put(a, a.id);
    t.oncomplete = () => {
      d.close();
      ok();
    };
    t.onerror = () => fail(t.error);
  });
}
async function getAsset(id) {
  let d = await db();
  return new Promise((ok, fail) => {
    let r = d.transaction("files").objectStore("files").get(id);
    r.onsuccess = () => {
      d.close();
      ok(r.result);
    };
    r.onerror = () => fail(r.error);
  });
}
async function deleteAsset(id) {
  let d = await db();
  return new Promise((ok, fail) => {
    let t = d.transaction("files", "readwrite");
    t.objectStore("files").delete(id);
    t.oncomplete = () => {
      d.close();
      ok();
    };
    t.onerror = () => fail(t.error);
  });
}
async function allAssets() {
  let d = await db();
  return new Promise((ok, fail) => {
    let r = d.transaction("files").objectStore("files").getAll();
    r.onsuccess = () => {
      d.close();
      ok(r.result);
    };
    r.onerror = () => fail(r.error);
  });
}
async function clearAssets() {
  let d = await db();
  return new Promise((ok, fail) => {
    let t = d.transaction("files", "readwrite");
    t.objectStore("files").clear();
    t.oncomplete = () => {
      d.close();
      ok();
    };
    t.onerror = () => fail(t.error);
  });
}
function renderSync() {
  if (!$("#syncStatus")) return;
  $("#syncStatus").textContent = sync.endpoint ? "云同步" : "本地";
  $("#syncHint").textContent = sync.endpoint
    ? `最近同步 ${sync.lastSync ? new Date(sync.lastSync).toLocaleString("zh-CN") : "尚未同步"}`
    : "未配置云同步";
}
function renderSyncAddresses() {
  let box = $("#syncAddressList");
  if (!box) return;
  let copyBtn = $("#copySyncAddress");
  if (!(globalThis.window && window.shitiSync && window.shitiSync.getInfo)) {
    syncAddressCache = [];
    box.innerHTML =
      '<div class="guide-item"><div><strong>仅 Windows 桌面版可见</strong><p>这里会显示本机可直接复制的同步地址。</p></div></div>';
    if (copyBtn)
      copyBtn.onclick = () => toast("请在 Windows 桌面版中查看同步地址");
    return;
  }
  window.shitiSync
    .getInfo()
    .then((info) => {
      let urls = [info?.loopback, ...(info?.lanUrls || [])].filter(Boolean);
      syncAddressCache = urls;
      box.innerHTML = urls.length
        ? urls
            .map(
              (u, i) =>
                `<div class="guide-item"><div><strong>${esc(i === 0 ? "本机回环地址" : "局域网地址")}</strong><p>${esc(u)}</p></div></div>`,
            )
            .join("")
        : '<div class="guide-item"><div><strong>未发现可用地址</strong><p>请确认 Windows 已联网且允许本机同步服务。</p></div></div>';
      if (copyBtn)
        copyBtn.onclick = async () => {
          let target = syncAddressCache[1] || syncAddressCache[0];
          if (!target) {
            toast("没有可复制的地址");
            return;
          }
          try {
            await navigator.clipboard.writeText(target);
            toast("已复制 Windows 同步地址");
          } catch {
            toast("复制失败，请手动选中地址");
          }
        };
    })
    .catch(() => {
      syncAddressCache = [];
      box.innerHTML =
        '<div class="guide-item"><div><strong>同步地址获取失败</strong><p>请稍后重试，或检查 Windows 桌面版是否已打开。</p></div></div>';
      if (copyBtn) copyBtn.onclick = () => toast("同步地址暂不可用");
    });
}
function renderGuide() {
  if (!$("#guideView")) return;
  $("#guideTotal").textContent = questions.length;
  $("#guideToday").textContent = activeQuestions().length;
  $("#guideSync").textContent = sync.endpoint ? "云同步" : "本地";
  $("#guideSyncHint").textContent = sync.endpoint
    ? `最近同步 ${sync.lastSync ? new Date(sync.lastSync).toLocaleString("zh-CN") : "尚未同步"}`
    : "未配置云同步";
  $("#syncEndpointInput").value = sync.endpoint || "";
  $("#syncUserInput").value = sync.userId || "local";
  $("#guideFeatures").innerHTML = guideFeatures
    .map(
      ([title, desc, status]) =>
        `<div class="guide-item"><div><strong>${esc(title)}</strong><p>${esc(desc)}</p></div><span>${esc(status)}</span></div>`,
    )
    .join("");
  $("#guideSteps").innerHTML = guideSteps
    .map((step) => `<li>${esc(step)}</li>`)
    .join("");
  $("#guideFlow").innerHTML = guideFlow
    .map(
      ([title, desc], i) =>
        `<div class="flow-item"><span class="flow-index">${i + 1}</span><div><strong>${esc(title)}</strong><p>${esc(desc)}</p></div></div>`,
    )
    .join("");
  $("#guideIdeas").innerHTML = brainstormIdeas
    .map(
      ([title, desc]) =>
        `<div class="guide-item"><div><strong>${esc(title)}</strong><p>${esc(desc)}</p></div></div>`,
    )
    .join("");
  $("#guideData").innerHTML = guideData
    .map(
      ([key, desc]) =>
        `<div class="guide-item"><div><strong>${esc(key)}</strong><p>${esc(desc)}</p></div></div>`,
    )
    .join("");
  renderSyncAddresses();
}
async function renderExamHistory() {
  let box = $("#examHistory");
  if (!box || !globalThis.window?.shitiSync?.getExamHistory) return;
  try {
    let history = await window.shitiSync.getExamHistory();
    box.innerHTML = history.length
      ? history
          .map(
            (item) =>
              `<article class="exam-history-item"><strong>${esc(item.title)}</strong><p>${new Date(item.createdAt).toLocaleString("zh-CN")} · ${item.questionCount} 道${item.missing?.length ? ` · ${item.missing.length} 类题量不足` : ""}</p><div class="exam-files"><button data-exam-file="${esc(item.paperPath)}">打开试卷版</button><button data-exam-file="${esc(item.answerPath)}">打开答案版</button></div></article>`,
          )
          .join("")
      : '<div class="no-results">还没有组卷记录</div>';
    $$("[data-exam-file]").forEach(
      (button) =>
        (button.onclick = () =>
          window.shitiSync
            .openExamFile(button.dataset.examFile)
            .catch(() => toast("PDF 文件已被移动或删除"))),
    );
  } catch {
    box.innerHTML = '<div class="no-results">读取组卷历史失败</div>';
  }
}
function syncPayload(assets = []) {
  return {
    deviceId,
    sync,
    subjectConfig,
    questions,
    plan,
    done,
    dayPlan,
    assets,
  };
}
function mergeQuestions(remote = []) {
  let map = new Map(questions.map((q) => [String(q.id), q])),
    changed = false;
  remote.forEach((r) => {
    let id = String(r?.id || "");
    if (!id) return;
    let local = map.get(id);
    if (r.deletedAt) {
      if (local) {
        map.delete(id);
        changed = true;
      }
      return;
    }
    if (!local || String(r.updatedAt || "") > String(local.updatedAt || "")) {
      map.set(id, r);
      changed = true;
    }
  });
  questions = [...map.values()];
  saveQuestions();
  return changed;
}
let desktopPulling = false;
async function pullDesktopState(silent = true) {
  if (desktopPulling || !globalThis.window?.shitiSync?.getInfo) return;
  desktopPulling = true;
  try {
    let info = await window.shitiSync.getInfo(),
      endpoint = String(info?.loopback || "").replace(/\/$/, ""),
      token = String(info?.token || "");
    if (!endpoint || !token) return;
    sync.endpoint = endpoint;
    sync.token = token;
    sync.userId = sync.userId || "local";
    let response = await fetch(endpoint, {
      headers: { "x-shiti-token": token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("desktop pull failed");
    let remote = await response.json(),
      changed = false;
    if (Array.isArray(remote.questions))
      changed = mergeQuestions(remote.questions.map(normalizeQuestion));
    if (remote.subjectConfig) {
      let merged = normalizeConfig({
        ...subjectConfig,
        ...remote.subjectConfig,
      });
      if (JSON.stringify(merged) !== JSON.stringify(subjectConfig)) {
        subjectConfig = merged;
        saveSubjectConfig();
        changed = true;
      }
    }
    sync.lastSync = now();
    save("shiti-sync", sync);
    if ($("#syncTokenInput")) $("#syncTokenInput").value = token;
    if ($("#syncEndpointInput")) $("#syncEndpointInput").value = endpoint;
    if (changed) {
      dayPlan = { date: "", sig: "", ids: [] };
      save("shiti-dayplan", dayPlan);
      render();
      if (!silent) toast("已接收手机上传的错题");
    } else renderSync();
  } catch (e) {
    if (!silent) toast("暂时无法读取 E 盘题库，正在后台重试");
  } finally {
    desktopPulling = false;
  }
}
async function syncNow() {
  let endpoint = $("#syncEndpointInput")?.value.trim();
  let userId = $("#syncUserInput")?.value.trim();
  let token = $("#syncTokenInput")?.value.trim();
  if (endpoint) {
    sync.endpoint = endpoint;
    sync.userId = userId || "local";
    sync.token = token;
    save("shiti-sync", sync);
    renderSync();
  }
  if (!sync.endpoint) {
    let fallback = await askText(
      "输入同步服务地址",
      "地址",
      sync.endpoint || "",
    );
    if (!fallback) return;
    sync.endpoint = fallback.trim();
    save("shiti-sync", sync);
    renderSync();
  }
  try {
    let assets = await allAssets().catch(() => []);
    let res = await fetch(sync.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shiti-token": sync.token || "",
      },
      body: JSON.stringify(syncPayload(assets)),
    });
    if (!res.ok) throw new Error("bad response");
    let data = await res.json().catch(() => null);
    if (data) {
      if (data.subjectConfig)
        subjectConfig = normalizeConfig({
          ...subjectConfig,
          ...data.subjectConfig,
        });
      if (Array.isArray(data.questions))
        mergeQuestions(data.questions.map(normalizeQuestion));
      if (data.plan) plan = data.plan;
      if (data.done) done = data.done;
      if (data.dayPlan) dayPlan = data.dayPlan;
      if (data.sync) sync = { ...sync, ...data.sync };
      if (Array.isArray(data.assets))
        for (let a of data.assets) await putAsset(a).catch(() => {});
    }
    // 推送后立即 GET 拉取服务端完整状态，把其他设备推上来的题目合入本地。
    let pull = await fetch(sync.endpoint, {
      method: "GET",
      headers: { "x-shiti-token": sync.token || "" },
    });
    if (pull.ok) {
      let remote = await pull.json().catch(() => null);
      if (remote) {
        if (remote.subjectConfig)
          subjectConfig = normalizeConfig({
            ...subjectConfig,
            ...remote.subjectConfig,
          });
        if (Array.isArray(remote.questions))
          mergeQuestions(remote.questions.map(normalizeQuestion));
        if (remote.plan) plan = remote.plan;
        if (remote.done) done = remote.done;
        if (remote.dayPlan) dayPlan = remote.dayPlan;
        if (Array.isArray(remote.assets))
          for (let a of remote.assets) await putAsset(a).catch(() => {});
      }
    }
    sync.lastSync = now();
    save("shiti-sync", sync);
    saveSubjectConfig();
    saveQuestions();
    save("shiti-plan", plan);
    save("shiti-dayplan", dayPlan);
    save("shiti-done", done);
    render();
    toast("同步完成");
  } catch (e) {
    toast("同步失败，请检查同步地址");
  }
}
function saveSyncConfig() {
  sync.endpoint = $("#syncEndpointInput").value.trim();
  sync.userId = $("#syncUserInput").value.trim() || "local";
  sync.token = $("#syncTokenInput").value.trim();
  sync.deviceId = deviceId;
  save("shiti-sync", sync);
  render();
  toast("同步配置已保存");
}
function applyImportedState(data) {
  let assetBag = Array.isArray(data.assets) ? [...data.assets] : [];
  if (data.subjectConfig) subjectConfig = normalizeConfig(data.subjectConfig);
  questions = Array.isArray(data.questions)
    ? data.questions
        .map((q) => {
          let attachment = q.attachment || null;
          if (attachment && attachment.data) {
            let assetId = attachment.id || `asset-${q.id}`;
            let safeData = String(attachment.data).startsWith("data:")
              ? attachment.data
              : "";
            if (safeData)
              assetBag.push({
                id: assetId,
                name: attachment.name,
                type: attachment.type,
                data: safeData,
              });
            attachment = {
              id: assetId,
              name: attachment.name,
              type: attachment.type,
            };
          }
          return normalizeQuestion({ ...q, attachment });
        })
        .map(sanitizeImported)
    : questions;
  plan = data.plan || plan;
  done = data.done || done;
  dayPlan = data.dayPlan || { date: "", sig: "", ids: [] };
  if (data.titleBooks)
    titleBooks = ShitiTitleCode.normalizeBooks(data.titleBooks);
  if (data.sync) sync = { ...sync, ...data.sync, deviceId };
  return assetBag;
}
function sanitizeImported(q) {
  let safe = { ...q };
  if (typeof safe.id !== "string") safe.id = String(safe.id);
  if (!/^[A-Za-z0-9_-]+$/.test(safe.id)) safe.id = makeId();
  for (let key of [
    "title",
    "question",
    "answer",
    "reflection",
    "conclusion",
    "subject",
    "module",
    "unit",
  ])
    safe[key] = String(safe[key] ?? "").slice(0, 5000);
  if (!Array.isArray(safe.topic)) safe.topic = [];
  if (!Array.isArray(safe.tags)) safe.tags = [];
  return safe;
}
async function importBackupFile(file) {
  let raw = await file.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    toast("备份文件不是有效 JSON");
    return;
  }
  let overwrite = confirm(
    "导入方式：确定=覆盖现有题库；取消=合并导入（保留现有，新增不重复）",
  );
  const existingTitleBooks = [...titleBooks];
  let assets = applyImportedState(data);
  if (!overwrite) {
    let merged = new Map(questions.map((q) => [String(q.id), q]));
    let incoming = Array.isArray(data.questions) ? data.questions : [];
    incoming.forEach((q) => {
      let id = String((q && q.id) || "");
      if (!id) return;
      let local = merged.get(id);
      if (!local || String(q.updatedAt || "") > String(local.updatedAt || ""))
        merged.set(id, normalizeQuestion(q));
    });
    questions = [...merged.values()];
    titleBooks = ShitiTitleCode.normalizeBooks([
      ...existingTitleBooks,
      ...(Array.isArray(data.titleBooks) ? data.titleBooks : []),
    ]);
    assets = [];
  } else {
    await clearAssets().catch(() => {});
  }
  for (let a of assets) await putAsset(a).catch(() => {});
  saveSubjectConfig();
  saveQuestions();
  save("shiti-plan", plan);
  save("shiti-done", done);
  save("shiti-dayplan", dayPlan);
  save("shiti-sync", sync);
  saveTitleBooks();
  resetDesktopTitleBuilder();
  currentSubject = "全部";
  render();
  toast(overwrite ? "备份已覆盖导入" : "备份已合并导入（新增不重复题）");
}
function downloadBackup() {
  allAssets()
    .then((assets) => {
      let a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { questions, subjectConfig, titleBooks, plan, done, dayPlan, sync, assets },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      a.download = "拾题-错题备份.json";
      a.click();
      toast("备份文件已下载");
    })
    .catch(() => toast("导出失败"));
}
function renderFilters() {
  let fs = ["全部", ...subjects()];
  $("#subjectFilters").innerHTML = fs
    .map(
      (s) =>
        `<button class="segment ${s === currentSubject ? "active" : ""}" data-filter="${esc(s)}">${esc(s)}</button>`,
    )
    .join("");
  $$("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        currentSubject = b.dataset.filter;
        render();
      }),
  );
  let units = [
    ...new Set(
      questions
        .filter(
          (q) => currentSubject === "全部" || q.subject === currentSubject,
        )
        .flatMap((q) => [q.module, q.unit].filter(Boolean)),
    ),
  ];
  let previous = $("#unitFilter")?.value || "all";
  $("#unitFilter").innerHTML =
    '<option value="all">全部模块/单元</option>' +
    units.map((u) => `<option>${esc(u)}</option>`).join("");
  if (units.includes(previous)) $("#unitFilter").value = previous;
}
function safeAssetUrl(data) {
  return String(data || "").startsWith("data:") ? esc(data) : "";
}
function questionAttachment(q) {
  return q.attachment || q.file || q.remoteAttachment || null;
}
function answerAttachment(q) {
  return q.answerAttachment || q.answerFile || q.remoteAnswerAttachment || null;
}
function attachment(q, role = "question") {
  let a = role === "answer" ? answerAttachment(q) : questionAttachment(q);
  if (!a) return "";
  if (a.data && a.type?.startsWith("image/")) {
    let url = safeAssetUrl(a.data);
    return url
      ? `<div class="attachment-card"><img src="${url}" alt="${esc(a.name || (role === "answer" ? "答案图片" : "题目图片"))}"></div>`
      : `<div class="attachment-card" data-asset="${esc(a.id)}" data-asset-role="${role}"><span>图片</span><b>${esc(a.name)}</b></div>`;
  }
  if (a.type?.startsWith("image/"))
    return `<div class="attachment-card" data-asset="${esc(a.id)}" data-asset-role="${role}"><span>图片</span><b>${esc(a.name)}</b></div>`;
  return `<div class="attachment-card"><span>PDF</span><b>${esc(a.name)}</b></div>`;
}
async function loadAttachments() {
  $$("[data-asset]").forEach(async (e) => {
    let role = e.dataset.assetRole || "question",
      q = questions.find((x) =>
        [questionAttachment(x)?.id, answerAttachment(x)?.id].includes(
          e.dataset.asset,
        ),
      ),
      meta =
        role === "answer"
          ? answerAttachment(q || {}) || {}
          : questionAttachment(q || {}) || {};
    let a = await getAsset(e.dataset.asset).catch(() => null);
    if (a?.data && a.type.startsWith("image/")) {
      let url = safeAssetUrl(a.data);
      if (url) e.innerHTML = `<img src="${url}" alt="${esc(a.name)}">`;
      return;
    }
    if (meta.fileName && sync.endpoint && sync.token) {
      let url = `${sync.endpoint.replace(/\/$/, "")}/attachments/${encodeURIComponent(meta.fileName)}`;
      try {
        let res = await fetch(url, {
          headers: { "x-shiti-token": sync.token },
        });
        if (!res.ok) return;
        let blob = await res.blob(),
          objectUrl = URL.createObjectURL(blob);
        if ((meta.type || "").startsWith("image/"))
          e.innerHTML = `<img src="${objectUrl}" alt="${esc(meta.name || "题目附件")}">`;
        else
          e.innerHTML = `<a href="${objectUrl}" target="_blank" rel="noopener">打开 PDF：${esc(meta.name || "附件")}</a>`;
      } catch {}
    }
  });
}
function topics() {
  let m = {};
  questions.forEach((q) =>
    [...(q.topic || []), ...(q.tags || [])].forEach(
      (t) => (m[t] = (m[t] || 0) + 1),
    ),
  );
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
}
function calendar() {
  let d = new Date(),
    year = d.getFullYear(),
    month = d.getMonth(),
    first = new Date(year, month, 1).getDay(),
    days = new Date(year, month + 1, 0).getDate(),
    todayKey = today(),
    cells = ["日", "一", "二", "三", "四", "五", "六"]
      .map((x) => `<b>${x}</b>`)
      .join("");
  for (let i = 0; i < first; i++) cells += "<span></span>";
  for (let i = 1; i <= days; i++) {
    let key = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`,
      count = activeQuestions().filter(
        (question) => String(question.createdAt || "").slice(0, 10) === key,
      ).length;
    cells += `<span class="${count ? "done " : ""}${key === todayKey ? "today" : ""}" title="入库 ${count} 题">${i}</span>`;
  }
  $("#calendar").innerHTML = cells;
  let label = $("#calendar")?.closest(".rail-card")?.querySelector(".muted");
  if (label) label.textContent = `${year}年${month + 1}月`;
}
function closeClassificationModal() {
  editingClassificationId = null;
  $("#classificationModal").classList.remove("show");
}
function activeQuestions() {
  return questions.filter(
    (q) => !q.deletedAt && subjects().includes(q.subject),
  );
}
function renderNav() {
  let active = questions.filter(
      (q) => !q.deletedAt && subjects().includes(q.subject),
    ),
    nav = $("#subjectNav");
  nav.innerHTML = subjects()
    .map(
      (s) =>
        `<div class="subject-row"><button data-subject="${esc(s)}"><i class="subject-dot"></i>${esc(s)}</button><span class="subject-count">${active.filter((q) => q.subject === s).length}</span></div>`,
    )
    .join("");
  $("#totalCount").textContent = active.length;
  $("#metricTotal").textContent = active.length;
  fillSubjectSelect(
    $("#subjectSelect"),
    $("#subjectSelect")?.value || subjects()[0],
  );
  fillSubjectSelect(
    $("#classificationSubject"),
    $("#classificationSubject")?.value || subjects()[0],
  );
  updateModuleSelect();
  nav.querySelectorAll("[data-subject]").forEach(
    (b) =>
      (b.onclick = () => {
        currentSubject = b.dataset.subject;
        render();
      }),
  );
}
function updateModuleSelect(path = []) {
  let subject = $("#subjectSelect")?.value || subjects()[0];
  fillQuestionTypeSelect($("#questionTypeSelect"), subject, "");
  renderKnowledgePath(
    $("#knowledgePathSelects"),
    subject,
    Array.isArray(path) ? path : [],
  );
}
function migrateQuestionClassificationPaths(
  subject,
  sourcePath,
  destinationPath,
  collapse = false,
) {
  let changed = 0;
  for (const question of questions) {
    if (
      question.deletedAt ||
      question.subject !== subject ||
      !pathStartsWith(question.knowledgePath, sourcePath)
    )
      continue;
    question.knowledgePath = collapse
      ? [...destinationPath]
      : rebasePath(question.knowledgePath, sourcePath, destinationPath);
    if (!question.knowledgePath.length) question.knowledgePath = ["未分类"];
    question.module = question.knowledgePath[0];
    question.unit = question.knowledgePath[1] || "";
    touch(question);
    changed += 1;
  }
  if (changed) saveQuestions();
  return changed;
}
function taxonomyDestinationOptions(subject, sourcePath) {
  const sourceParent = sourcePath.slice(0, -1);
  const destinations = [
    { path: [], label: `${subject}（根目录）` },
    ...flattenTree(subjectConfig[subject]?.knowledgeTree).map((entry) => ({
      path: entry.path,
      label: entry.path.join(" › "),
    })),
  ].filter(
    (entry) =>
      !samePath(entry.path, sourceParent) &&
      !pathStartsWith(entry.path, sourcePath),
  );
  return destinations
    .map(
      (entry) =>
        `<option value="${esc(encodeURIComponent(JSON.stringify(entry.path)))}">${esc(entry.label)}</option>`,
    )
    .join("");
}
function taxonomyNodeHtml(subject, node, path) {
  let full = [...path, node.name],
    encoded = encodeURIComponent(JSON.stringify(full));
  return `<li><div class="taxonomy-node"><span class="taxonomy-pill knowledge-pill">知识 · ${esc(node.name)}</span><span class="taxonomy-actions"><button class="ghost-btn add-child" data-subject="${esc(subject)}" data-path="${encoded}">加下级</button><button class="ghost-btn rename-node" data-subject="${esc(subject)}" data-path="${encoded}">重命名</button><button class="ghost-btn move-node" data-subject="${esc(subject)}" data-path="${encoded}" aria-expanded="false">移动</button><button class="danger-text delete-node" data-subject="${esc(subject)}" data-path="${encoded}">删除</button></span></div><div class="taxonomy-move-panel" hidden><label>移动到<select class="taxonomy-move-target">${taxonomyDestinationOptions(subject, full)}</select></label><div><button class="ghost-btn cancel-node-move" type="button">取消</button><button class="primary-btn confirm-node-move" data-subject="${esc(subject)}" data-path="${encoded}" type="button">确认移动</button></div></div>${node.children?.length ? `<ul>${node.children.map((child) => taxonomyNodeHtml(subject, child, full)).join("")}</ul>` : ""}</li>`;
}
function renderConfig() {
  if (!$("#subjectConfigCards")) return;
  subjectConfig = normalizeConfig(subjectConfig);
  $("#subjectConfigCards").innerHTML = subjects()
    .map((subject) => {
      let config = subjectConfig[subject];
      return `<article class="taxonomy-card"><div class="taxonomy-head"><div><strong>${esc(subject)}</strong><p>像文件夹一样添加、重命名和移动；分类变化时旧错题会自动跟随。</p></div><button class="ghost-btn add-root" data-subject="${esc(subject)}">加知识大类</button></div><ul class="taxonomy-tree">${config.knowledgeTree.map((node) => taxonomyNodeHtml(subject, node, [])).join("") || '<li class="muted">暂无知识分类</li>'}</ul><div class="type-config"><strong>题型</strong><div>${config.questionTypes.map((type) => `<span class="taxonomy-pill type-pill">题型 · ${esc(type)} <button class="delete-type" data-subject="${esc(subject)}" data-type="${esc(type)}" aria-label="删除${esc(type)}">×</button></span>`).join("") || '<span class="muted">该科目不区分题型</span>'}</div><button class="ghost-btn add-type" data-subject="${esc(subject)}">加题型</button></div></article>`;
    })
    .join("");
  let tags = [
    ...new Set([
      "计算错误",
      "审题失误",
      "概念混淆",
      "步骤缺漏",
      "公式不熟",
      ...questions.flatMap((q) => q.tags || []),
    ]),
  ];
  $("#tagSuggestionPanel").innerHTML = tags
    .map((t) => `<span class="mini-pill">${esc(t)}</span>`)
    .join("");
  $$(".add-root,.add-child").forEach(
    (b) =>
      (b.onclick = async () => {
        let path = b.dataset.path
            ? JSON.parse(decodeURIComponent(b.dataset.path))
            : [],
          name = await askText(
            "添加知识分类",
            `归属：${b.dataset.subject}${path.length ? " · " + path.join(" · ") : ""}`,
          );
        if (!name?.trim()) return;
        if (!addNode(subjectConfig, b.dataset.subject, path, name))
          return toast("名称重复或父级已不存在");
        saveSubjectConfig();
        render();
        toast("知识分类已添加");
      }),
  );
  $$(".delete-node").forEach(
    (b) =>
      (b.onclick = () => {
        let path = JSON.parse(decodeURIComponent(b.dataset.path));
        let affected = questions.filter(
          (question) =>
            !question.deletedAt &&
            question.subject === b.dataset.subject &&
            pathStartsWith(question.knowledgePath, path),
        ).length;
        if (!confirm(`确定删除知识分类「${path.join(" · ")}」及其所有下级吗？\n${affected ? `其中 ${affected} 道旧错题会安全移动到上一级。` : "当前没有关联错题。"}`))
          return;
        if (removeNode(subjectConfig, b.dataset.subject, path)) {
          let parent = path.slice(0, -1);
          migrateQuestionClassificationPaths(
            b.dataset.subject,
            path,
            parent.length ? parent : ["未分类"],
            true,
          );
          saveSubjectConfig();
          render();
          toast(affected ? `分类已删除，${affected} 道错题已移到上一级` : "知识分类已删除");
        }
      }),
  );
  $$(".rename-node").forEach(
    (b) =>
      (b.onclick = async () => {
        let path = JSON.parse(decodeURIComponent(b.dataset.path));
        let name = await askText(
          "重命名知识分类",
          `当前位置：${b.dataset.subject} · ${path.join(" · ")}`,
          path.at(-1),
        );
        if (!name?.trim() || name.trim() === path.at(-1)) return;
        let nextPath = renameNode(
          subjectConfig,
          b.dataset.subject,
          path,
          name,
        );
        if (!nextPath) return toast("名称重复或分类已不存在");
        let changed = migrateQuestionClassificationPaths(
          b.dataset.subject,
          path,
          nextPath,
        );
        saveSubjectConfig();
        render();
        toast(`分类已重命名${changed ? `，${changed} 道旧错题已同步更新` : ""}`);
      }),
  );
  $$(".move-node").forEach(
    (b) =>
      (b.onclick = () => {
        let panel = b.closest("li").querySelector(":scope > .taxonomy-move-panel");
        let opening = panel.hidden;
        $$(".taxonomy-move-panel").forEach((item) => (item.hidden = true));
        $$(".move-node").forEach((item) => item.setAttribute("aria-expanded", "false"));
        panel.hidden = !opening;
        b.setAttribute("aria-expanded", String(opening));
        if (opening) panel.querySelector("select")?.focus();
      }),
  );
  $$(".cancel-node-move").forEach(
    (b) =>
      (b.onclick = () => {
        b.closest(".taxonomy-move-panel").hidden = true;
      }),
  );
  $$(".confirm-node-move").forEach(
    (b) =>
      (b.onclick = () => {
        let path = JSON.parse(decodeURIComponent(b.dataset.path));
        let target = JSON.parse(
          decodeURIComponent(
            b.closest(".taxonomy-move-panel").querySelector("select").value,
          ),
        );
        let nextPath = moveNode(subjectConfig, b.dataset.subject, path, target);
        if (!nextPath) return toast("无法移动：目标重复、无效或位于当前分类内部");
        let changed = migrateQuestionClassificationPaths(
          b.dataset.subject,
          path,
          nextPath,
        );
        saveSubjectConfig();
        render();
        toast(`分类已移动${changed ? `，${changed} 道旧错题已一起移动` : ""}`);
      }),
  );
  $$(".add-type").forEach(
    (b) =>
      (b.onclick = async () => {
        let name = await askText("添加题型", `科目：${b.dataset.subject}`);
        if (!name?.trim()) return;
        let list = subjectConfig[b.dataset.subject].questionTypes;
        if (list.includes(name.trim())) return toast("该题型已存在");
        list.push(name.trim());
        saveSubjectConfig();
        render();
        toast("题型已添加");
      }),
  );
  $$(".delete-type").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          !confirm(
            `确定删除题型「${b.dataset.type}」吗？\n已有题目仍会保留题型文字。`,
          )
        )
          return;
        subjectConfig[b.dataset.subject].questionTypes = subjectConfig[
          b.dataset.subject
        ].questionTypes.filter((x) => x !== b.dataset.type);
        saveSubjectConfig();
        render();
        toast("题型已删除");
      }),
  );
}
function examGroups() {
  subjectConfig = normalizeConfig(subjectConfig);
  let groups = [];
  for (const subject of subjects().filter(
    (x) => subjectConfig[x].examEnabled,
  )) {
    for (const node of subjectConfig[subject].knowledgeTree) {
      for (const questionType of questionTypes(subject)) {
        let count = questions.filter(
            (q) =>
              !q.deletedAt &&
              q.subject === subject &&
              q.knowledgePath?.[0] === node.name &&
              q.questionType === questionType,
          ).length,
          key = `${subject}|||${node.name}|||${questionType}`;
        groups.push({
          key,
          subject,
          knowledge: node.name,
          questionType,
          count,
        });
      }
    }
  }
  return groups;
}
function renderExamBuilder() {
  let rows = $("#examQuotaRows");
  if (!rows) return;
  let previous = {};
  $$(".exam-quota-input").forEach(
    (input) => (previous[input.dataset.key] = input.value),
  );
  let groups = examGroups(),
    bySubject = groups.reduce((m, x) => ((m[x.subject] ??= []).push(x), m), {});
  rows.innerHTML =
    Object.entries(bySubject)
      .map(
        ([subject, items]) =>
          `<section class="exam-subject"><h4>${esc(subject)}</h4>${items.map((group) => `<label class="exam-quota-row"><span><strong><span class="knowledge-pill compact-pill">${esc(group.knowledge)}</span> <span class="type-pill compact-pill">${esc(group.questionType)}</span></strong><span>可用 ${group.count} 道</span></span><input class="exam-quota-input" data-key="${esc(group.key)}" data-subject="${esc(group.subject)}" data-knowledge="${esc(group.knowledge)}" data-question-type="${esc(group.questionType)}" type="number" min="0" max="100" value="${esc(previous[group.key] || 0)}" aria-label="${esc(group.subject + group.knowledge + group.questionType + "题数")}" /></label>`).join("")}</section>`,
      )
      .join("") ||
    '<div class="no-results">请先配置数学或 822 控制的分类与题型</div>';
  let update = () => {
    $("#examTotal").textContent =
      `共 ${$$(".exam-quota-input").reduce((sum, input) => sum + (+input.value || 0), 0)} 道`;
  };
  $$(".exam-quota-input").forEach((input) => (input.oninput = update));
  update();
  renderExamHistory();
}
async function generateExamFromUi() {
  if (!globalThis.window?.shitiSync?.generateExam) {
    toast("智能组卷仅支持 Windows 桌面版");
    return;
  }
  let title = $("#examTitle").value.trim() || `错题复习卷-${today()}`,
    quotas = $$(".exam-quota-input")
      .map((input) => ({
        subject: input.dataset.subject,
        knowledge: input.dataset.knowledge,
        questionType: input.dataset.questionType,
        count: Math.max(0, +input.value || 0),
      }))
      .filter((item) => item.count),
    resultBox = $("#examResult");
  if (!quotas.length) {
    resultBox.textContent = "请至少给一个“知识分类 × 题型”填写题数。";
    resultBox.className = "exam-result error";
    toast("请至少填写一个题量");
    return;
  }
  let button = $("#generateExam");
  button.disabled = true;
  button.textContent = "正在排版两份 PDF…";
  try {
    let result = await window.shitiSync.generateExam({ title, quotas });
    let notes =
      result.missing?.map(
        (x) =>
          `${x.subject}·${x.knowledge}·${x.questionType}缺 ${x.requested - x.available} 道`,
      ) || [];
    resultBox.textContent = `已生成 ${result.questionCount} 道题${notes.length ? "；" + notes.join("，") : ""}`;
    resultBox.className = `exam-result ${notes.length ? "warning" : "success"}`;
    toast(`已生成 ${result.questionCount} 道题的两份 PDF`);
    await renderExamHistory();
  } catch (error) {
    resultBox.textContent = `组卷失败：${error.message || "请稍后重试"}`;
    resultBox.className = "exam-result error";
    toast("组卷失败");
  } finally {
    button.disabled = false;
    button.textContent = "生成试卷版 + 答案版 PDF";
  }
}
function recordInfo(q) {
  let created = new Date(q.createdAt).toLocaleDateString("zh-CN"),
    levels =
      1 +
      (q.knowledgePath || []).length +
      (q.questionType && q.questionType !== "未分类题型" ? 1 : 0) +
      (q.topic || []).length;
  return {
    created,
    levels,
    labelCount: (q.topic || []).length + (q.tags || []).length,
  };
}
function card(q) {
  let r = recordInfo(q),
    idAttr = esc(String(q.id)),
    path = (q.knowledgePath || []).join(" › ");
  return `<article class="question-card"><div class="q-meta"><span class="tag">${esc(q.subject)}</span><span class="knowledge-pill compact-pill">知识 · ${esc(path || "未分类")}</span>${q.questionType && q.questionType !== "不区分题型" ? `<span class="type-pill compact-pill">题型 · ${esc(q.questionType)}</span>` : ""}</div><h3>${esc(q.title)}</h3><p class="excerpt">${esc(q.question || (questionAttachment(q) ? "题干见附件" : "暂未填写题干"))}</p>${attachment(q)}<div class="card-foot"><div></div><button class="ghost-btn record-btn" data-id="${idAttr}" aria-expanded="${q.recordOpen ? "true" : "false"}">${q.recordOpen ? "收起档案" : "查看档案"}</button><button class="ghost-btn classify-btn" data-id="${idAttr}">修改归类</button><button class="reveal-btn" data-id="${idAttr}">${q.revealed ? "收起答案" : "查看答案"}</button><button class="del-btn" data-id="${idAttr}" title="删除这道错题">删除</button></div>${
    q.recordOpen
      ? `<div class="answer-box"><strong>题目档案</strong><div class="reflection">入库日期：${esc(r.created)}<br>分类层级：${r.levels} 级<br>标签总数：${r.labelCount} 个</div><div class="topic-pills">${[
          q.subject,
          ...(q.knowledgePath || []),
          q.questionType,
          ...(q.topic || []),
          ...(q.tags || []).map((t) => `#${t}`),
        ]
          .filter(Boolean)
          .map((t) => `<span>${esc(t)}</span>`)
          .join("")}</div></div>`
      : ""
  }${q.revealed ? `<div class="answer-box"><strong>答案与解析</strong>${esc(q.answer) || (answerAttachment(q) ? "答案见图片。" : "暂未填写答案。")}${attachment(q, "answer")}${q.conclusion ? `<div class="reflection"><b>奥技 / 结论：</b>${esc(q.conclusion)}</div>` : ""}${q.reflection ? `<div class="reflection"><b>我的反思：</b>${esc(q.reflection)}</div>` : ""}</div>` : ""}</article>`;
}
function bindCards() {
  $$(".record-btn").forEach(
    (b) =>
      (b.onclick = () => {
        let q = questions.find((x) => x.id == b.dataset.id);
        if (q) {
          q.recordOpen = !q.recordOpen;
          render();
        }
      }),
  );
  $$(".classify-btn").forEach(
    (b) => (b.onclick = () => openClassificationModal(b.dataset.id)),
  );
  $$(".reveal-btn").forEach(
    (b) =>
      (b.onclick = () => {
        let q = questions.find((x) => x.id == b.dataset.id);
        if (q) {
          q.revealed = !q.revealed;
          render();
        }
      }),
  );
  $$(".del-btn").forEach(
    (b) => (b.onclick = () => deleteQuestion(b.dataset.id)),
  );
}
async function deleteQuestion(questionId) {
  let q = questions.find((x) => String(x.id) === String(questionId));
  if (
    !q ||
    !confirm(
      `确定彻底删除错题「${q.title || q.question}」吗？\n删除会同步到 E 盘和其他设备。`,
    )
  )
    return;
  let id = String(q.id),
    stamp = now(),
    endpoint = "",
    token = "";
  try {
    if (globalThis.window?.shitiSync?.getInfo) {
      let info = await window.shitiSync.getInfo();
      endpoint = String(info?.loopback || "").replace(/\/$/, "");
      token = String(info?.token || "");
    } else {
      endpoint = String(sync.endpoint || "").replace(/\/$/, "");
      token = String(sync.token || "");
    }
    if (endpoint) {
      let response = await fetch(
        `${endpoint}/api/questions/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { "x-shiti-token": token } },
      );
      if (!response.ok && response.status !== 404)
        throw new Error(`HTTP ${response.status}`);
    }
  } catch {
    toast("E 盘删除失败，题目未删除，请重试");
    return;
  }
  q.deletedAt = stamp;
  q.updatedAt = stamp;
  q.version = (+q.version || 0) + 1;
  q.deviceId = deviceId;
  q.userId = sync.userId || "local";
  q.revealed = false;
  for (let key of Object.keys(done))
    done[key] = (done[key] || []).filter((itemId) => String(itemId) !== id);
  if (q.attachment?.id) deleteAsset(q.attachment.id).catch(() => {});
  if (q.answerAttachment?.id)
    deleteAsset(q.answerAttachment.id).catch(() => {});
  saveQuestions();
  save("shiti-done", done);
  render();
  toast(
    endpoint
      ? "已从本机、E 盘和同步题库删除"
      : "已标记删除，联网后会同步到 E 盘",
  );
}
function openClassificationModal(id) {
  let q = questions.find((x) => String(x.id) === String(id));
  if (!q) return;
  editingClassificationId = q.id;
  fillSubjectSelect($("#classificationSubject"), q.subject);
  fillQuestionTypeSelect(
    $("#classificationQuestionType"),
    q.subject,
    q.questionType,
  );
  renderKnowledgePath(
    $("#classificationKnowledgePath"),
    q.subject,
    q.knowledgePath,
  );
  $("#classificationTopic").value = (q.topic || []).join(", ");
  $("#classificationTags").value = (q.tags || []).join(", ");
  $("#classificationModal").classList.add("show");
}
function saveClassificationForm(e) {
  e.preventDefault();
  let q = questions.find(
    (x) => String(x.id) === String(editingClassificationId),
  );
  if (!q) return;
  let f = new FormData(e.target),
    path = readKnowledgePath($("#classificationKnowledgePath"));
  q.subject = f.get("subject") || q.subject;
  q.knowledgePath = path.length ? path : ["未分类"];
  q.module = q.knowledgePath[0];
  q.unit = q.knowledgePath[1] || "";
  q.questionType = f.get("questionType") || "未分类题型";
  q.topic = splitCSV(f.get("topic"));
  q.tags = splitCSV(f.get("tags"));
  touch(q);
  saveQuestions();
  closeClassificationModal();
  render();
  toast("归类已更新");
}
function renderRealStats() {
  let active = activeQuestions();
  let classifications = new Set(
    active.map((q) => `${q.subject}|||${q.knowledgePath?.[0] || "未分类"}`),
  );
  if ($("#navReviewCount")) $("#navReviewCount").textContent = active.length;
  if ($("#masteryRate")) $("#masteryRate").textContent = classifications.size;
  if ($("#streakDays"))
    $("#streakDays").innerHTML = `${classifications.size} <small>类</small>`;
  if ($("#todayLabel"))
    $("#todayLabel").textContent = new Date().toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  let start = new Date();
  start.setDate(start.getDate() - 7);
  let recent = active.filter((q) => new Date(q.createdAt) >= start).length,
    recentRatio = active.length
      ? Math.round((recent / active.length) * 100)
      : 0;
  if ($("#weekProgress")) $("#weekProgress").textContent = `${recent} 道`;
  if ($("#weekProgressBar"))
    $("#weekProgressBar").style.width = `${recentRatio}%`;
  if ($("#weekRemain"))
    $("#weekRemain").textContent = recent
      ? `占当前题库 ${recentRatio}%`
      : "近 7 天暂无新增";
  if ($("#metricDelta")) {
    $("#metricDelta").textContent = recent
      ? `近 7 天新增 ${recent} 道`
      : "近 7 天暂无新增";
  }
  let focus = new Map();
  active.forEach((q) => {
    let label = [q.subject, q.knowledgePath?.[0], q.topic?.[0]]
      .filter(Boolean)
      .join(" · ");
    if (label) focus.set(label, (focus.get(label) || 0) + 1);
  });
  let [focusLabel, focusCount] =
    [...focus.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if ($("#weakSummary"))
    $("#weakSummary").textContent = focusLabel
      ? `当前最集中在「${focusLabel}」，共 ${focusCount} 道。`
      : "录入错题后，这里会显示最集中的分类。";
  if ($("#focusWeak"))
    $("#focusWeak").dataset.subject = focusLabel?.split(" · ")[0] || "全部";
  calendar();
}
function render() {
  let active = questions.filter(
    (q) => !q.deletedAt && subjects().includes(q.subject),
  );
  renderNav();
  renderFilters();
  let unit = $("#unitFilter")?.value || "all",
    sort = $("#sortFilter")?.value || "recent";
  let list = active.filter(
    (q) =>
      (currentSubject === "全部" || q.subject === currentSubject) &&
      (unit === "all" || q.knowledgePath?.includes(unit)),
  );
  if (sort === "hard")
    list.sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0));
  $("#listHeading").innerHTML =
    `${esc(currentSubject === "全部" ? "全部错题" : currentSubject)} <span>${list.length}</span>`;
  $("#questionList").innerHTML = list.length
    ? list.map(card).join("")
    : '<div class="no-results">还没有符合条件的错题，点击右上角新建一题吧。</div>';
  $("#reviewCount").textContent = `${active.length} 道`;
  $("#reviewList").innerHTML = active.length
    ? active.map(card).join("")
    : '<div class="no-results">题库为空，先录入错题再来滚动复习。</div>';
  $("#topicBars").innerHTML = topics()
    .map(
      ([t, n]) =>
        `<div class="topic-bar"><label><span>${esc(t)}</span><span>${n}</span></label><div class="bar-line"><i style="width:${Math.min(100, n * 28 + 16)}%"></i></div></div>`,
    )
    .join("");
  bindCards();
  loadAttachments();
  renderSync();
  renderGuide();
  renderConfig();
  renderExamBuilder();
  renderRealStats();
}
function toast(t) {
  let e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 2200);
}
$("#closeModal").textContent = "关闭";
$("#closeModal").title = "关闭新建错题窗口";
$("#closeModal").setAttribute("aria-label", "关闭新建错题窗口");
$$(".nav-item").forEach(
  (b) =>
    (b.onclick = () => {
      $$(".nav-item").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $$(".view").forEach((v) => v.classList.remove("active-view"));
      $(`#${b.dataset.view}View`).classList.add("active-view");
      $("#pageTitle").textContent = b.dataset.title || b.textContent.trim();
    }),
);
$("#newQuestion").onclick = () => {
  $("#modal").classList.add("show");
  $("#subjectSelect").value =
    currentSubject !== "全部" && subjects().includes(currentSubject)
      ? currentSubject
      : subjects()[0];
  updateModuleSelect();
};
$("#closeModal").onclick = () => $("#modal").classList.remove("show");
$("#modal").onclick = (e) => {
  if (e.target.id === "modal") $("#modal").classList.remove("show");
};
$("#classificationSubject").onchange = () => {
  let subject = $("#classificationSubject").value;
  fillQuestionTypeSelect($("#classificationQuestionType"), subject);
  renderKnowledgePath($("#classificationKnowledgePath"), subject, []);
};
$("#classificationModal").onclick = (e) => {
  if (e.target.id === "classificationModal") closeClassificationModal();
};
$("#closeClassification").onclick = closeClassificationModal;
$("#closeTextPrompt").onclick = () => closeTextPrompt();
$("#cancelTextPrompt").onclick = () => closeTextPrompt();
$("#textPromptForm").onsubmit = (event) => {
  event.preventDefault();
  closeTextPrompt($("#textPromptInput").value.trim());
};
$("#classificationForm").onsubmit = saveClassificationForm;
function fileData(file) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}
function pendingFor(target) {
  return target === "answer" ? pendingAnswerAttachment : pendingAttachment;
}
function sourceFor(target) {
  return target === "answer" ? pendingAnswerImageSource : pendingImageSource;
}
function setPending(target, asset, source = null) {
  if (target === "answer") {
    pendingAnswerAttachment = asset;
    pendingAnswerImageSource = source;
  } else {
    pendingAttachment = asset;
    pendingImageSource = source;
  }
  renderPendingAttachment(target);
}
function renderPendingAttachment(target) {
  let isAnswer = target === "answer",
    asset = pendingFor(target),
    source = sourceFor(target),
    preview = $(isAnswer ? "#answerAttachmentPreview" : "#attachmentPreview"),
    removeButton = $(
      isAnswer ? "#removeAnswerAttachment" : "#removeQuestionAttachment",
    );
  preview.innerHTML = "";
  removeButton.classList.toggle("hidden", !asset);
  if (!asset) return;
  if (asset.type?.startsWith("image/") && safeAssetUrl(asset.data)) {
    let image = document.createElement("img");
    image.src = asset.data;
    image.alt = isAnswer ? "答案图片预览" : "题目图片预览";
    preview.append(image);
  }
  let meta = document.createElement("div"),
    name = document.createElement("span");
  meta.className = "attachment-preview-meta";
  name.textContent = asset.type?.startsWith("image/")
    ? asset.name
    : `PDF 已附加：${asset.name}`;
  meta.append(name);
  if (source && asset.type?.startsWith("image/")) {
    let recrop = document.createElement("button");
    recrop.type = "button";
    recrop.className = "recrop-attachment";
    recrop.textContent = "重新裁剪";
    recrop.onclick = () => openAttachmentCropper(source, target);
    meta.append(recrop);
  }
  preview.append(meta);
}
async function openAttachmentCropper(source, target) {
  try {
    await DesktopCropper.open(source, {
      target,
      title: target === "answer" ? "裁剪答案图片" : "裁剪题目图片",
      onConfirm: ({ file, data, source: originalSource }) => {
        setPending(
          target,
          {
            id: `asset-${makeId()}`,
            name: file.name,
            type: file.type || "image/webp",
            data,
          },
          originalSource,
        );
        $("#modal").classList.add("show");
        toast(target === "answer" ? "答案图片已裁剪" : "题目图片已裁剪");
        requestAnimationFrame(() =>
          $(
            target === "answer"
              ? "#answerAttachmentPreview .recrop-attachment"
              : "#attachmentPreview .recrop-attachment",
          )?.focus(),
        );
      },
    });
  } catch {
    toast("图片读取失败，请重新选择或换一张图片");
  }
}
async function handleAttachmentSelection(input, target) {
  let file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > 25_000_000) {
    toast("附件不能超过 25MB");
    return;
  }
  try {
    let data = await fileData(file),
      source = { name: file.name, type: file.type, data };
    if (file.type?.startsWith("image/")) {
      await openAttachmentCropper(source, target);
      return;
    }
    if (target === "answer" || file.type !== "application/pdf") {
      toast(target === "answer" ? "答案附件请选择图片" : "仅支持图片或 PDF");
      return;
    }
    setPending(target, {
      id: `asset-${makeId()}`,
      name: file.name,
      type: "application/pdf",
      data,
    });
    $("#modal").classList.add("show");
    toast(`已附加「${file.name}」`);
  } catch {
    toast("附件读取失败，请重新选择");
  }
}
$("#questionForm").onsubmit = async (e) => {
  e.preventDefault();
  let f = new FormData(e.target),
    attachment = null,
    answerAttachment = null,
    path = readKnowledgePath($("#knowledgePathSelects"));
  if (!path.length) {
    toast("请至少选择一个知识大类");
    return;
  }
  if (!String(f.get("question") || "").trim() && !pendingAttachment) {
    e.target.elements.question.focus();
    toast("请填写题目内容，或添加一张题目图片 / PDF");
    return;
  }
  try {
    if (pendingAttachment) {
      await putAsset(pendingAttachment);
      attachment = {
        id: pendingAttachment.id,
        name: pendingAttachment.name,
        type: pendingAttachment.type,
      };
    }
    if (pendingAnswerAttachment) {
      await putAsset(pendingAnswerAttachment);
      answerAttachment = {
        id: pendingAnswerAttachment.id,
        name: pendingAnswerAttachment.name,
        type: pendingAnswerAttachment.type,
      };
    }
  } catch {
    if (attachment?.id) await deleteAsset(attachment.id).catch(() => {});
    if (answerAttachment?.id)
      await deleteAsset(answerAttachment.id).catch(() => {});
    toast("附件保存失败，请重试或先移除附件");
    return;
  }
  let q = normalizeQuestion({
    id: Date.now(),
    subject: f.get("subject"),
    knowledgePath: path,
    questionType: f.get("questionType") || "未分类题型",
    topic: splitCSV(f.get("topic") || "未分类"),
    tags: splitCSV(f.get("tags")),
    title: f.get("title"),
    question: f.get("question"),
    answer: f.get("answer"),
    reflection: f.get("reflection"),
    conclusion: f.get("conclusion"),
    attachment,
    answerAttachment,
    difficulty: 3,
    date: "刚刚",
    revealed: false,
    deletedAt: null,
  });
  questions.unshift(q);
  pendingAttachment = null;
  pendingAnswerAttachment = null;
  pendingImageSource = null;
  pendingAnswerImageSource = null;
  renderPendingAttachment("question");
  renderPendingAttachment("answer");
  if (!saveQuestions()) return;
  e.target.reset();
  resetDesktopTitleBuilder();
  $("#modal").classList.remove("show");
  currentSubject = "全部";
  render();
  toast("错题已保存到本地");
};
$("#subjectSelect").onchange = () => updateModuleSelect();
$("#desktopManageBooksBtn").onclick = () => {
  const manager = $("#desktopBookManager");
  const open = manager.classList.toggle("hidden") === false;
  $("#desktopManageBooksBtn").setAttribute("aria-expanded", String(open));
  if (open) $("#desktopNewBookCode").focus();
};
$("#desktopAddBookBtn").onclick = () => {
  try {
    titleBooks = ShitiTitleCode.addBook(titleBooks, {
      code: $("#desktopNewBookCode").value,
      name: $("#desktopNewBookName").value,
    });
    const code = titleBooks.at(-1).code;
    saveTitleBooks();
    renderDesktopTitleBooks(code);
    $("#desktopNewBookCode").value = "";
    $("#desktopNewBookName").value = "";
    updateDesktopTitlePreview();
    toast(`已添加书籍 ${code}`);
  } catch (error) {
    toast(error.message);
  }
};
$("#desktopTitleBook").onchange = updateDesktopTitlePreview;
for (const id of ["#desktopTitleChapter", "#desktopTitleQuestion"]) {
  $(id).oninput = (event) => {
    event.target.value = event.target.value.replace(/\D/g, "");
    updateDesktopTitlePreview();
  };
}
$("#desktopTitleNote").oninput = updateDesktopTitlePreview;
$("#desktopUseTitleBtn").onclick = () => {
  const value = $("#desktopUseTitleBtn").dataset.title;
  if (!value) return;
  $("#questionForm").elements.title.value = value;
  $("#questionForm").elements.title.focus();
  toast("快捷标题已填入，仍可继续修改");
};
$("#unitFilter").onchange = render;
$("#sortFilter").onchange = render;
$("#importBtn").onclick = () => $("#fileInput").click();
$("#selectQuestionAttachment").onclick = () => $("#fileInput").click();
$("#selectAnswerAttachment").onclick = () => $("#answerFileInput").click();
$("#fileInput").onchange = (e) =>
  handleAttachmentSelection(e.target, "question");
$("#answerFileInput").onchange = (e) =>
  handleAttachmentSelection(e.target, "answer");
$("#removeQuestionAttachment").onclick = () => {
  setPending("question", null);
  toast("题目附件已移除");
};
$("#removeAnswerAttachment").onclick = () => {
  setPending("answer", null);
  toast("答案图片已移除");
};
$("#exportBtn").onclick = downloadBackup;
$("#exportBackupBtn").onclick = downloadBackup;
$("#focusWeak").onclick = () => {
  currentSubject = $("#focusWeak").dataset.subject || "全部";
  render();
  toast(
    currentSubject === "全部" ? "暂无可筛选错题" : `已筛选${currentSubject}`,
  );
};
$("#syncNow").onclick = syncNow;
$("#syncNowGuide").onclick = syncNow;
$("#saveSyncConfig").onclick = saveSyncConfig;
$("#importBackupBtn").onclick = () => $("#backupFileInput").click();
$("#backupFileInput").onchange = (e) => {
  let file = e.target.files[0];
  if (file) importBackupFile(file).finally(() => (e.target.value = ""));
};
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker.register("./sw.js").catch(() => {});
$("#generateExam").onclick = generateExamFromUi;
$("#refreshExamHistory").onclick = renderExamHistory;
saveTitleBooks();
resetDesktopTitleBuilder();
render();
setTimeout(() => pullDesktopState(false), 200);
setInterval(() => pullDesktopState(true), 5000);
