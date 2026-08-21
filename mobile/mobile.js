const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const ACTIVE_SUBJECTS = ["英语", "数学", "822控制"];
const DB_NAME = "shiti-mobile-drafts";
const DB_VERSION = 2;
const STORE = "questions";
const endpointKey = "shiti-mobile-endpoint";
const tokenKey = "shiti-mobile-token";
const configKey = "shiti-mobile-subject-config";
const configCustomKey = "shiti-mobile-config-customized";
const CONFIG_SCHEMA_VERSION = 2;

let selectedFile = null;
let selectedFileData = "";
let selectedImageSource = null;
let selectedAnswerFile = null;
let selectedAnswerFileData = "";
let selectedAnswerImageSource = null;
let editingId = "";
let removeExistingFile = false;
let removeExistingAnswerFile = false;
let editingKnowledgePath = [];
let textPromptResolver = null;
const cropState = {
  image: null,
  source: null,
  target: "question",
  ratioMode: "free",
  viewportWidth: 0,
  viewportHeight: 0,
  cropBox: { x: 0, y: 0, width: 120, height: 120 },
  minScale: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  pointers: new Map(),
  gesture: null,
  boxGesture: null,
  interactionMode: "image",
  returnFocus: null,
};

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const now = () => new Date().toISOString();
const newId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const allowedType = (type) =>
  [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ].includes(String(type).toLowerCase());
const node = (name, children = []) => ({ id: newId(), name, children });
let mobileConfig = loadConfig();

function fallbackConfig() {
  return {
    英语: {
      knowledgeTree: ["阅读", "翻译", "作文"].map((name) => node(name)),
      questionTypes: ["阅读", "翻译", "作文"],
      examEnabled: false,
    },
    数学: {
      knowledgeTree: ["高等数学", "线性代数", "概率论"].map((name) =>
        node(name),
      ),
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
      ].map((name) => node(name)),
      questionTypes: ["选择题", "大题"],
      examEnabled: true,
    },
  };
}

function normalizeNode(raw) {
  if (typeof raw === "string") return node(raw);
  const name = String(raw?.name || "").trim();
  if (!name) return null;
  return {
    id: String(raw.id || newId()),
    name,
    children: (Array.isArray(raw.children) ? raw.children : [])
      .map(normalizeNode)
      .filter(Boolean),
  };
}

function normalizeConfig(raw) {
  const base = fallbackConfig();
  const out = {};
  const legacy = Number(raw?._schemaVersion || 0) < CONFIG_SCHEMA_VERSION;
  for (const subject of ACTIVE_SUBJECTS) {
    const source = raw?.[subject];
    const knowledgeTree = Array.isArray(source)
      ? source.map(normalizeNode).filter(Boolean)
      : (Array.isArray(source?.knowledgeTree)
          ? source.knowledgeTree
          : base[subject].knowledgeTree
        )
          .map(normalizeNode)
          .filter(Boolean);
    const questionTypes = Array.isArray(source?.questionTypes)
      ? [
          ...new Set(
            source.questionTypes
              .map((item) =>
                String(
                  typeof item === "string" ? item : item?.name || "",
                ).trim(),
              )
              .filter(Boolean),
          ),
        ]
      : [...base[subject].questionTypes];
    out[subject] = {
      knowledgeTree,
      questionTypes,
      examEnabled: subject !== "英语",
    };
    if (legacy && subject === "英语") {
      out[subject].knowledgeTree = out[subject].knowledgeTree.filter(
        (item) => item.name !== "小三门",
      );
      for (const required of base.英语.knowledgeTree) {
        if (
          !out[subject].knowledgeTree.some(
            (item) => item.name === required.name,
          )
        )
          out[subject].knowledgeTree.push(normalizeNode(required));
      }
      out[subject].questionTypes = out[subject].questionTypes.filter(
        (type) => type !== "小三门",
      );
      for (const required of base.英语.questionTypes) {
        if (!out[subject].questionTypes.includes(required))
          out[subject].questionTypes.push(required);
      }
    }
  }
  out._schemaVersion = CONFIG_SCHEMA_VERSION;
  return out;
}

function loadConfig() {
  try {
    return normalizeConfig(
      JSON.parse(localStorage.getItem(configKey) || "null"),
    );
  } catch {
    return normalizeConfig(null);
  }
}

function saveConfig(customized = false) {
  mobileConfig = normalizeConfig(mobileConfig);
  localStorage.setItem(configKey, JSON.stringify(mobileConfig));
  if (customized) localStorage.setItem(configCustomKey, "1");
}

function message(text, ok = false) {
  const el = $("#message");
  el.textContent = text;
  el.className = `message ${ok ? "ok" : "error"}`;
}

function askText(title, hint) {
  if (textPromptResolver) textPromptResolver(null);
  $("#mobileTextPromptTitle").textContent = title;
  $("#mobileTextPromptHint").textContent = hint;
  $("#mobileTextPromptInput").value = "";
  $("#mobileTextPrompt").classList.add("show");
  setTimeout(() => $("#mobileTextPromptInput").focus(), 0);
  return new Promise((resolve) => (textPromptResolver = resolve));
}

function closeTextPrompt(value = null) {
  $("#mobileTextPrompt").classList.remove("show");
  const resolve = textPromptResolver;
  textPromptResolver = null;
  if (resolve) resolve(value);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const target = db.objectStoreNames.contains(STORE)
        ? event.target.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "id" });
      if (db.objectStoreNames.contains("drafts")) {
        const source = event.target.transaction.objectStore("drafts");
        source.openCursor().onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          const value = cursor.value || {};
          target.put({
            ...value,
            id: String(value.id || newId()),
            syncStatus: "pending",
            source: "mobile",
            updatedAt: value.updatedAt || now(),
            createdAt: value.createdAt || now(),
            deletedAt: null,
          });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function questionPut(question) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(question);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function questionDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function questionGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function questionsAll(includeDeleted = false) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => {
      db.close();
      const rows = request.result.filter(
        (item) => includeDeleted || !item.deletedAt,
      );
      resolve(
        rows.sort((a, b) =>
          String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
        ),
      );
    };
    request.onerror = () => reject(request.error);
  });
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(data) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = data;
  });
}

function cropRatio() {
  if (cropState.ratioMode === "free") return null;
  if (cropState.ratioMode === "source") {
    return cropState.image.naturalWidth / cropState.image.naturalHeight;
  }
  return Number(cropState.ratioMode) || 1;
}

function clampCropPosition() {
  const position = CropUtils.clampImageToCropBox(
    cropState.offsetX,
    cropState.offsetY,
    cropState.image.naturalWidth,
    cropState.image.naturalHeight,
    cropState.scale,
    cropState.cropBox,
  );
  cropState.offsetX = position.x;
  cropState.offsetY = position.y;
}

function syncCropZoom() {
  const progress = Math.log(cropState.scale / cropState.minScale) / Math.log(6);
  $("#cropZoom").value = String(Math.round(CropUtils.clamp(progress, 0, 1) * 100));
}

