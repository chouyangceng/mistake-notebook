const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

function request(port, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shiti-token": token,
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("timeout")));
    req.end(body);
  });
}
function get(port, token, urlPath) {
  return new Promise((resolve, reject) => {
    let req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: urlPath,
        headers: { "x-shiti-token": token },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
function remove(port, token, id) {
  return new Promise((resolve, reject) => {
    let req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `/api/questions/${encodeURIComponent(id)}`,
        method: "DELETE",
        headers: { "x-shiti-token": token },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
function postQuestion(port, token, payload) {
  let body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    let req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/questions",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-shiti-token": token,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shiti-sync-server-"));
  const token = "sync-test-token-123456";
  const port = 24000 + Math.floor(Math.random() * 10000);
  fs.writeFileSync(path.join(root, "sync-token.txt"), token);
  const child = spawn(process.execPath, ["mobile-server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, SHITI_DATA_ROOT: root, SHITI_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(
        () => reject(new Error(`server start timeout: ${text}`)),
        5000,
      );
      child.stdout.on("data", (chunk) => {
        text += chunk;
        if (text.includes("已启动"))
          setTimeout(() => {
            clearTimeout(timer);
            resolve();
          }, 150);
      });
      child.once("exit", (code) => reject(new Error(`server exited: ${code}`)));
    });
    const invalid = await request(port, token, "null");
    assert.equal(invalid.status, 400);
    assert.equal(child.exitCode, null);
    const valid = await request(port, token, "{}");
    assert.equal(valid.status, 200);
    const config = await get(port, token, "/api/config");
    assert.equal(config.status, 200);
    assert.equal(typeof JSON.parse(config.body).subjectConfig, "object");
    const staleQuestion = {
      id: "delete-regression",
      subject: "数学",
      module: "高数",
      updatedAt: "2026-08-12T00:00:00.000Z",
      deletedAt: null,
    };
    assert.equal(
      (
        await request(
          port,
          token,
          JSON.stringify({ questions: [staleQuestion] }),
        )
      ).status,
      200,
    );
    assert.equal((await remove(port, token, staleQuestion.id)).status, 200);
    assert.equal(
      (
        await request(
          port,
          token,
          JSON.stringify({ questions: [staleQuestion] }),
        )
      ).status,
      200,
    );
    const state = JSON.parse((await get(port, token, "/")).body);
    assert.ok(
      state.questions.find((item) => item.id === staleQuestion.id)?.deletedAt,
      "删除墓碑必须阻止旧副本复活",
    );
    const created = await postQuestion(port, token, {
      clientId: "offline-test-1234",
      subject: "数学",
      knowledgePath: ["高等数学", "第一章"],
      questionType: "选择题",
      title: "离线新增",
      question: "1+1=?",
    });
    assert.equal(created.status, 201);
    const createdBody = JSON.parse(created.body);
    const updated = await postQuestion(port, token, {
      clientId: "offline-test-1234",
      serverId: createdBody.id,
      subject: "数学",
      knowledgePath: ["高等数学", "第一章"],
      questionType: "填空题",
      title: "离线编辑后同步",
      question: "1+1=2",
    });
    assert.equal(updated.status, 200);
    assert.equal(JSON.parse(updated.body).updated, true);
    const afterUpdate = JSON.parse((await get(port, token, "/")).body);
    assert.equal(
      afterUpdate.questions.find((item) => item.id === createdBody.id)?.title,
      "离线编辑后同步",
      "手机同步后的编辑必须更新原题而非生成重复题",
    );
    console.log("sync-server tests passed");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
