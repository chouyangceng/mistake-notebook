const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const startDiscovery = require("./discovery-server");

const PORT = Number(process.env.SHITI_PORT) || 17332;
const DATA_ROOT = process.env.SHITI_DATA_ROOT || "E:\\错题本数据";
const ATTACHMENTS = path.join(DATA_ROOT, "attachments");
const MOBILE = path.join(__dirname, "mobile");
const empty = {
  deviceId: "windows-server",
  sync: { endpoint: "", userId: "local", lastSync: "" },
  subjectConfig: {},
  questions: [],
  plan: { dailyTotal: 6, rows: {} },
  done: {},
  dayPlan: { date: "", sig: "", ids: [] },
  assets: [],
};
let state = { ...empty };
let token = "";

function init() {
  fs.mkdirSync(ATTACHMENTS, { recursive: true });
  try {
    state = {
      ...empty,
      ...JSON.parse(
        fs.readFileSync(path.join(DATA_ROOT, "sync-store.json"), "utf8"),
      ),
    };
  } catch {}
  try {
    token = fs
      .readFileSync(path.join(DATA_ROOT, "sync-token.txt"), "utf8")
      .trim();
  } catch {}
  if (!token) {
    token = crypto.randomBytes(18).toString("hex");
    fs.writeFileSync(path.join(DATA_ROOT, "sync-token.txt"), token, {
      mode: 0o600,
    });
  }
}

function save() {
  const temp = path.join(DATA_ROOT, "sync-store.json.tmp");
  const target = path.join(DATA_ROOT, "sync-store.json");
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, target);
}

function json(res, code, data, headers = {}) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-shiti-token",
    ...headers,
  });
  res.end(code === 204 ? "" : JSON.stringify(data));
}

function body(req, res) {
  return new Promise((resolve) => {
    let text = "";
    let failed = false;
    req.on("data", (chunk) => {
      text += chunk;
      if (Buffer.byteLength(text) > 35e6 && !failed) {
        failed = true;
        json(res, 413, { error: "payload too large" });
        req.destroy();
        resolve(undefined);
      }
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        json(res, 400, { error: "invalid json" });
        resolve(undefined);
      }
    });
  });
}

function safe(name, mime) {
  const ext =
    mime === "application/pdf"
      ? ".pdf"
      : {
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/gif": ".gif",
          "image/webp": ".webp",
        }[mime] || ".img";
  const base =
    path
      .basename(name, path.extname(name))
      .replace(/[^\p{L}\p{N}_-]/gu, "-")
      .slice(0, 60) || "file";
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
}