function renderCropCanvas() {
  if (!cropState.image || !cropState.viewportWidth) return;
  const canvas = $("#cropCanvas");
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(cropState.viewportWidth * density));
  const pixelHeight = Math.max(1, Math.round(cropState.viewportHeight * density));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${cropState.viewportWidth}px`;
  canvas.style.height = `${cropState.viewportHeight}px`;
  const context = canvas.getContext("2d");
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, cropState.viewportWidth, cropState.viewportHeight);
  context.fillStyle = "#171d19";
  context.fillRect(0, 0, cropState.viewportWidth, cropState.viewportHeight);
  context.drawImage(
    cropState.image,
    cropState.offsetX,
    cropState.offsetY,
    cropState.image.naturalWidth * cropState.scale,
    cropState.image.naturalHeight * cropState.scale,
  );
  const selection = $("#cropSelection");
  selection.style.left = `${cropState.cropBox.x}px`;
  selection.style.top = `${cropState.cropBox.y}px`;
  selection.style.width = `${cropState.cropBox.width}px`;
  selection.style.height = `${cropState.cropBox.height}px`;
}

function sizeCropViewport(reset = false) {
  if (!cropState.image || !$("#imageCropper").classList.contains("show")) return;
  const stage = $("#cropperStage").getBoundingClientRect();
  const oldWidth = cropState.viewportWidth;
  const oldHeight = cropState.viewportHeight;
  const oldScale = cropState.scale;
  const oldBox = { ...cropState.cropBox };
  const oldCenterX = oldWidth
    ? (oldBox.x + oldBox.width / 2 - cropState.offsetX) / oldScale
    : cropState.image.naturalWidth / 2;
  const oldCenterY = oldHeight
    ? (oldBox.y + oldBox.height / 2 - cropState.offsetY) / oldScale
    : cropState.image.naturalHeight / 2;
  const oldZoom = cropState.minScale ? oldScale / cropState.minScale : 1;
  cropState.viewportWidth = Math.max(1, stage.width);
  cropState.viewportHeight = Math.max(1, stage.height);
  if (reset || !oldWidth || !oldHeight) {
    const ratio = cropRatio();
    const availableWidth = Math.max(80, cropState.viewportWidth * 0.72);
    const availableHeight = Math.max(80, cropState.viewportHeight * 0.72);
    const freeSize = Math.max(
      96,
      Math.min(cropState.viewportWidth, cropState.viewportHeight) * 0.56,
    );
    const fitted = ratio
      ? CropUtils.fitViewport(availableWidth, availableHeight, ratio)
      : {
          width: freeSize,
          height: freeSize,
        };
    cropState.cropBox = {
      x: (cropState.viewportWidth - fitted.width) / 2,
      y: (cropState.viewportHeight - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    };
  } else {
    const scaleX = cropState.viewportWidth / oldWidth;
    const scaleY = cropState.viewportHeight / oldHeight;
    cropState.cropBox = CropUtils.clampCropBox(
      {
        x: oldBox.x * scaleX,
        y: oldBox.y * scaleY,
        width: oldBox.width * scaleX,
        height: oldBox.height * scaleY,
      },
      cropState.viewportWidth,
      cropState.viewportHeight,
      72,
    );
  }
  cropState.minScale = CropUtils.minimumScale(
    cropState.image.naturalWidth,
    cropState.image.naturalHeight,
    cropState.cropBox.width,
    cropState.cropBox.height,
  );
  cropState.scale = reset
    ? Math.min(cropState.minScale * 1.08, cropState.minScale * 6)
    : CropUtils.clamp(
        cropState.minScale * oldZoom,
        cropState.minScale,
        cropState.minScale * 6,
      );
  const centerX = reset ? cropState.image.naturalWidth / 2 : oldCenterX;
  const centerY = reset ? cropState.image.naturalHeight / 2 : oldCenterY;
  cropState.offsetX =
    cropState.cropBox.x +
    cropState.cropBox.width / 2 -
    centerX * cropState.scale;
  cropState.offsetY =
    cropState.cropBox.y +
    cropState.cropBox.height / 2 -
    centerY * cropState.scale;
  clampCropPosition();
  syncCropZoom();
  renderCropCanvas();
}

function applyCropScale(scale, pointX, pointY) {
  const nextScale = CropUtils.clamp(
    scale,
    cropState.minScale,
    cropState.minScale * 6,
  );
  const zoomed = CropUtils.zoomAtPoint(
    cropState,
    nextScale,
    pointX,
    pointY,
  );
  cropState.scale = zoomed.scale;
  cropState.offsetX = zoomed.offsetX;
  cropState.offsetY = zoomed.offsetY;
  clampCropPosition();
  syncCropZoom();
  renderCropCanvas();
}

function applyCropBox(nextBox) {
  cropState.cropBox = CropUtils.clampCropBox(
    nextBox,
    cropState.viewportWidth,
    cropState.viewportHeight,
    72,
  );
  const nextMinimum = CropUtils.minimumScale(
    cropState.image.naturalWidth,
    cropState.image.naturalHeight,
    cropState.cropBox.width,
    cropState.cropBox.height,
  );
  cropState.minScale = nextMinimum;
  if (cropState.scale < nextMinimum) {
    applyCropScale(
      nextMinimum,
      cropState.cropBox.x + cropState.cropBox.width / 2,
      cropState.cropBox.y + cropState.cropBox.height / 2,
    );
    return;
  }
  cropState.scale = Math.min(cropState.scale, cropState.minScale * 6);
  clampCropPosition();
  syncCropZoom();
  renderCropCanvas();
}

function setCropInteractionMode(mode, announce = true) {
  cropState.interactionMode = mode === "box" ? "box" : "image";
  const movingBox = cropState.interactionMode === "box";
  $$('[data-crop-mode]').forEach((button) => {
    const active = button.dataset.cropMode === cropState.interactionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#imageCropper").classList.toggle("crop-mode-box", movingBox);
  $("#cropCanvas").setAttribute(
    "aria-label",
    movingBox
      ? "图片裁剪区域：单指拖动白色选框，双指缩放照片"
      : "图片裁剪区域：单指拖动照片选择保留部位，双指缩放照片",
  );
  $("#cropGuide").textContent = movingBox
    ? "单指拖动白框调整裁剪位置；拖四角改变范围。"
    : "单指拖动照片，准确选择要保留的部位；双指可缩放。";
  $("#cropStageHint").innerHTML = movingBox
    ? "<strong>拖动白框</strong><span>调整裁剪位置，四角可改变范围</span>"
    : "<strong>拖动照片</strong><span>让要保留的内容进入白框</span>";
  if (announce) {
    $("#cropStatus").textContent = movingBox
      ? "当前：移动选框"
      : "当前：移动照片";
  }
}

function nudgeCrop(direction, amount = 12) {
  const deltas = {
    left: [-amount, 0],
    right: [amount, 0],
    up: [0, -amount],
    down: [0, amount],
  };
  const [deltaX, deltaY] = deltas[direction] || [0, 0];
  if (cropState.interactionMode === "box") {
    applyCropBox(
      CropUtils.moveCropBox(
        cropState.cropBox,
        deltaX,
        deltaY,
        cropState.viewportWidth,
        cropState.viewportHeight,
      ),
    );
  } else {
    cropState.offsetX += deltaX;
    cropState.offsetY += deltaY;
    clampCropPosition();
    renderCropCanvas();
  }
  $("#cropStatus").textContent =
    cropState.interactionMode === "box" ? "已微调选框位置" : "已微调照片位置";
}

async function openImageCropper(source, target = "question") {
  try {
    const image = await loadImage(source.data);
    cropState.image = image;
    cropState.source = { ...source };
    cropState.target = target;
    cropState.ratioMode = "free";
    cropState.interactionMode = "image";
    cropState.pointers.clear();
    cropState.gesture = null;
    cropState.boxGesture = null;
    cropState.returnFocus = document.activeElement;
    $$("[data-crop-ratio]").forEach((button) => {
      const active = button.dataset.cropRatio === "free";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#cropStatus").textContent = "拍照完成，请拖动照片选择要保留的部位";
    $("#cropperTitle").textContent =
      target === "answer" ? "裁剪答案图片" : "裁剪题目图片";
    $("#imageCropper").classList.add("show");
    $("#imageCropper").setAttribute("aria-hidden", "false");
    document.body.classList.add("cropper-open");
    setCropInteractionMode("image", false);
    requestAnimationFrame(() => {
      sizeCropViewport(true);
      $("#cancelCropBtn").focus();
    });
  } catch {
    ["#file", "#questionCameraFile", "#answerFile", "#answerCameraFile"].forEach(
      (selector) => {
        $(selector).value = "";
      },
    );
    message("图片读取失败，请重新选择或换一张图片");
  }
}

function closeImageCropper(restoreFocus = true) {
  $("#imageCropper").classList.remove("show");
  $("#imageCropper").setAttribute("aria-hidden", "true");
  document.body.classList.remove("cropper-open");
  cropState.pointers.clear();
  cropState.gesture = null;
  cropState.boxGesture = null;
  ["#file", "#questionCameraFile", "#answerFile", "#answerCameraFile"].forEach(
    (selector) => {
      $(selector).value = "";
    },
  );
  if (restoreFocus) cropState.returnFocus?.focus?.();
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function createCroppedFile() {
  const sourceX = CropUtils.clamp(
    (cropState.cropBox.x - cropState.offsetX) / cropState.scale,
    0,
    cropState.image.naturalWidth,
  );
  const sourceY = CropUtils.clamp(
    (cropState.cropBox.y - cropState.offsetY) / cropState.scale,
    0,
    cropState.image.naturalHeight,
  );
  const sourceWidth = Math.min(
    cropState.cropBox.width / cropState.scale,
    cropState.image.naturalWidth - sourceX,
  );
  const sourceHeight = Math.min(
    cropState.cropBox.height / cropState.scale,
    cropState.image.naturalHeight - sourceY,
  );
  const outputSize = CropUtils.outputSize(sourceWidth, sourceHeight);
  const output = document.createElement("canvas");
  output.width = outputSize.width;
  output.height = outputSize.height;
  const context = output.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    cropState.image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height,
  );
  let blob = await canvasBlob(output, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") {
    const jpeg = document.createElement("canvas");
    jpeg.width = output.width;
    jpeg.height = output.height;
    const jpegContext = jpeg.getContext("2d");
    jpegContext.fillStyle = "#fff";
    jpegContext.fillRect(0, 0, jpeg.width, jpeg.height);
    jpegContext.drawImage(output, 0, 0);
    blob = await canvasBlob(jpeg, "image/jpeg", 0.88);
  }
  if (!blob) throw new Error("图片压缩失败");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const baseName = String(cropState.source.name || "题目图片")
    .replace(/\.[^.]+$/, "")
    .slice(0, 80);
  return new File([blob], `${baseName}-裁剪.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function cropPointerPoint(event) {
  const rect = $("#cropCanvas").getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startCropGesture() {
  if (cropState.pointers.size < 2) {
    cropState.gesture = null;
    return;
  }
  const [first, second] = [...cropState.pointers.values()];
  const midpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
  cropState.gesture = {
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    midpoint,
    scale: cropState.scale,
    offsetX: cropState.offsetX,
    offsetY: cropState.offsetY,
  };
}

function currentSubjectConfig() {
  return mobileConfig[$("#mobileSubject").value] || mobileConfig.数学;
}

function findNode(tree, path) {
  let list = tree || [];
  let found = null;
  for (const name of path) {
    found = list.find((item) => item.name === name);
    if (!found) return null;
    list = found.children || [];
  }
  return found;
}

function listAtPath(subject, parentPath) {
  if (!parentPath.length) return mobileConfig[subject]?.knowledgeTree;
  return (
    findNode(mobileConfig[subject]?.knowledgeTree, parentPath)?.children || null
  );
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
  if (!pathStartsWith(path, sourcePath))
    return Array.isArray(path) ? [...path] : [];
  return [...destinationPath, ...path.slice(sourcePath.length)];
}

function flattenTree(tree, parents = []) {
  return (Array.isArray(tree) ? tree : []).flatMap((item) => {
    const path = [...parents, item.name];
    return [{ item, path }, ...flattenTree(item.children, path)];
  });
}

function renameTaxonomyNode(subject, path, nextName) {
  const parent = path.slice(0, -1);
  const list = listAtPath(subject, parent);
  const clean = String(nextName || "").trim();
  if (!list || !clean) return null;
  const current = list.find((item) => item.name === path.at(-1));
  if (!current || list.some((item) => item !== current && item.name === clean))
    return null;
  current.name = clean;
  return [...parent, clean];
}

function moveTaxonomyNode(subject, sourcePath, destinationParentPath) {
  if (pathStartsWith(destinationParentPath, sourcePath)) return null;
  const sourceParent = sourcePath.slice(0, -1);
  if (samePath(sourceParent, destinationParentPath)) return null;
  const sourceList = listAtPath(subject, sourceParent);
  const targetList = listAtPath(subject, destinationParentPath);
  if (!sourceList || !targetList) return null;
  const index = sourceList.findIndex((item) => item.name === sourcePath.at(-1));
  if (index < 0) return null;
  const moving = sourceList[index];
  if (targetList.some((item) => item.name === moving.name)) return null;
  sourceList.splice(index, 1);
  targetList.push(moving);
  return [...destinationParentPath, moving.name];
}

async function migrateMobileQuestionPaths(
  subject,
  sourcePath,
  destinationPath,
  collapse = false,
) {
  const rows = await questionsAll(true);
  let changed = 0;
  for (const item of rows) {
    const currentPath =
      item.knowledgePath || [item.module, item.unit].filter(Boolean);
    if (
      item.deletedAt ||
      item.subject !== subject ||
      !pathStartsWith(currentPath, sourcePath)
    )
      continue;
    const knowledgePath = collapse
      ? [...destinationPath]
      : rebasePath(currentPath, sourcePath, destinationPath);
    if (!knowledgePath.length) knowledgePath.push("未分类");
    await questionPut({
      ...item,
      knowledgePath,
      module: knowledgePath[0],
      unit: knowledgePath[1] || "",
      updatedAt: now(),
      syncStatus: "pending",
      lastError: "",
    });
    changed += 1;
  }
  return changed;
}

function readKnowledgePath() {
  return $$(".mobile-knowledge-level")
    .map((select) => select.value)
    .filter(Boolean);
}

function updateQuestionTypes(selected = "") {
  let types = [...(currentSubjectConfig().questionTypes || [])];
  if (!types.length) types = ["不区分题型"];
  if (selected && !types.includes(selected)) types.unshift(selected);
  $("#mobileQuestionType").innerHTML = types
    .map(
      (type) =>
        `<option${type === selected ? " selected" : ""}>${esc(type)}</option>`,
    )
    .join("");
}

function updateClassification(path = []) {
  let tree = currentSubjectConfig().knowledgeTree || [];
  const selected = [];
  let html = "";
  for (let depth = 0; tree.length || path[depth]; depth += 1) {
    const legacy =
      path[depth] && !tree.some((item) => item.name === path[depth])
        ? { name: path[depth], children: [] }
        : null;
    const options = legacy ? [legacy, ...tree] : tree;
    const value = path[depth] || (depth === 0 && tree[0] ? tree[0].name : "");
    html += `<label>第 ${depth + 1} 级<select class="mobile-knowledge-level" data-depth="${depth}"><option value="">${depth ? "不再细分" : "请选择知识大类"}</option>${options.map((item) => `<option${item.name === value ? " selected" : ""}>${esc(item.name)}${item === legacy ? "（旧分类）" : ""}</option>`).join("")}</select></label>`;
    if (!value) break;
    selected.push(value);
    tree =
      findNode(currentSubjectConfig().knowledgeTree, selected)?.children || [];
  }
  $("#mobileKnowledgePath").innerHTML = html;
  $$(".mobile-knowledge-level").forEach((select) => {
    select.onchange = () => updateClassification(readKnowledgePath());
  });
}

function previewFile(name, type, data, remote = false, target = "question") {
  const isAnswer = target === "answer";
  const box = $(isAnswer ? "#answerFilePreview" : "#filePreview");
  const removeButton = $(isAnswer ? "#removeAnswerFileBtn" : "#removeFileBtn");
  const source = isAnswer ? selectedAnswerImageSource : selectedImageSource;
  const file = isAnswer ? selectedAnswerFile : selectedFile;
  box.innerHTML = "";
  box.classList.toggle("empty", !name);
  if (type?.startsWith("image/") && data) {
    const img = document.createElement("img");
    img.alt = isAnswer ? "答案图片预览" : "题目附件预览";
    img.src = data;
    box.append(img);
  }
  const span = document.createElement("span");
  span.textContent = name
    ? `${name}${remote ? "（附件在电脑端）" : ""}`
    : isAnswer
      ? "尚未添加答案图片"
      : "尚未添加题目图片，也可以只录入文字题干";
  box.append(span);
  if (type?.startsWith("image/") && data && !remote) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recrop-file";
    button.textContent = "重新裁剪";
    button.onclick = () =>
      openImageCropper(
        source || { name, type, data, size: file?.size || 0 },
        target,
      );
    box.append(button);
  }
  removeButton.classList.toggle("hidden", !name || remote);
}

