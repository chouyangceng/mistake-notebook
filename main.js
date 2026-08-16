const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const startDiscovery = require("./discovery-server");
const { selectExamQuestions } = require("./exam-utils");
const { appendPdfAttachments } = require("./exam-pdf");

const SYNC_PORT = 17332;
const DATA_ROOT = process.env.SHITI_DATA_ROOT || "E:\\错题本数据";
const ATTACHMENT_ROOT = path.join(DATA_ROOT, "attachments");
const MOBILE_ROOT = path.join(__dirname, "mobile");
const EXAM_ROOT = path.join(DATA_ROOT, "试卷");
const EXAM_HISTORY = path.join(EXAM_ROOT, "组卷历史.json");
const defaultState = {
  deviceId: "",
  sync: { endpoint: "", userId: "local", lastSync: "" },
  subjectConfig: {},
  questions: [],
  plan: { dailyTotal: 6, rows: {} },
  done: {},
  dayPlan: { date: "", sig: "", ids: [] },
  assets: [],
};
let syncState = { ...defaultState };
let authToken = "";
let examHistoryRecoveryNote = "";
let examGenerationQueue = Promise.resolve();

function ensureDataRoot() {
  fs.mkdirSync(ATTACHMENT_ROOT, { recursive: true });
}
function safePaperName(name) {
  return (
    String(name || "错题复习卷")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .trim()
      .slice(0, 70) || "错题复习卷"
  );
}
function readExamHistory() {
  try {
    if (!fs.existsSync(EXAM_HISTORY)) return [];
    let data = JSON.parse(fs.readFileSync(EXAM_HISTORY, "utf8"));
    if (!Array.isArray(data)) throw new Error("history must be an array");
    return data;
  } catch {
    try {
      let stat = fs.statSync(EXAM_HISTORY),
        stamp = new Date(stat.mtimeMs).toISOString().replace(/[:.]/g, "-"),
        backup = `${EXAM_HISTORY}.损坏备份-${stamp}`;
      if (!fs.existsSync(backup)) fs.copyFileSync(EXAM_HISTORY, backup);
      examHistoryRecoveryNote = `组卷历史损坏，已备份为 ${path.basename(backup)} 并从空历史继续`;
    } catch {}
    return [];
  }
}
function saveExamHistory(history) {
  fs.mkdirSync(EXAM_ROOT, { recursive: true });
  let temp = `${EXAM_HISTORY}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(history, null, 2), "utf8");
  fs.renameSync(temp, EXAM_HISTORY);
}
function attachmentForExam(q, esc) {
  let attachment = q.attachment;
  if (!attachment?.fileName) return "";
  let filePath = path.join(ATTACHMENT_ROOT, path.basename(attachment.fileName));
  if (!fs.existsSync(filePath))
    return `<div class="attachment">附件缺失：${esc(attachment.name || "题目附件")}</div>`;
  let type = String(attachment.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    let mime = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
        type,
      )
        ? type
        : "image/jpeg",
      data = fs.readFileSync(filePath).toString("base64");
    return `<figure><img src="data:${mime};base64,${data}" alt="${esc(attachment.name || "题目图片")}"><figcaption>${esc(attachment.name || "题目图片")}</figcaption></figure>`;
  }
  return `<div class="attachment">PDF 原题：${esc(attachment.name || "题目附件")}（保存在 E 盘附件库；当前组卷保留文件名索引）</div>`;
}
function examHtml(title, items, withAnswers) {
  let esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  let blocks = items
    .map(
      (q, index) =>
        `<section class="question"><h2>${index + 1}. ${esc(q.title || "未命名题目")}</h2><div class="meta">${esc(q.subject)} · ${esc((q.knowledgePath || []).join(" › ") || q.module || q.unit || "未分类")} · ${esc(q.questionType || "未分类题型")}</div><div class="stem">${esc(q.question || "").replace(/\n/g, "<br>")}</div>${attachmentForExam(q, esc)}${withAnswers ? `<div class="answer"><strong>答案 / 解析</strong><p>${esc(q.answer || "暂未填写答案").replace(/\n/g, "<br>")}</p>${q.reflection ? `<p><b>反思：</b>${esc(q.reflection)}</p>` : ""}${q.conclusion ? `<p><b>结论：</b>${esc(q.conclusion)}</p>` : ""}</div>` : '<div class="answer-space"></div>'}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:17mm 16mm}*{box-sizing:border-box}body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#18231f;font-size:12pt;line-height:1.65}header{text-align:center;border-bottom:2px solid #315b4c;padding-bottom:12px;margin-bottom:20px}h1{margin:0;font-size:22pt}header p{margin:6px 0 0;color:#66736d}.question{break-inside:avoid;page-break-inside:avoid;margin:0 0 22px}.question h2{font-size:13.5pt;margin:0 0 3px}.meta{font-size:9.5pt;color:#68756f;margin-bottom:8px}.stem{white-space:normal}figure{margin:10px 0;text-align:center}figure img{max-width:100%;max-height:150mm;object-fit:contain}figcaption{font-size:9pt;color:#718078}.attachment{color:#61716a;background:#f2f6f3;padding:7px 9px;margin-top:9px}.answer-space{height:120px;border-bottom:1px dashed #aeb9b4;margin-top:12px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 30px,#e4e9e6 31px)}.answer{margin-top:12px;padding:11px 13px;background:#f2f8f5;border-left:4px solid #315b4c}.answer p{margin:5px 0}</style></head><body><header><h1>${esc(title)}</h1><p>${withAnswers ? "题目与答案版" : "试卷版"} · 共 ${items.length} 题 · ${new Date().toLocaleDateString("zh-CN")}</p></header>${blocks}</body></html>`;
}
async function htmlToPdf(html, filePath) {
  let window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });
  try {
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    let pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      marginsType: 0,
    });
    fs.writeFileSync(filePath, pdf);
  } finally {
    window.destroy();
  }
}
async function generateExamNow(payload) {
  let title = safePaperName(payload?.title),
    history = readExamHistory(),
    { selected, missing, quotas } = selectExamQuestions({
      questions: syncState.questions,
      quotas: payload?.quotas,
      history,
      done: syncState.done,
    });
  if (!selected.length) throw new Error("没有符合配置的题目");
  fs.mkdirSync(EXAM_ROOT, { recursive: true });
  let stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(2).toString("hex")}`,
    paperPath = path.join(EXAM_ROOT, `${stamp}-${title}-试卷版.pdf`),
    answerPath = path.join(EXAM_ROOT, `${stamp}-${title}-答案版.pdf`);
  try {
    await htmlToPdf(examHtml(title, selected, false), paperPath);
    await htmlToPdf(examHtml(title, selected, true), answerPath);
    let warnings = [
      ...(await appendPdfAttachments(paperPath, selected, ATTACHMENT_ROOT)),
      ...(await appendPdfAttachments(answerPath, selected, ATTACHMENT_ROOT)),
    ];
    if (examHistoryRecoveryNote) {
      warnings.push(examHistoryRecoveryNote);
      examHistoryRecoveryNote = "";
    }
    warnings = [...new Set(warnings)];
    let record = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      quotas,
      questionIds: selected.map((q) => String(q.id)),
      questionCount: selected.length,
      missing,
      warnings,
      paperPath,
      answerPath,
    };
    saveExamHistory([record, ...history].slice(0, 500));
    return record;
  } catch (error) {
    for (let file of [paperPath, answerPath])
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    throw error;
  }
}
function generateExam(payload) {
  let task = examGenerationQueue.then(() => generateExamNow(payload));
  examGenerationQueue = task.catch(() => {});
  return task;
}
function storePath() {
  return path.join(DATA_ROOT, "sync-store.json");
}
function loadStore() {
  try {
    let raw = fs.readFileSync(storePath(), "utf8");
    let data = JSON.parse(raw);
    if (data && typeof data === "object")
      syncState = {
        ...defaultState,
        ...data,
        sync: { ...defaultState.sync, ...data.sync },
        plan: { ...defaultState.plan, ...data.plan },
        dayPlan: { ...defaultState.dayPlan, ...data.dayPlan },
      };
  } catch {}
}
function loadToken() {
  let p = path.join(DATA_ROOT, "sync-token.txt");
  try {
    authToken = fs.readFileSync(p, "utf8").trim();
  } catch {}
  if (!authToken) {
    authToken = crypto.randomBytes(18).toString("hex");
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, authToken, { encoding: "utf8", mode: 0o600 });
    } catch {}
  }
}
function saveStore() {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(syncState, null, 2), "utf8");
  } catch {}
}
function reply(res, code, payload) {
  res.writeHead(code, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-shiti-token",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}
function textReply(res, code, content, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(content);
}
function safeFileName(name = "attachment") {
  let ext = path
    .extname(name)
    .slice(0, 12)
    .replace(/[^.a-zA-Z0-9]/g, "");
  let base =
    path
      .basename(name, path.extname(name))
      .replace(/[^\p{L}\p{N}_-]/gu, "-")
      .slice(0, 60) || "attachment";
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
}
function readJsonBody(req, res, max = 35_000_000) {
  return new Promise((resolve) => {
    let body = "",
      aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      body += chunk;
      if (Buffer.byteLength(body) > max) {
        aborted = true;
        reply(res, 413, { error: "payload too large" });
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reply(res, 400, { error: "invalid json" });
        resolve(null);
      }
    });
  });
}
function isAuthorized(req) {
  let supplied = Buffer.from(String(req.headers["x-shiti-token"] || "")),
    expected = Buffer.from(authToken);
  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}
function isAllowedFile(mime, buffer) {
  if (mime === "application/pdf")
    return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg")
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif")
    return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString());
  if (mime === "image/webp")
    return (
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    );
  return false;
}
function mobileAssetPath(urlPath) {
  let name = path.basename(urlPath);
  let allowed = new Set([
    "index.html",
    "mobile.css",
    "mobile-extra.css",
    "mobile.js",
  ]);
  return allowed.has(name) ? path.join(MOBILE_ROOT, name) : null;
}
function publicState() {
  return {
    ...syncState,
    assets: (syncState.assets || []).map((a) => ({ ...a, data: undefined })),
  };
}
function activeSubject(value) {
  let subject = String(value || "数学").trim();
  return ["英语", "数学", "822控制"].includes(subject) ? subject : "数学";
}
async function addMobileQuestion(req, res) {
  let data = await readJsonBody(req, res);
  if (!data) return;
  let clientId = String(data.clientId || ""),
    serverId = String(data.serverId || "");
  if (clientId && !/^[A-Za-z0-9_-]{8,100}$/.test(clientId)) {
    reply(res, 400, { error: "invalid client id" });
    return;
  }
  if (serverId && !/^[A-Za-z0-9_-]{1,200}$/.test(serverId)) {
    reply(res, 400, { error: "invalid server id" });
    return;
  }
  let id =
      serverId ||
      (clientId
        ? `mobile-${clientId}`
        : `mobile-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
    existingIndex = syncState.questions.findIndex((q) => String(q.id) === id),
    existing = existingIndex >= 0 ? syncState.questions[existingIndex] : null;
  if (existing?.deletedAt) {
    reply(res, 409, { error: "question was deleted on desktop" });
    return;
  }
  let subject = activeSubject(data.subject),
    title = String(data.title || "手机上传错题")
      .trim()
      .slice(0, 120),
    question = String(data.question || "")
      .trim()
      .slice(0, 20_000);
  if (!question && !data.file?.data && !existing?.attachment) {
    reply(res, 400, { error: "question or file required" });
    return;
  }
  let attachment = data.attachmentRemoved ? null : existing?.attachment || null,
    oldFile = existing?.attachment?.fileName || "";
  if (data.file?.data) {
    let match = String(data.file.data).match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) {
      reply(res, 400, { error: "invalid attachment" });
      return;
    }
    let mime = match[1].toLowerCase(),
      buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 25_000_000) {
      reply(res, 413, { error: "attachment too large" });
      return;
    }
    if (!isAllowedFile(mime, buffer)) {
      reply(res, 415, {
        error: "only valid jpeg, png, gif, webp or pdf files are allowed",
      });
      return;
    }
    let fileName = safeFileName(data.file.name);
    fs.writeFileSync(path.join(ATTACHMENT_ROOT, fileName), buffer);
    attachment = {
      id: `file-${Date.now()}`,
      name: String(data.file.name || fileName).slice(0, 160),
      type: mime,
      fileName,
      size: buffer.length,
    };
  }
  let stamp = new Date().toISOString(),
    knowledgePath = (
      Array.isArray(data.knowledgePath)
        ? data.knowledgePath
        : [data.module, data.unit]
    )
      .map((x) =>
        String(x || "")
          .trim()
          .slice(0, 60),
      )
      .filter(Boolean)
      .slice(0, 8);
  if (!knowledgePath.length) {
    reply(res, 400, { error: "knowledge classification required" });
    return;
  }
  let module = knowledgePath[0],
    unit = knowledgePath[1] || "",
    item = {
      ...(existing || {}),
      id,
      subject,
      module,
      unit,
      knowledgePath,
      questionType: String(data.questionType || "未分类题型")
        .trim()
        .slice(0, 30),
      topic: (Array.isArray(data.topic)
        ? data.topic
        : String(data.topic || "未分类").split(",")
      )
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 20),
      tags: (Array.isArray(data.tags)
        ? data.tags
        : String(data.tags || "手机上传").split(",")
      )
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 20),
      title,
      question,
      answer: String(data.answer || "").slice(0, 20_000),
      reflection: String(data.reflection || "").slice(0, 20_000),
      conclusion: String(data.conclusion || existing?.conclusion || "").slice(
        0,
        20_000,
      ),
      attachment,
      difficulty: Math.min(
        5,
        Math.max(1, Number(data.difficulty) || existing?.difficulty || 3),
      ),
      createdAt: existing?.createdAt || data.createdAt || stamp,
      updatedAt: stamp,
      reviewCount: +existing?.reviewCount || 0,
      reviewHistory: Array.isArray(existing?.reviewHistory)
        ? existing.reviewHistory
        : [],
      deviceId: "mobile-offline-first",
      userId: existing?.userId || "local",
      version: (+existing?.version || 1) + 1,
      deletedAt: null,
    };
  if (existingIndex >= 0) syncState.questions[existingIndex] = item;
  else syncState.questions.unshift(item);
  if (
    oldFile &&
    oldFile !== attachment?.fileName &&
    !syncState.questions.some(
      (q) => !q.deletedAt && q.attachment?.fileName === oldFile,
    )
  ) {
    try {
      fs.unlinkSync(path.join(ATTACHMENT_ROOT, path.basename(oldFile)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  saveStore();
  reply(res, existing ? 200 : 201, {
    ok: true,
    id: item.id,
    updated: Boolean(existing),
    question: item,
  });
}
function removeQuestion(id) {
  id = String(id || "");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return false;
  let index = (syncState.questions || []).findIndex((q) => String(q.id) === id),
    item = index >= 0 ? syncState.questions[index] : null,
    stamp = new Date().toISOString(),
    fileName = item?.attachment?.fileName,
    tombstone = {
      id,
      deletedAt: stamp,
      updatedAt: stamp,
      version: (+item?.version || 0) + 1,
    };
  if (index >= 0) syncState.questions[index] = tombstone;
  else syncState.questions.unshift(tombstone);
  if (
    fileName &&
    !syncState.questions.some(
      (q) => !q.deletedAt && q.attachment?.fileName === fileName,
    )
  ) {
    let filePath = path.join(ATTACHMENT_ROOT, path.basename(fileName));
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  saveStore();
  return true;
}
function exportAndroid(res) {
  let body = JSON.stringify(
    {
      ...publicState(),
      questions: syncState.questions.filter((q) => !q.deletedAt),
      exportedAt: new Date().toISOString(),
      format: "shiti-android-v1",
    },
    null,
    2,
  );
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": 'attachment; filename="shiti-android-import.json"',
    "cache-control": "no-store",
  });
  res.end(body);
}
// 按 updatedAt 逐题合并，保留两端的全部题目（不再整数组覆盖）。
function mergeQuestions(base, incoming) {
  let map = new Map(base.map((q) => [String(q.id), q]));
  (incoming || []).forEach((r) => {
    let id = String((r && r.id) || "");
    if (!id) return;
    let local = map.get(id);
    if (local?.deletedAt && !r.deletedAt) return;
    if (
      r.deletedAt ||
      !local ||
      String(r.updatedAt || "") > String(local.updatedAt || "")
    )
      map.set(id, r);
  });
  return [...map.values()];
}
function mergeState(incoming) {
  let done = { ...syncState.done };
  for (let [date, ids] of Object.entries(incoming.done || {}))
    done[date] = [
      ...new Set([...(done[date] || []), ...(Array.isArray(ids) ? ids : [])]),
    ];
  let merged = mergeQuestions(syncState.questions, incoming.questions);
  syncState = {
    ...syncState,
    deviceId: incoming.deviceId || syncState.deviceId,
    sync: { ...syncState.sync, ...(incoming.sync || {}) },
    plan: { ...syncState.plan, ...(incoming.plan || {}) },
    dayPlan: { ...syncState.dayPlan, ...(incoming.dayPlan || {}) },
    questions: merged,
    done,
    assets: Array.isArray(incoming.assets) ? incoming.assets : syncState.assets,
    subjectConfig: {
      ...syncState.subjectConfig,
      ...(incoming.subjectConfig || {}),
    },
  };
  saveStore();
  return syncState;
}
function syncUrls() {
  let ips = [];
  for (let list of Object.values(os.networkInterfaces()))
    for (let item of list || [])
      if (item && item.family === "IPv4" && !item.internal)
        ips.push(item.address);
  return [...new Set(ips)].map((ip) => `http://${ip}:${SYNC_PORT}`);
}
function startSyncServer() {
  let server = http.createServer((req, res) => {
    req.on("error", () => {
      if (!res.headersSent) reply(res, 400, { error: "bad request" });
      else res.destroy();
    });
    res.on("error", () => {});
    if (req.method === "OPTIONS") {
      reply(res, 204, {});
      return;
    }
    let requestUrl = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`,
    );
    if (req.method === "GET" && requestUrl.pathname === "/mobile") {
      res.writeHead(302, { location: "/mobile/" });
      res.end();
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/mobile/") {
      let p = path.join(MOBILE_ROOT, "index.html");
      textReply(res, 200, fs.readFileSync(p), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && requestUrl.pathname.startsWith("/mobile/")) {
      let p = mobileAssetPath(requestUrl.pathname);
      if (!p || !fs.existsSync(p)) {
        textReply(res, 404, "Not found");
        return;
      }
      let type = p.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "application/javascript; charset=utf-8";
      textReply(res, 200, fs.readFileSync(p), type);
      return;
    }
    if (!isAuthorized(req)) {
      reply(res, 401, { error: "unauthorized" });
      return;
    }
    if (
      req.method === "GET" &&
      requestUrl.pathname.startsWith("/attachments/")
    ) {
      let name = path.basename(requestUrl.pathname),
        p = path.join(ATTACHMENT_ROOT, name),
        meta = (syncState.questions || [])
          .filter((q) => !q.deletedAt)
          .map((q) => q.attachment)
          .find((a) => a?.fileName === name);
      if (!meta || !fs.existsSync(p)) {
        textReply(res, 404, "Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": meta.type || "application/octet-stream",
        "content-disposition": `inline; filename="${encodeURIComponent(meta.name || name)}"`,
        "cache-control": "private, max-age=300",
      });
      fs.createReadStream(p).pipe(res);
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/info") {
      reply(res, 200, {
        ok: true,
        count: syncState.questions.filter((q) => !q.deletedAt).length,
        dataRoot: DATA_ROOT,
      });
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/config") {
      reply(res, 200, { subjectConfig: syncState.subjectConfig || {} });
      return;
    }
    if (
      req.method === "DELETE" &&
      requestUrl.pathname.startsWith("/api/questions/")
    ) {
      let id = decodeURIComponent(
        requestUrl.pathname.slice("/api/questions/".length),
      );
      if (!removeQuestion(id)) {
        reply(res, 404, { error: "question not found" });
        return;
      }
      reply(res, 200, { ok: true, id });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/questions") {
      addMobileQuestion(req, res);
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/export") {
      exportAndroid(res);
      return;
    }
    if (req.method === "GET") {
      reply(res, 200, publicState());
      return;
    }
    if (req.method === "POST") {
      let body = "",
        aborted = false;
      req.on("data", (chunk) => {
        if (aborted) return;
        body += chunk;
        if (Buffer.byteLength(body) > 30_000_000) {
          aborted = true;
          reply(res, 413, { error: "payload too large" });
          req.destroy();
        }
      });
      req.on("end", () => {
        if (aborted) return;
        let data = {};
        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          reply(res, 400, { error: "invalid json" });
          return;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          reply(res, 400, { error: "invalid body" });
          return;
        }
        try {
          reply(res, 200, mergeState(data));
        } catch {
          reply(res, 400, { error: "invalid sync payload" });
        }
      });
      return;
    }
    reply(res, 405, { error: "method not allowed" });
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE")
      console.error(`同步端口 ${SYNC_PORT} 已被占用：请关闭旧实例后重试。`);
    else console.error("同步服务异常：", err.message);
  });
  server.listen(SYNC_PORT, "0.0.0.0");
}
function create() {
  const indexPath = path.join(__dirname, "index.html");
  const w = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 650,
    backgroundColor: "#f7f8f5",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("blob:")) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      },
    };
  });
  w.webContents.on("will-navigate", (event, url) => {
    if (url !== w.webContents.getURL()) event.preventDefault();
  });
  w.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  w.loadFile(indexPath);
}

ipcMain.handle("shiti-sync-info", () => ({
  port: SYNC_PORT,
  loopback: `http://127.0.0.1:${SYNC_PORT}`,
  lanUrls: syncUrls(),
  token: authToken,
}));
ipcMain.handle("shiti-generate-exam", (_event, payload) =>
  generateExam(payload),
);
ipcMain.handle("shiti-exam-history", () => readExamHistory());
ipcMain.handle("shiti-open-exam-file", async (_event, filePath) => {
  let resolved = path.resolve(String(filePath || "")),
    root = path.resolve(EXAM_ROOT) + path.sep;
  if (
    !resolved.startsWith(root) ||
    path.extname(resolved).toLowerCase() !== ".pdf" ||
    !fs.existsSync(resolved)
  )
    throw new Error("invalid exam file");
  return shell.openPath(resolved);
});

const gotLock =
  app.requestSingleInstanceLock && app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  app.whenReady().then(() => {
    ensureDataRoot();
    loadStore();
    loadToken();
    startDiscovery(authToken, SYNC_PORT);
    startSyncServer();
    create();
    app.on("activate", () => BrowserWindow.getAllWindows().length || create());
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