function allowedFile(mime, buffer) {
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

function authed(req) {
  const supplied = Buffer.from(String(req.headers["x-shiti-token"] || ""));
  const expected = Buffer.from(token);
  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

function merge(incoming) {
  const map = new Map(
    (state.questions || []).map((question) => [String(question.id), question]),
  );
  for (const question of incoming.questions || []) {
    const id = String(question?.id || "");
    if (!id) continue;
    const old = map.get(id);
    if (old?.deletedAt && !question.deletedAt) continue;
    if (
      question.deletedAt ||
      !old ||
      String(question.updatedAt || "") > String(old.updatedAt || "")
    )
      map.set(id, question);
  }
  state = {
    ...state,
    ...incoming,
    questions: [...map.values()],
    subjectConfig: {
      ...state.subjectConfig,
      ...(incoming.subjectConfig || {}),
    },
  };
  save();
  return state;
}

function removeQuestion(id) {
  id = String(id || "");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return false;
  const index = (state.questions || []).findIndex(
    (question) => String(question.id) === id,
  );
  const item = index >= 0 ? state.questions[index] : null;
  const stamp = new Date().toISOString();
  const fileName = item?.attachment?.fileName;
  const tombstone = {
    id,
    deletedAt: stamp,
    updatedAt: stamp,
    version: (+item?.version || 0) + 1,
  };
  if (index >= 0) state.questions[index] = tombstone;
  else state.questions.unshift(tombstone);
  if (
    fileName &&
    !state.questions.some(
      (question) =>
        !question.deletedAt && question.attachment?.fileName === fileName,
    )
  ) {
    try {
      fs.unlinkSync(path.join(ATTACHMENTS, path.basename(fileName)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  save();
  return true;
}

function activeSubject(value) {
  const subject = String(value || "数学").trim();
  return ["英语", "数学", "822控制"].includes(subject) ? subject : "数学";
}

async function addMobileQuestion(req, res) {
  const data = await body(req, res);
  if (!data) return;
  const clientId = String(data.clientId || "");
  const serverId = String(data.serverId || "");
  if (clientId && !/^[A-Za-z0-9_-]{8,100}$/.test(clientId))
    return json(res, 400, { error: "invalid client id" });
  if (serverId && !/^[A-Za-z0-9_-]{1,200}$/.test(serverId))
    return json(res, 400, { error: "invalid server id" });
  const id =
    serverId ||
    (clientId
      ? `mobile-${clientId}`
      : `mobile-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
  const existingIndex = state.questions.findIndex(
    (question) => String(question.id) === id,
  );
  const existing = existingIndex >= 0 ? state.questions[existingIndex] : null;
  if (existing?.deletedAt)
    return json(res, 409, { error: "question was deleted on desktop" });
  const subject = activeSubject(data.subject);
  const title = String(data.title || "手机上传错题")
    .trim()
    .slice(0, 120);
  const question = String(data.question || "")
    .trim()
    .slice(0, 20_000);
  if (!question && !data.file?.data && !existing?.attachment)
    return json(res, 400, { error: "question or file required" });
  let attachment = data.attachmentRemoved ? null : existing?.attachment || null;
  const oldFile = existing?.attachment?.fileName || "";
  if (data.file?.data) {
    const match = String(data.file.data).match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return json(res, 400, { error: "invalid attachment" });
    const mime = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 25e6)
      return json(res, 413, { error: "attachment too large" });
    if (!allowedFile(mime, buffer))
      return json(res, 415, {
        error: "only valid jpeg, png, gif, webp or pdf files are allowed",
      });
    const fileName = safe(data.file.name || "attachment", mime);
    fs.writeFileSync(path.join(ATTACHMENTS, fileName), buffer);
    attachment = {
      id: `file-${Date.now()}`,
      name: String(data.file.name || fileName).slice(0, 160),
      type: mime,
      fileName,
      size: buffer.length,
    };
  }
  const stamp = new Date().toISOString();
  const knowledgePath = (
    Array.isArray(data.knowledgePath)
      ? data.knowledgePath
      : [data.module, data.unit]
  )
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, 60),
    )
    .filter(Boolean)
    .slice(0, 8);
  if (!knowledgePath.length)
    return json(res, 400, { error: "knowledge classification required" });
  const item = {
    ...(existing || {}),
    id,
    subject,
    knowledgePath,
    module: knowledgePath[0],
    unit: knowledgePath[1] || "",
    questionType: String(data.questionType || "未分类题型")
      .trim()
      .slice(0, 30),
    topic: (Array.isArray(data.topic)
      ? data.topic
      : String(data.topic || "未分类").split(",")
    )
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, 20),
    tags: (Array.isArray(data.tags)
      ? data.tags
      : String(data.tags || "手机上传").split(",")
    )
      .map((value) => String(value).trim())
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
  if (existingIndex >= 0) state.questions[existingIndex] = item;
  else state.questions.unshift(item);
  if (
    oldFile &&
    oldFile !== attachment?.fileName &&
    !state.questions.some(
      (questionItem) =>
        !questionItem.deletedAt &&
        questionItem.attachment?.fileName === oldFile,
    )
  ) {
    try {
      fs.unlinkSync(path.join(ATTACHMENTS, path.basename(oldFile)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  save();
  json(res, existing ? 200 : 201, {
    ok: true,
    id: item.id,
    updated: Boolean(existing),
    question: item,
  });
}

function ips() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const item of list || [])
      if (item.family === "IPv4" && !item.internal)
        out.push(`http://${item.address}:${PORT}/mobile/`);
  return [...new Set(out)];
}

init();
startDiscovery(token, PORT);
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && url.pathname === "/mobile") {
      res.writeHead(302, { location: "/mobile/" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/mobile/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(fs.readFileSync(path.join(MOBILE, "index.html")));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/mobile/")) {
      const name = path.basename(url.pathname);
      if (!["mobile.css", "mobile-extra.css", "mobile.js"].includes(name)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(fs.readFileSync(path.join(MOBILE, name)));
      return;
    }
    if (!authed(req)) return json(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && url.pathname.startsWith("/attachments/")) {
      const name = path.basename(url.pathname);
      const meta = state.questions
        .filter((question) => !question.deletedAt)
        .map((question) => question.attachment)
        .find((attachment) => attachment?.fileName === name);
      if (!meta || !fs.existsSync(path.join(ATTACHMENTS, name))) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": meta.type || "application/octet-stream",
        "content-disposition": `inline; filename="${encodeURIComponent(meta.name || name)}"`,
        "x-content-type-options": "nosniff",
      });
      fs.createReadStream(path.join(ATTACHMENTS, name)).pipe(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/info")
      return json(res, 200, {
        ok: true,
        count: state.questions.filter((question) => !question.deletedAt).length,
      });
    if (req.method === "GET" && url.pathname === "/api/config")
      return json(res, 200, { subjectConfig: state.subjectConfig || {} });
    if (req.method === "DELETE" && url.pathname.startsWith("/api/questions/")) {
      const id = decodeURIComponent(
        url.pathname.slice("/api/questions/".length),
      );
      return removeQuestion(id)
        ? json(res, 200, { ok: true, id })
        : json(res, 404, { error: "question not found" });
    }
    if (req.method === "POST" && url.pathname === "/api/questions")
      return addMobileQuestion(req, res);
    if (req.method === "GET" && url.pathname === "/api/export") {
      const data = JSON.stringify(
        {
          ...state,
          questions: state.questions.filter((question) => !question.deletedAt),
          exportedAt: new Date().toISOString(),
          format: "shiti-android-v2",
        },
        null,
        2,
      );
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="shiti-android-import.json"',
      });
      res.end(data);
      return;
    }
    if (req.method === "GET") return json(res, 200, state);
    if (req.method === "POST") {
      const data = await body(req, res);
      if (data === undefined) return;
      return data && typeof data === "object" && !Array.isArray(data)
        ? json(res, 200, merge(data))
        : json(res, 400, { error: "invalid body" });
    }
    json(res, 405, { error: "method not allowed" });
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(
      `拾题手机服务已启动\n${ips().join("\n")}\n数据目录: ${DATA_ROOT}\n令牌文件: ${path.join(DATA_ROOT, "sync-token.txt")}`,
    );
  });