function switchView(viewId) {
  $$(".app-view").forEach((view) =>
    view.classList.toggle("active", view.id === viewId),
  );
  $$(".nav-button").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === viewId),
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingId = "";
  editingKnowledgePath = [];
  selectedFile = null;
  selectedFileData = "";
  selectedImageSource = null;
  selectedAnswerFile = null;
  selectedAnswerFileData = "";
  selectedAnswerImageSource = null;
  removeExistingFile = false;
  removeExistingAnswerFile = false;
  $("#questionForm").reset();
  $("#mobileSubject").value = "数学";
  updateQuestionTypes();
  updateClassification();
  $("#file").value = "";
  $("#questionCameraFile").value = "";
  $("#answerFile").value = "";
  $("#answerCameraFile").value = "";
  $("#formTitle").textContent = "保存一道错题";
  $("#submitBtn").textContent = "保存到本机题库";
  $("#cancelEditBtn").classList.add("hidden");
  $("#contentError").textContent = "";
  $("#classificationError").textContent = "";
  previewFile("", "", "");
  previewFile("", "", "", false, "answer");
}

function statusText(item) {
  if (item.syncStatus === "synced") return "已同步，手机仍保留";
  if (item.syncStatus === "error")
    return `同步失败：${item.lastError || "稍后重试"}`;
  return item.remoteId ? "本机有修改，待同步" : "仅保存在本机";
}

async function renderLibrary() {
  const all = await questionsAll();
  const subject = $("#librarySubject").value;
  const query = $("#librarySearch").value.trim().toLowerCase();
  const rows = all.filter(
    (item) =>
      (!subject || item.subject === subject) &&
      (!query ||
        [
          item.title,
          item.question,
          item.answer,
          ...(item.topic || []),
          ...(item.knowledgePath || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
  $("#questionCount").textContent = all.length;
  $("#libraryCount").textContent = `${rows.length} 道`;
  const pending = (await questionsAll(true)).filter(
    (item) => item.syncStatus !== "synced",
  ).length;
  $("#pendingCount").textContent = `${pending} 待同步`;
  const list = $("#libraryList");
  if (!rows.length) {
    list.innerHTML = `<div class="empty-queue">${all.length ? "没有符合筛选条件的错题" : "还没有本机错题，先去录入一道吧"}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const item of rows) {
    const card = document.createElement("article");
    card.className = "question-card";
    const path =
      (item.knowledgePath || [item.module, item.unit])
        .filter(Boolean)
        .join(" › ") || "未分类";
    const image =
      item.file?.data && item.file.type?.startsWith("image/")
        ? `<img class="question-image" src="${esc(item.file.data)}" alt="${esc(item.file.name || "题目图片")}">`
        : "";
    const attachment =
      item.file && !image
        ? `<p class="attachment-note">附件：${esc(item.file.name || "PDF")}</p>`
        : item.remoteAttachment
          ? `<p class="attachment-note">附件保存在电脑端：${esc(item.remoteAttachment.name || "附件")}</p>`
          : "";
    const answerImage =
      item.answerFile?.data && item.answerFile.type?.startsWith("image/")
        ? `<img class="answer-image" src="${esc(item.answerFile.data)}" alt="${esc(item.answerFile.name || "答案图片")}">`
        : "";
    card.innerHTML = `<div class="question-card-head"><div><strong>${esc(item.title || "未命名错题")}</strong><p><span class="knowledge-chip">${esc(item.subject)} · ${esc(path)}</span><span class="type-chip">${esc(item.questionType || "未分类题型")}</span></p></div><span class="sync-state ${esc(item.syncStatus || "pending")}">${esc(statusText(item))}</span></div>${image}${attachment}<p class="question-stem">${esc(item.question || "题干保存在附件中")}</p><div class="answer-panel hidden"><strong>答案 / 解析</strong><p>${esc(item.answer || (answerImage ? "答案见图片" : "暂未填写"))}</p>${answerImage}</div><div class="queue-actions"><button class="secondary reveal-answer" type="button">查看答案</button><button class="secondary move-question" type="button">移动分类</button><button class="secondary edit-question" type="button">编辑全部</button><button class="delete-question" type="button">删除</button></div>`;
    const answerPanel = card.querySelector(".answer-panel");
    const revealButton = card.querySelector(".reveal-answer");
    revealButton.onclick = () => {
      const hidden = answerPanel.classList.toggle("hidden");
      revealButton.textContent = hidden ? "查看答案" : "收起答案";
    };
    card.querySelector(".move-question").onclick = () =>
      editQuestion(item.id, true);
    card.querySelector(".edit-question").onclick = () => editQuestion(item.id);
    card.querySelector(".delete-question").onclick = () => removeQuestion(item);
    list.append(card);
  }
}

async function editQuestion(id, focusClassification = false) {
  const item = await questionGet(id);
  if (!item || item.deletedAt) return;
  editingId = id;
  editingKnowledgePath =
    item.knowledgePath || [item.module, item.unit].filter(Boolean);
  removeExistingFile = false;
  removeExistingAnswerFile = false;
  const form = $("#questionForm");
  form.elements.subject.value = ACTIVE_SUBJECTS.includes(item.subject)
    ? item.subject
    : "数学";
  updateQuestionTypes(item.questionType);
  updateClassification(editingKnowledgePath);
  form.elements.title.value = item.title || "";
  form.elements.question.value = item.question || "";
  form.elements.topic.value = Array.isArray(item.topic)
    ? item.topic.join(", ")
    : item.topic || "";
  form.elements.answer.value = item.answer || "";
  selectedFile = null;
  selectedFileData = item.file?.data || "";
  selectedImageSource = item.file?.type?.startsWith("image/")
    ? { ...item.file }
    : null;
  previewFile(
    item.file?.name || item.remoteAttachment?.name || "",
    item.file?.type || item.remoteAttachment?.type || "",
    selectedFileData,
    !item.file && Boolean(item.remoteAttachment),
  );
  selectedAnswerFile = null;
  selectedAnswerFileData = item.answerFile?.data || "";
  selectedAnswerImageSource = item.answerFile?.type?.startsWith("image/")
    ? { ...item.answerFile }
    : null;
  previewFile(
    item.answerFile?.name || "",
    item.answerFile?.type || "",
    selectedAnswerFileData,
    false,
    "answer",
  );
  $("#formTitle").textContent = "编辑本机错题";
  $("#submitBtn").textContent = "保存修改";
  $("#cancelEditBtn").classList.remove("hidden");
  switchView("captureView");
  if (focusClassification) {
    $("#formTitle").textContent = "移动错题到新分类";
    $(".classification-fieldset")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setTimeout(() => $(".mobile-knowledge-level")?.focus(), 220);
    message("选择后来新增的任意分类层级，再点“保存修改”即可", true);
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function removeQuestion(item) {
  if (
    !confirm(
      `确定从手机题库删除「${item.title}」吗？${item.remoteId ? "\n下次同步时也会从电脑题库删除。" : ""}`,
    )
  )
    return;
  if (item.remoteId)
    await questionPut({
      ...item,
      deletedAt: now(),
      updatedAt: now(),
      syncStatus: "pending",
      lastError: "",
    });
  else await questionDelete(item.id);
  if (editingId === item.id) resetForm();
  await renderAll();
  message(
    item.remoteId ? "已从手机题库移除，等待同步电脑删除" : "已从手机题库删除",
    true,
  );
}

function taxonomyDestinationOptions(subject, sourcePath) {
  const sourceParent = sourcePath.slice(0, -1);
  return [
    { path: [], label: `${subject}（根目录）` },
    ...flattenTree(mobileConfig[subject]?.knowledgeTree).map((entry) => ({
      path: entry.path,
      label: entry.path.join(" › "),
    })),
  ]
    .filter(
      (target) =>
        !samePath(target.path, sourceParent) &&
        !pathStartsWith(target.path, sourcePath),
    )
    .map(
      (target) =>
        `<option value="${esc(encodeURIComponent(JSON.stringify(target.path)))}">${esc(target.label)}</option>`,
    )
    .join("");
}

function taxonomyNodeHtml(subject, item, parents = []) {
  const path = [...parents, item.name];
  const encoded = encodeURIComponent(JSON.stringify(path));
  return `<li><div class="taxonomy-row"><span class="knowledge-chip">${esc(item.name)}</span><span><button class="mini-action add-child" data-subject="${esc(subject)}" data-path="${encoded}" type="button">加下级</button><button class="mini-action rename-node" data-subject="${esc(subject)}" data-path="${encoded}" type="button">重命名</button><button class="mini-action move-node" data-subject="${esc(subject)}" data-path="${encoded}" type="button" aria-expanded="false">移动</button><button class="mini-action danger delete-node" data-subject="${esc(subject)}" data-path="${encoded}" type="button">删除</button></span></div><div class="taxonomy-move-panel" hidden><label>移动到<select class="taxonomy-move-target">${taxonomyDestinationOptions(subject, path)}</select></label><div><button class="mini-action cancel-node-move" type="button">取消</button><button class="mini-action confirm-node-move" data-subject="${esc(subject)}" data-path="${encoded}" type="button">确认移动</button></div></div>${item.children?.length ? `<ul>${item.children.map((child) => taxonomyNodeHtml(subject, child, path)).join("")}</ul>` : ""}</li>`;
}

function renderConfig() {
  $("#mobileConfigCards").innerHTML = ACTIVE_SUBJECTS.map((subject) => {
    const config = mobileConfig[subject];
    return `<article class="taxonomy-card"><div class="taxonomy-title"><div><strong>${esc(subject)}</strong><p class="hint">分类像文件夹一样管理，旧错题会跟随移动。</p></div><button class="mini-action add-root" data-subject="${esc(subject)}" type="button">加知识大类</button></div><ul class="taxonomy-tree">${config.knowledgeTree.map((item) => taxonomyNodeHtml(subject, item)).join("") || '<li class="hint">暂无知识分类</li>'}</ul><div class="type-list"><strong>题型</strong><div>${config.questionTypes.map((type) => `<span class="type-chip">${esc(type)} <button class="delete-type" data-subject="${esc(subject)}" data-type="${esc(type)}" aria-label="删除${esc(type)}" type="button">×</button></span>`).join("") || '<span class="hint">暂无题型</span>'}</div><button class="mini-action add-type" data-subject="${esc(subject)}" type="button">加题型</button></div></article>`;
  }).join("");
  $$(".add-root,.add-child").forEach((button) => {
    button.onclick = async () => {
      const path = button.dataset.path
        ? JSON.parse(decodeURIComponent(button.dataset.path))
        : [];
      const name = await askText(
        "添加知识分类",
        `归属：${button.dataset.subject}${path.length ? ` · ${path.join(" · ")}` : ""}`,
      );
      if (!name?.trim()) return;
      const list = listAtPath(button.dataset.subject, path);
      if (!list || list.some((item) => item.name === name.trim()))
        return message("分类名称重复或父级已不存在");
      list.push(node(name.trim()));
      saveConfig(true);
      refreshConfigUi();
      message("知识分类已添加，仅本机也会长期保留", true);
    };
  });
  $$(".delete-node").forEach((button) => {
    button.onclick = async () => {
      const path = JSON.parse(decodeURIComponent(button.dataset.path));
      const affected = (await questionsAll()).filter(
        (item) =>
          item.subject === button.dataset.subject &&
          pathStartsWith(
            item.knowledgePath || [item.module, item.unit].filter(Boolean),
            path,
          ),
      ).length;
      if (
        !confirm(
          `删除「${path.join(" · ")}」及所有下级？${affected ? `其中 ${affected} 道旧错题会安全移动到上一级。` : "当前没有关联错题。"}`,
        )
      )
        return;
      const list = listAtPath(button.dataset.subject, path.slice(0, -1));
      const index = list?.findIndex((item) => item.name === path.at(-1));
      if (index >= 0) list.splice(index, 1);
      const parent = path.slice(0, -1);
      await migrateMobileQuestionPaths(
        button.dataset.subject,
        path,
        parent.length ? parent : ["未分类"],
        true,
      );
      saveConfig(true);
      refreshConfigUi();
      await renderAll();
      message(
        affected
          ? `分类已删除，${affected} 道错题已移到上一级`
          : "知识分类已删除",
        true,
      );
    };
  });
  $$(".rename-node").forEach((button) => {
    button.onclick = async () => {
      const path = JSON.parse(decodeURIComponent(button.dataset.path));
      const name = await askText(
        "重命名知识分类",
        `当前位置：${button.dataset.subject} · ${path.join(" · ")}；原名称：${path.at(-1)}`,
      );
      if (!name?.trim() || name.trim() === path.at(-1)) return;
      const nextPath = renameTaxonomyNode(
        button.dataset.subject,
        path,
        name,
      );
      if (!nextPath) return message("名称重复或分类已不存在");
      const changed = await migrateMobileQuestionPaths(
        button.dataset.subject,
        path,
        nextPath,
      );
      saveConfig(true);
      refreshConfigUi();
      await renderAll();
      message(
        `分类已重命名${changed ? `，${changed} 道旧错题已同步更新` : ""}`,
        true,
      );
    };
  });
  $$(".move-node").forEach((button) => {
    button.onclick = () => {
      const panel = button
        .closest("li")
        .querySelector(":scope > .taxonomy-move-panel");
      const opening = panel.hidden;
      $$(".taxonomy-move-panel").forEach((item) => (item.hidden = true));
      $$(".move-node").forEach((item) =>
        item.setAttribute("aria-expanded", "false"),
      );
      panel.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
      if (opening) panel.querySelector("select")?.focus();
    };
  });
  $$(".cancel-node-move").forEach((button) => {
    button.onclick = () => {
      button.closest(".taxonomy-move-panel").hidden = true;
    };
  });
  $$(".confirm-node-move").forEach((button) => {
    button.onclick = async () => {
      const path = JSON.parse(decodeURIComponent(button.dataset.path));
      const target = JSON.parse(
        decodeURIComponent(
          button
            .closest(".taxonomy-move-panel")
            .querySelector("select").value,
        ),
      );
      const nextPath = moveTaxonomyNode(
        button.dataset.subject,
        path,
        target,
      );
      if (!nextPath)
        return message("无法移动：目标重复、无效或位于当前分类内部");
      const changed = await migrateMobileQuestionPaths(
        button.dataset.subject,
        path,
        nextPath,
      );
      saveConfig(true);
      refreshConfigUi();
      await renderAll();
      message(
        `分类已移动${changed ? `，${changed} 道旧错题已一起移动` : ""}`,
        true,
      );
    };
  });
  $$(".add-type").forEach((button) => {
    button.onclick = async () => {
      const name = await askText("添加题型", `科目：${button.dataset.subject}`);
      if (!name?.trim()) return;
      const list = mobileConfig[button.dataset.subject].questionTypes;
      if (list.includes(name.trim())) return message("该题型已存在");
      list.push(name.trim());
      saveConfig(true);
      refreshConfigUi();
    };
  });
  $$(".delete-type").forEach((button) => {
    button.onclick = () => {
      if (
        !confirm(
          `删除题型「${button.dataset.type}」？已有错题仍保留原题型文字。`,
        )
      )
        return;
      mobileConfig[button.dataset.subject].questionTypes = mobileConfig[
        button.dataset.subject
      ].questionTypes.filter((type) => type !== button.dataset.type);
      saveConfig(true);
      refreshConfigUi();
    };
  });
}

function refreshConfigUi() {
  updateQuestionTypes($("#mobileQuestionType").value);
  updateClassification(readKnowledgePath());
  renderConfig();
  renderPaperBuilder();
}

async function renderPaperBuilder() {
  const subject = $("#paperSubject").value;
  const questions = await questionsAll();
  const config = mobileConfig[subject];
  const previous = {};
  $$(".paper-quota").forEach((input) => {
    previous[input.dataset.key] = input.value;
  });
  const rows = [];
  for (const knowledge of config.knowledgeTree) {
    for (const type of config.questionTypes) {
      const count = questions.filter(
        (item) =>
          item.subject === subject &&
          (item.knowledgePath || [item.module])[0] === knowledge.name &&
          item.questionType === type,
      ).length;
      const key = `${subject}|||${knowledge.name}|||${type}`;
      rows.push(
        `<label class="paper-quota-row"><span><strong>${esc(knowledge.name)} · ${esc(type)}</strong><small>本机可用 ${count} 道</small></span><input class="paper-quota" data-key="${esc(key)}" data-knowledge="${esc(knowledge.name)}" data-type="${esc(type)}" type="number" min="0" max="99" inputmode="numeric" value="${esc(previous[key] || 0)}" aria-label="${esc(knowledge.name + type)}数量"></label>`,
      );
    }
  }
  $("#paperQuotaRows").innerHTML =
    rows.join("") ||
    '<p class="empty-queue">请先在分类设置中添加知识大类和题型</p>';
  const updateTotal = () => {
    $("#paperTotal").textContent =
      `${$$(".paper-quota").reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0)} 道`;
  };
  $$(".paper-quota").forEach((input) => {
    input.oninput = updateTotal;
  });
  updateTotal();
}

async function generatePaper() {
  const subject = $("#paperSubject").value;
  const questions = await questionsAll();
  const selected = [];
  const missing = [];
  for (const input of $$(".paper-quota")) {
    const requested = Math.max(0, Number(input.value) || 0);
    if (!requested) continue;
    const pool = questions
      .filter(
        (item) =>
          item.subject === subject &&
          (item.knowledgePath || [item.module])[0] ===
            input.dataset.knowledge &&
          item.questionType === input.dataset.type,
      )
      .sort(() => Math.random() - 0.5);
    selected.push(...pool.slice(0, requested));
    if (pool.length < requested)
      missing.push(
        `${input.dataset.knowledge} · ${input.dataset.type} 缺 ${requested - pool.length} 道`,
      );
  }
  if (!selected.length)
    return message("请先填写组卷数量，并确保本机题库有对应题目");
  $("#paperResultCard").classList.remove("hidden");
  $("#paperSummary").textContent =
    `已选 ${selected.length} 道${missing.length ? `；${missing.join("，")}` : ""}`;
  $("#paperResult").innerHTML = selected
    .map(
      (item, index) =>
        `<article class="paper-question"><strong>${index + 1}. ${esc(item.title)}</strong><p class="question-meta">${esc((item.knowledgePath || []).join(" › "))} · ${esc(item.questionType)}</p><p>${esc(item.question || "题干见附件")}</p><details><summary>查看答案</summary><p>${esc(item.answer || (item.answerFile?.data ? "答案见图片" : "暂未填写"))}</p>${item.answerFile?.data && item.answerFile.type?.startsWith("image/") ? `<img class="answer-image" src="${esc(item.answerFile.data)}" alt="${esc(item.answerFile.name || "答案图片")}">` : ""}</details></article>`,
    )
    .join("");
  $("#paperResultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizedEndpoint(showError = true) {
  let raw = $("#serverEndpoint").value.trim().replace(/\/+$/, "");
  if (!raw && ["http:", "https:"].includes(location.protocol))
    raw = location.origin;
  if (!raw) {
    if (showError) message("未填写电脑地址；本机功能仍可正常使用");
    return "";
  }
  try {
    const url = new URL(raw);
    const privateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    );
    if (
      url.protocol !== "http:" ||
      !(privateIp || ["127.0.0.1", "localhost"].includes(url.hostname)) ||
      !url.port
    )
      throw new Error();
    return url.origin;
  } catch {
    if (showError)
      message("请输入带端口的局域网 HTTP 地址，例如 http://192.168.1.8:17332");
    return "";
  }
}

function apiUrl(path) {
  const endpoint = normalizedEndpoint(false);
  return endpoint ? `${endpoint}${path}` : "";
}

function apiHeaders(json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    "x-shiti-token": $("#token").value.trim(),
  };
}

function remoteToLocal(remote, existing) {
  return {
    id: existing?.id || newId(),
    remoteId: String(remote.id),
    source: "desktop",
    subject: ACTIVE_SUBJECTS.includes(remote.subject) ? remote.subject : "数学",
    knowledgePath: Array.isArray(remote.knowledgePath)
      ? remote.knowledgePath
      : [remote.module, remote.unit].filter(Boolean),
    module: remote.module || remote.knowledgePath?.[0] || "未分类",
    unit: remote.unit || remote.knowledgePath?.[1] || "",
    questionType: remote.questionType || "未分类题型",
    topic: Array.isArray(remote.topic) ? remote.topic : [],
    title: remote.title || "未命名错题",
    question: remote.question || "",
    answer: remote.answer || "",
    file: existing?.file || null,
    answerFile: existing?.answerFile || null,
    remoteAttachment: remote.attachment || existing?.remoteAttachment || null,
    createdAt: remote.createdAt || existing?.createdAt || now(),
    updatedAt: remote.updatedAt || now(),
    deletedAt: remote.deletedAt || null,
    syncStatus: "synced",
    lastSyncedAt: now(),
    lastError: "",
  };
}

async function pullRemoteQuestions(remoteQuestions) {
  if (!Array.isArray(remoteQuestions)) return;
  const local = await questionsAll(true);
  const byRemote = new Map(
    local
      .filter((item) => item.remoteId)
      .map((item) => [String(item.remoteId), item]),
  );
  for (const remote of remoteQuestions) {
    if (!remote?.id) continue;
    const existing = byRemote.get(String(remote.id));
    if (existing?.syncStatus === "pending" || existing?.syncStatus === "error")
      continue;
    if (remote.deletedAt) {
      if (existing) await questionDelete(existing.id);
      continue;
    }
    if (!ACTIVE_SUBJECTS.includes(remote.subject)) continue;
    if (
      !existing ||
      String(remote.updatedAt || "") > String(existing.updatedAt || "")
    )
      await questionPut(remoteToLocal(remote, existing));
  }
}

async function connect(silent = false) {
  const endpoint = normalizedEndpoint(!silent);
  const token = $("#token").value.trim();
  if (!endpoint || !token) {
    $("#connectionBadge").textContent = "仅本机";
    $("#connectionBadge").className = "badge local";
    if (!silent && !token) message("未填写配对令牌；本机功能仍可正常使用");
    return false;
  }
  try {
    const infoResponse = await fetch(`${endpoint}/api/info`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (!infoResponse.ok)
      throw new Error(
        infoResponse.status === 401 ? "配对令牌不正确" : "电脑服务没有响应",
      );
    localStorage.setItem(endpointKey, endpoint);
    localStorage.setItem(tokenKey, token);
    const configResponse = await fetch(`${endpoint}/api/config`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (configResponse.ok) {
      const remoteConfig = (await configResponse.json()).subjectConfig;
      if (
        remoteConfig &&
        Object.keys(remoteConfig).length &&
        localStorage.getItem(configCustomKey) !== "1"
      ) {
        mobileConfig = normalizeConfig(remoteConfig);
        saveConfig(false);
        refreshConfigUi();
      }
    }
    const stateResponse = await fetch(`${endpoint}/`, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (stateResponse.ok)
      await pullRemoteQuestions((await stateResponse.json()).questions);
    $("#connectionBadge").textContent = "已连接";
    $("#connectionBadge").className = "badge ok";
    await renderAll();
    if (!silent)
      message("连接成功；电脑题库已合并到手机，本机题目未被覆盖", true);
    return true;
  } catch (error) {
    $("#connectionBadge").textContent = "仅本机";
    $("#connectionBadge").className = "badge local";
    if (!silent)
      message(`${error.message || "暂时无法连接"}；本机题库仍可正常使用`);
    return false;
  }
}

async function syncPending() {
  const button = $("#uploadAllBtn");
  button.disabled = true;
  try {
    if (!(await connect(false))) return;
    const records = (await questionsAll(true)).filter(
      (item) => item.syncStatus !== "synced",
    );
    let success = 0;
    let failed = 0;
    for (const item of records) {
      try {
        if (item.deletedAt) {
          if (item.remoteId) {
            const response = await fetch(
              `${apiUrl("/api/questions/")}${encodeURIComponent(item.remoteId)}`,
              { method: "DELETE", headers: apiHeaders() },
            );
            if (!response.ok && response.status !== 404)
              throw new Error(`删除失败 HTTP ${response.status}`);
          }
          await questionDelete(item.id);
          success += 1;
          continue;
        }
        const payload = {
          ...item,
          clientId: item.id,
          serverId: item.remoteId || "",
          file: item.file || null,
          attachmentRemoved: Boolean(item.attachmentRemoved),
        };
        delete payload.syncStatus;
        delete payload.lastError;
        delete payload.lastSyncedAt;
        const response = await fetch(apiUrl("/api/questions"), {
          method: "POST",
          headers: apiHeaders(true),
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data.error || `HTTP ${response.status}`);
        await questionPut({
          ...item,
          remoteId: data.id || item.remoteId,
          remoteAttachment:
            data.question?.attachment || item.remoteAttachment || null,
          attachmentRemoved: false,
          syncStatus: "synced",
          lastSyncedAt: now(),
          lastError: "",
        });
        success += 1;
      } catch (error) {
        failed += 1;
        await questionPut({
          ...item,
          syncStatus: "error",
          lastError: error.message || "网络错误",
        }).catch(() => {});
      }
    }
    try {
      await fetch(apiUrl("/"), {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({
          deviceId: "mobile-offline-first",
          subjectConfig: mobileConfig,
          questions: [],
        }),
      });
    } catch {}
    await connect(true);
    await renderAll();
    message(
      failed
        ? `已同步 ${success} 项，${failed} 项失败并继续保留在手机`
        : `同步完成：${success} 项变更已写入电脑，手机题库仍完整保留`,
      failed === 0,
    );
  } finally {
    button.disabled = false;
  }
}

async function exportBackup() {
  const questions = await questionsAll(true);
  const body = JSON.stringify(
    {
      format: "shiti-mobile-offline-v2",
      exportedAt: now(),
      subjectConfig: mobileConfig,
      questions,
    },
    null,
    2,
  );
  const blob = new Blob([body], { type: "application/json" });
  const file = new File(
    [blob],
    `拾题手机备份-${new Date().toISOString().slice(0, 10)}.json`,
    { type: "application/json" },
  );
  if (navigator.canShare?.({ files: [file] }))
    await navigator.share({ title: "拾题手机备份", files: [file] });
  else {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  message("本机备份已生成", true);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.questions)) throw new Error("备份中没有题库数据");
    const current = await questionsAll(true);
    const map = new Map(current.map((item) => [String(item.id), item]));
    let merged = 0;
    for (const item of data.questions) {
      if (!item?.id) continue;
      const old = map.get(String(item.id));
      if (!old || String(item.updatedAt || "") > String(old.updatedAt || "")) {
        await questionPut({
          ...item,
          id: String(item.id),
          syncStatus: item.syncStatus || "pending",
        });
        merged += 1;
      }
    }
    if (data.subjectConfig) {
      mobileConfig = normalizeConfig(data.subjectConfig);
      saveConfig(true);
      refreshConfigUi();
    }
    await renderAll();
    message(`备份已合并，更新 ${merged} 道错题`, true);
  } catch (error) {
    message(`导入失败：${error.message || "文件格式不正确"}`);
  } finally {
    $("#backupFile").value = "";
  }
}

async function importLegacyQueue() {
  const endpoint = normalizedEndpoint(true);
  if (!endpoint) return;
  const button = $("#importLegacyBtn");
  button.disabled = true;
  message("正在读取旧版待上传箱…", true);
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = `${endpoint}/mobile/?legacyBridge=1`;
  document.body.append(frame);
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener("message", receive);
    frame.remove();
    button.disabled = false;
  };
  const receive = async (event) => {
    if (
      event.origin !== endpoint ||
      event.data?.type !== "shiti-legacy-export-v2"
    )
      return;
    cleanup();
    const incoming = Array.isArray(event.data.questions)
      ? event.data.questions
      : [];
    const current = await questionsAll(true);
    const ids = new Set(current.map((item) => String(item.id)));
    let added = 0;
    for (const item of incoming) {
      if (!item?.id || ids.has(String(item.id))) continue;
      await questionPut({
        ...item,
        id: String(item.id),
        source: "mobile",
        syncStatus: "pending",
        deletedAt: null,
        updatedAt: item.updatedAt || now(),
        createdAt: item.createdAt || now(),
      });
      added += 1;
    }
    await renderAll();
    message(
      added
        ? `已找回 ${added} 道旧版待上传错题，现已长期保存在本机`
        : "旧版待上传箱中没有需要找回的新题",
      true,
    );
  };
  window.addEventListener("message", receive);
  timer = setTimeout(() => {
    cleanup();
    message("未读取到旧版待上传箱；请确认电脑服务地址可访问");
  }, 8000);
}

async function renderAll() {
  await renderLibrary();
  await renderPaperBuilder();
  renderConfig();
}

$$(".nav-button").forEach((button) => {
  button.onclick = () => switchView(button.dataset.view);
});
$("#questionCameraBtn").onclick = () => $("#questionCameraFile").click();
$("#questionGalleryBtn").onclick = () => $("#file").click();
$("#answerCameraBtn").onclick = () => $("#answerCameraFile").click();
$("#answerGalleryBtn").onclick = () => $("#answerFile").click();
$("#cancelEditBtn").onclick = resetForm;
$("#mobileSubject").onchange = () => {
  editingKnowledgePath = [];
  updateQuestionTypes();
  updateClassification();
};
$("#librarySubject").onchange = () => renderLibrary();
$("#librarySearch").oninput = () => renderLibrary();
$("#paperSubject").onchange = () => renderPaperBuilder();
$("#generatePaperBtn").onclick = generatePaper;
$("#clearPaperBtn").onclick = () => {
  $("#paperResultCard").classList.add("hidden");
  $("#paperResult").innerHTML = "";
};
$("#connectBtn").onclick = () => connect(false);
$("#uploadAllBtn").onclick = syncPending;
$("#importLegacyBtn").onclick = importLegacyQueue;
$("#exportLocalBtn").onclick = () =>
  exportBackup().catch(() => message("导出失败，请检查系统存储权限"));
$("#importLocalBtn").onclick = () => $("#backupFile").click();
$("#backupFile").onchange = (event) => {
  if (event.target.files[0]) importBackup(event.target.files[0]);
};
$("#cancelCropBtn").onclick = () => closeImageCropper();
$("#resetCropBtn").onclick = () => sizeCropViewport(true);
$$('[data-crop-mode]').forEach((button) => {
  button.onclick = () => setCropInteractionMode(button.dataset.cropMode);
});
$$('[data-crop-nudge]').forEach((button) => {
  button.onclick = () => nudgeCrop(button.dataset.cropNudge);
});
$$('[data-crop-zoom-step]').forEach((button) => {
  button.onclick = () => {
    const factor = button.dataset.cropZoomStep === "in" ? 1.12 : 0.89;
    applyCropScale(
      cropState.scale * factor,
      cropState.cropBox.x + cropState.cropBox.width / 2,
      cropState.cropBox.y + cropState.cropBox.height / 2,
    );
    $("#cropStatus").textContent =
      button.dataset.cropZoomStep === "in" ? "照片已放大" : "照片已缩小";
  };
});
$$("[data-crop-ratio]").forEach((button) => {
  button.onclick = () => {
    cropState.ratioMode = button.dataset.cropRatio;
    $$("[data-crop-ratio]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    sizeCropViewport(true);
  };
});
$("#cropZoom").oninput = (event) => {
  const progress = Number(event.target.value) / 100;
  applyCropScale(
    cropState.minScale * 6 ** progress,
    cropState.cropBox.x + cropState.cropBox.width / 2,
    cropState.cropBox.y + cropState.cropBox.height / 2,
  );
};
$("#confirmCropBtn").onclick = async () => {
  const button = $("#confirmCropBtn");
  button.disabled = true;
  button.textContent = "处理中…";
  $("#cropStatus").textContent = "";
  try {
    const croppedFile = await createCroppedFile();
    const data = await fileData(croppedFile);
    if (cropState.target === "answer") {
      selectedAnswerFile = croppedFile;
      selectedAnswerFileData = data;
      selectedAnswerImageSource = { ...cropState.source };
      removeExistingAnswerFile = false;
      previewFile(croppedFile.name, croppedFile.type, data, false, "answer");
    } else {
      selectedFile = croppedFile;
      selectedFileData = data;
      selectedImageSource = { ...cropState.source };
      removeExistingFile = false;
      previewFile(croppedFile.name, croppedFile.type, data);
    }
    $("#contentError").textContent = "";
    closeImageCropper(false);
    $(
      cropState.target === "answer"
        ? "#answerFilePreview .recrop-file"
        : "#filePreview .recrop-file",
    )?.focus();
    message(
      `图片已裁剪并压缩为 ${Math.max(1, Math.round(croppedFile.size / 1024))}KB`,
      true,
    );
  } catch {
    $("#cropStatus").textContent = "处理失败，请重置后再试或换一张图片。";
  } finally {
    button.disabled = false;
    button.textContent = "确认裁剪";
  }
};

function bindCropBoxDrag(element, mode, handle = "") {
  element.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.setPointerCapture(event.pointerId);
    cropState.boxGesture = {
      pointerId: event.pointerId,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...cropState.cropBox },
    };
  };
  element.onpointermove = (event) => {
    const gesture = cropState.boxGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const nextBox =
      gesture.mode === "move"
        ? CropUtils.moveCropBox(
            gesture.box,
            deltaX,
            deltaY,
            cropState.viewportWidth,
            cropState.viewportHeight,
          )
        : CropUtils.resizeCropBox(
            gesture.box,
            gesture.handle,
            deltaX,
            deltaY,
            cropState.viewportWidth,
            cropState.viewportHeight,
            72,
            cropRatio(),
          );
    applyCropBox(nextBox);
  };
  const end = (event) => {
    if (cropState.boxGesture?.pointerId === event.pointerId)
      cropState.boxGesture = null;
  };
  element.onpointerup = end;
  element.onpointercancel = end;
}

$$("[data-crop-handle]").forEach((handle) =>
  bindCropBoxDrag(handle, "resize", handle.dataset.cropHandle),
);
const cropCanvas = $("#cropCanvas");
cropCanvas.onpointerdown = (event) => {
  event.preventDefault();
  const point = cropPointerPoint(event);
  cropCanvas.setPointerCapture(event.pointerId);
  cropState.pointers.set(event.pointerId, point);
  if (cropState.pointers.size >= 2) startCropGesture();
};
cropCanvas.onpointermove = (event) => {
  const previous = cropState.pointers.get(event.pointerId);
  if (!previous) return;
  event.preventDefault();
  const point = cropPointerPoint(event);
  cropState.pointers.set(event.pointerId, point);
  if (cropState.pointers.size === 1) {
    const deltaX = point.x - previous.x;
    const deltaY = point.y - previous.y;
    if (cropState.interactionMode === "box") {
      applyCropBox(
        CropUtils.moveCropBox(
          cropState.cropBox,
          deltaX,
          deltaY,
          cropState.viewportWidth,
          cropState.viewportHeight,
        ),
      );
      $("#cropStatus").textContent = "正在移动选框";
      return;
    }
    cropState.offsetX += deltaX;
    cropState.offsetY += deltaY;
    $("#cropStatus").textContent = "正在移动照片";
  } else {
    if (!cropState.gesture) startCropGesture();
    const [first, second] = [...cropState.pointers.values()];
    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    const distance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y),
    );
    const scale = CropUtils.clamp(
      cropState.gesture.scale * (distance / cropState.gesture.distance),
      cropState.minScale,
      cropState.minScale * 6,
    );
    const factor = scale / cropState.gesture.scale;
    cropState.scale = scale;
    cropState.offsetX =
      midpoint.x +
      (cropState.gesture.offsetX - cropState.gesture.midpoint.x) * factor;
    cropState.offsetY =
      midpoint.y +
      (cropState.gesture.offsetY - cropState.gesture.midpoint.y) * factor;
  }
  clampCropPosition();
  syncCropZoom();
  renderCropCanvas();
};
const endCropPointer = (event) => {
  cropState.pointers.delete(event.pointerId);
  if (cropState.pointers.size >= 2) startCropGesture();
  else cropState.gesture = null;
};
cropCanvas.onpointerup = endCropPointer;
cropCanvas.onpointercancel = endCropPointer;
cropCanvas.onwheel = (event) => {
  event.preventDefault();
  const point = cropPointerPoint(event);
  applyCropScale(
    cropState.scale * (event.deltaY > 0 ? 0.92 : 1.08),
    point.x,
    point.y,
  );
};
cropCanvas.onkeydown = (event) => {
  const movement = event.shiftKey ? 30 : 10;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const direction = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    }[event.key];
    nudgeCrop(direction, movement);
  }
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    applyCropScale(
      cropState.scale * (["+", "="].includes(event.key) ? 1.08 : 0.92),
      cropState.cropBox.x + cropState.cropBox.width / 2,
      cropState.cropBox.y + cropState.cropBox.height / 2,
    );
  }
};
if ("ResizeObserver" in window) {
  new ResizeObserver(() => sizeCropViewport()).observe($("#cropperStage"));
} else {
  window.addEventListener("resize", () => sizeCropViewport());
}
document.addEventListener("keydown", (event) => {
  if (!$("#imageCropper").classList.contains("show")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeImageCropper();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...$("#imageCropper").querySelectorAll(
      'button:not(:disabled), input:not(:disabled), canvas[tabindex="0"]',
    ),
  ];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
$("#removeFileBtn").onclick = () => {
  selectedFile = null;
  selectedFileData = "";
  selectedImageSource = null;
  removeExistingFile = true;
  $("#file").value = "";
  $("#questionCameraFile").value = "";
  previewFile("", "", "");
  $("#contentError").textContent = "";
  message("题目附件已移除", true);
};
$("#removeAnswerFileBtn").onclick = () => {
  selectedAnswerFile = null;
  selectedAnswerFileData = "";
  selectedAnswerImageSource = null;
  removeExistingAnswerFile = true;
  $("#answerFile").value = "";
  $("#answerCameraFile").value = "";
  previewFile("", "", "", false, "answer");
  message("答案图片已移除", true);
};

async function handleMediaSelection(event, target, allowPdf = false) {
  const candidate = event.target.files[0] || null;
  if (!candidate) return;
  const isImage = candidate.type.startsWith("image/");
  const isPdf = candidate.type === "application/pdf";
  if (!allowedType(candidate.type) || (!isImage && !(allowPdf && isPdf))) {
    event.target.value = "";
    return message(allowPdf ? "仅支持图片或 PDF" : "仅支持图片文件");
  }
  if (candidate.size > 25_000_000) {
    event.target.value = "";
    return message("附件不能超过 25MB");
  }
  try {
    const data = await fileData(candidate);
    if (isImage) {
      await openImageCropper(
        {
          name: candidate.name,
          type: candidate.type,
          size: candidate.size,
          data,
        },
        target,
      );
      return;
    }
    selectedFile = candidate;
    selectedFileData = data;
    selectedImageSource = null;
    removeExistingFile = false;
    event.target.value = "";
    previewFile(candidate.name, candidate.type, selectedFileData);
  } catch {
    event.target.value = "";
    message("附件读取失败，请重新选择");
  }
}

$("#file").onchange = (event) => handleMediaSelection(event, "question", true);
$("#questionCameraFile").onchange = (event) =>
  handleMediaSelection(event, "question");
$("#answerFile").onchange = (event) =>
  handleMediaSelection(event, "answer");
$("#answerCameraFile").onchange = (event) =>
  handleMediaSelection(event, "answer");
$("#questionForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#submitBtn");
  button.disabled = true;
  try {
    const form = new FormData(event.target);
    const payload = Object.fromEntries(form.entries());
    const old = editingId ? await questionGet(editingId) : null;
    const id = editingId || newId();
    const knowledgePath = readKnowledgePath();
    delete payload.file;
    if (!knowledgePath.length) {
      $("#classificationError").textContent = "请至少选择一个知识大类。";
      $(".mobile-knowledge-level")?.focus();
      return message("请选择知识分类");
    }
    $("#classificationError").textContent = "";
    const file = selectedFile
      ? {
          name: selectedFile.name,
          type: selectedFile.type || "application/octet-stream",
          size: selectedFile.size,
          data: selectedFileData,
        }
      : removeExistingFile
        ? null
        : old?.file || null;
    const answerFile = selectedAnswerFile
      ? {
          name: selectedAnswerFile.name,
          type: selectedAnswerFile.type || "image/webp",
          size: selectedAnswerFile.size,
          data: selectedAnswerFileData,
        }
      : removeExistingAnswerFile
        ? null
        : old?.answerFile || null;
    if (
      !String(payload.question || "").trim() &&
      !file?.data &&
      !old?.remoteAttachment
    ) {
      $("#contentError").textContent = "请填写题目内容，或选择一张图片 / PDF。";
      event.target.elements.question.focus();
      return message("这道题缺少题干或附件");
    }
    $("#contentError").textContent = "";
    const stamp = now();
    await questionPut({
      ...old,
      ...payload,
      id,
      source: old?.source || "mobile",
      knowledgePath,
      module: knowledgePath[0],
      unit: knowledgePath[1] || "",
      topic: String(payload.topic || "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      file,
      answerFile,
      remoteAttachment: removeExistingFile
        ? null
        : old?.remoteAttachment || null,
      attachmentRemoved: removeExistingFile
        ? true
        : selectedFile
          ? false
          : Boolean(old?.attachmentRemoved),
      createdAt: old?.createdAt || stamp,
      updatedAt: stamp,
      deletedAt: null,
      syncStatus: "pending",
      lastError: "",
    });
    resetForm();
    await renderAll();
    message(
      old
        ? "修改已保存到手机；连接电脑后可选择同步"
        : "已保存到手机题库，不连接电脑也不会丢失",
      true,
    );
  } catch {
    message("手机本地保存失败，请检查存储空间");
  } finally {
    button.disabled = false;
  }
};

$("#serverEndpoint").value = localStorage.getItem(endpointKey) || "";
$("#mobileTextPromptCancel").onclick = () => closeTextPrompt();
$("#mobileTextPromptForm").onsubmit = (event) => {
  event.preventDefault();
  closeTextPrompt($("#mobileTextPromptInput").value.trim());
};
$("#token").value = localStorage.getItem(tokenKey) || "";
saveConfig(false);
updateQuestionTypes();
updateClassification();
renderAll().catch(() => message("无法读取手机题库，请检查应用存储空间"));
if ($("#serverEndpoint").value && $("#token").value) connect(true);
if (new URLSearchParams(location.search).get("legacyBridge") === "1") {
  questionsAll(true).then((questions) =>
    parent.postMessage({ type: "shiti-legacy-export-v2", questions }, "*"),
  );
}
