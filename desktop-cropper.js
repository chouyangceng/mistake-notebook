(function exposeDesktopCropper(global) {
  "use strict";

  const state = {
    image: null,
    source: null,
    target: "question",
    ratioMode: "free",
    viewportWidth: 0,
    viewportHeight: 0,
    cropBox: { x: 0, y: 0, width: 120, height: 120 },
    scale: 1,
    minScale: 1,
    offsetX: 0,
    offsetY: 0,
    pointers: new Map(),
    gesture: null,
    boxGesture: null,
    returnFocus: null,
    onConfirm: null,
  };

  const get = (selector) => document.querySelector(selector);
  const getAll = (selector) => [...document.querySelectorAll(selector)];
  const isOpen = () => get("#imageCropper")?.classList.contains("show");

  function loadImage(data) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片无法读取"));
      image.src = data;
    });
  }

  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  function cropRatio() {
    if (state.ratioMode === "free") return null;
    if (state.ratioMode === "source")
      return state.image.naturalWidth / state.image.naturalHeight;
    return Number(state.ratioMode) || 1;
  }

  function clampImagePosition() {
    const position = CropUtils.clampImageToCropBox(
      state.offsetX,
      state.offsetY,
      state.image.naturalWidth,
      state.image.naturalHeight,
      state.scale,
      state.cropBox,
    );
    state.offsetX = position.x;
    state.offsetY = position.y;
  }

  function syncZoomControl() {
    const progress = Math.log(state.scale / state.minScale) / Math.log(6);
    get("#cropZoom").value = String(
      Math.round(CropUtils.clamp(progress, 0, 1) * 100),
    );
  }

  function updateStatus() {
    if (!state.image) return;
    const width = Math.max(1, Math.round(state.cropBox.width / state.scale));
    const height = Math.max(1, Math.round(state.cropBox.height / state.scale));
    get("#cropStatus").textContent = `输出区域约 ${width} × ${height} 像素`;
  }

  function render() {
    if (!state.image || !state.viewportWidth) return;
    const canvas = get("#cropCanvas");
    const density = Math.min(global.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(state.viewportWidth * density));
    const pixelHeight = Math.max(1, Math.round(state.viewportHeight * density));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.width = `${state.viewportWidth}px`;
    canvas.style.height = `${state.viewportHeight}px`;
    const context = canvas.getContext("2d");
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
    context.fillStyle = "#101713";
    context.fillRect(0, 0, state.viewportWidth, state.viewportHeight);
    context.drawImage(
      state.image,
      state.offsetX,
      state.offsetY,
      state.image.naturalWidth * state.scale,
      state.image.naturalHeight * state.scale,
    );
    const selection = get("#cropSelection");
    selection.style.left = `${state.cropBox.x}px`;
    selection.style.top = `${state.cropBox.y}px`;
    selection.style.width = `${state.cropBox.width}px`;
    selection.style.height = `${state.cropBox.height}px`;
    updateStatus();
  }

  function sizeViewport(reset = false) {
    if (!state.image || !isOpen()) return;
    const stage = get("#cropperStage").getBoundingClientRect();
    const oldWidth = state.viewportWidth;
    const oldHeight = state.viewportHeight;
    const oldScale = state.scale;
    const oldBox = { ...state.cropBox };
    const oldCenterX = oldWidth
      ? (oldBox.x + oldBox.width / 2 - state.offsetX) / oldScale
      : state.image.naturalWidth / 2;
    const oldCenterY = oldHeight
      ? (oldBox.y + oldBox.height / 2 - state.offsetY) / oldScale
      : state.image.naturalHeight / 2;
    const oldZoom = state.minScale ? oldScale / state.minScale : 1;
    state.viewportWidth = Math.max(1, stage.width);
    state.viewportHeight = Math.max(1, stage.height);
    if (reset || !oldWidth || !oldHeight) {
      const ratio = cropRatio();
      const availableWidth = Math.max(120, state.viewportWidth * 0.7);
      const availableHeight = Math.max(120, state.viewportHeight * 0.7);
      const freeSize = Math.max(
        120,
        Math.min(state.viewportWidth, state.viewportHeight) * 0.52,
      );
      const fitted = ratio
        ? CropUtils.fitViewport(availableWidth, availableHeight, ratio)
        : { width: freeSize, height: freeSize };
      state.cropBox = {
        x: (state.viewportWidth - fitted.width) / 2,
        y: (state.viewportHeight - fitted.height) / 2,
        width: fitted.width,
        height: fitted.height,
      };
    } else {
      const scaleX = state.viewportWidth / oldWidth;
      const scaleY = state.viewportHeight / oldHeight;
      state.cropBox = CropUtils.clampCropBox(
        {
          x: oldBox.x * scaleX,
          y: oldBox.y * scaleY,
          width: oldBox.width * scaleX,
          height: oldBox.height * scaleY,
        },
        state.viewportWidth,
        state.viewportHeight,
        72,
      );
    }
    state.minScale = CropUtils.minimumScale(
      state.image.naturalWidth,
      state.image.naturalHeight,
      state.cropBox.width,
      state.cropBox.height,
    );
    state.scale = reset
      ? state.minScale
      : CropUtils.clamp(
          state.minScale * oldZoom,
          state.minScale,
          state.minScale * 6,
        );
    const centerX = reset ? state.image.naturalWidth / 2 : oldCenterX;
    const centerY = reset ? state.image.naturalHeight / 2 : oldCenterY;
    state.offsetX =
      state.cropBox.x + state.cropBox.width / 2 - centerX * state.scale;
    state.offsetY =
      state.cropBox.y + state.cropBox.height / 2 - centerY * state.scale;
    clampImagePosition();
    syncZoomControl();
    render();
  }

  function applyScale(scale, pointX, pointY) {
    const nextScale = CropUtils.clamp(
      scale,
      state.minScale,
      state.minScale * 6,
    );
    const zoomed = CropUtils.zoomAtPoint(state, nextScale, pointX, pointY);
    state.scale = zoomed.scale;
    state.offsetX = zoomed.offsetX;
    state.offsetY = zoomed.offsetY;
    clampImagePosition();
    syncZoomControl();
    render();
  }

  function applyCropBox(nextBox) {
    state.cropBox = CropUtils.clampCropBox(
      nextBox,
      state.viewportWidth,
      state.viewportHeight,
      72,
    );
    const nextMinimum = CropUtils.minimumScale(
      state.image.naturalWidth,
      state.image.naturalHeight,
      state.cropBox.width,
      state.cropBox.height,
    );
    state.minScale = nextMinimum;
    if (state.scale < nextMinimum) {
      applyScale(
        nextMinimum,
        state.cropBox.x + state.cropBox.width / 2,
        state.cropBox.y + state.cropBox.height / 2,
      );
      return;
    }
    state.scale = Math.min(state.scale, state.minScale * 6);
    clampImagePosition();
    syncZoomControl();
    render();
  }

  function close(restoreFocus = true) {
    const cropper = get("#imageCropper");
    cropper.classList.remove("show");
    cropper.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cropper-open");
    state.pointers.clear();
    state.gesture = null;
    state.boxGesture = null;
    if (restoreFocus) state.returnFocus?.focus?.();
  }

  async function open(source, options = {}) {
    const image = await loadImage(source.data);
    state.image = image;
    state.source = { ...source };
    state.target = options.target || "question";
    state.onConfirm = options.onConfirm || null;
    state.ratioMode = "free";
    state.pointers.clear();
    state.gesture = null;
    state.boxGesture = null;
    state.returnFocus = document.activeElement;
    getAll("[data-crop-ratio]").forEach((button) => {
      const active = button.dataset.cropRatio === "free";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    get("#cropperTitle").textContent =
      options.title ||
      (state.target === "answer" ? "裁剪答案图片" : "裁剪题目图片");
    get("#cropStatus").textContent = "";
    get("#imageCropper").classList.add("show");
    get("#imageCropper").setAttribute("aria-hidden", "false");
    document.body.classList.add("cropper-open");
    requestAnimationFrame(() => {
      sizeViewport(true);
      get("#cancelCropBtn").focus();
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function createCroppedFile() {
    const sourceX = CropUtils.clamp(
      (state.cropBox.x - state.offsetX) / state.scale,
      0,
      state.image.naturalWidth,
    );
    const sourceY = CropUtils.clamp(
      (state.cropBox.y - state.offsetY) / state.scale,
      0,
      state.image.naturalHeight,
    );
    const sourceWidth = Math.min(
      state.cropBox.width / state.scale,
      state.image.naturalWidth - sourceX,
    );
    const sourceHeight = Math.min(
      state.cropBox.height / state.scale,
      state.image.naturalHeight - sourceY,
    );
    const outputSize = CropUtils.outputSize(sourceWidth, sourceHeight);
    const output = document.createElement("canvas");
    output.width = outputSize.width;
    output.height = outputSize.height;
    const context = output.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      state.image,
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
    const baseName = String(state.source.name || "错题图片")
      .replace(/\.[^.]+$/, "")
      .slice(0, 80);
    const file = new File([blob], `${baseName}-裁剪.${extension}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
    return { file, data: await fileData(file), source: { ...state.source } };
  }

  function pointerPoint(event) {
    const rect = get("#cropCanvas").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startPinch() {
    if (state.pointers.size < 2) {
      state.gesture = null;
      return;
    }
    const [first, second] = [...state.pointers.values()];
    const midpoint = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    state.gesture = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midpoint,
      scale: state.scale,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    };
  }

  function bindBoxDrag(element, mode, handle = "") {
    element.addEventListener("pointerdown", (event) => {
      if (!isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      state.boxGesture = {
        pointerId: event.pointerId,
        mode,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        box: { ...state.cropBox },
      };
    });
    element.addEventListener("pointermove", (event) => {
      const gesture = state.boxGesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      applyCropBox(
        gesture.mode === "move"
          ? CropUtils.moveCropBox(
              gesture.box,
              deltaX,
              deltaY,
              state.viewportWidth,
              state.viewportHeight,
            )
          : CropUtils.resizeCropBox(
              gesture.box,
              gesture.handle,
              deltaX,
              deltaY,
              state.viewportWidth,
              state.viewportHeight,
              72,
              cropRatio(),
            ),
      );
    });
    const end = (event) => {
      if (state.boxGesture?.pointerId === event.pointerId)
        state.boxGesture = null;
    };
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }

  function bindKeyboardBoxControl(element, mode, handle = "") {
    element.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
        return;
      event.preventDefault();
      const amount = event.shiftKey ? 12 : 3;
      const deltaX = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
      const deltaY = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
      applyCropBox(
        mode === "move"
          ? CropUtils.moveCropBox(
              state.cropBox,
              deltaX,
              deltaY,
              state.viewportWidth,
              state.viewportHeight,
            )
          : CropUtils.resizeCropBox(
              state.cropBox,
              handle,
              deltaX,
              deltaY,
              state.viewportWidth,
              state.viewportHeight,
              72,
              cropRatio(),
            ),
      );
    });
  }

  function initialize() {
    get("#cancelCropBtn").addEventListener("click", () => close());
    get("#resetCropBtn").addEventListener("click", () => sizeViewport(true));
    getAll("[data-crop-ratio]").forEach((button) => {
      button.addEventListener("click", () => {
        state.ratioMode = button.dataset.cropRatio;
        getAll("[data-crop-ratio]").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        sizeViewport(true);
      });
    });
    get("#cropZoom").addEventListener("input", (event) => {
      const progress = Number(event.target.value) / 100;
      applyScale(
        state.minScale * 6 ** progress,
        state.cropBox.x + state.cropBox.width / 2,
        state.cropBox.y + state.cropBox.height / 2,
      );
    });
    get("#confirmCropBtn").addEventListener("click", async () => {
      const button = get("#confirmCropBtn");
      button.disabled = true;
      button.textContent = "处理中…";
      try {
        const result = await createCroppedFile();
        const callback = state.onConfirm;
        close(false);
        if (callback) await callback(result);
      } catch {
        get("#cropStatus").textContent = "裁剪失败，请重试或换一张图片";
      } finally {
        button.disabled = false;
        button.textContent = "确认裁剪";
      }
    });

    getAll("[data-crop-handle]").forEach((handle) => {
      bindBoxDrag(handle, "resize", handle.dataset.cropHandle);
      bindKeyboardBoxControl(handle, "resize", handle.dataset.cropHandle);
    });
    bindBoxDrag(get("#cropMoveHandle"), "move");
    bindKeyboardBoxControl(get("#cropMoveHandle"), "move");

    const canvas = get("#cropCanvas");
    canvas.addEventListener("pointerdown", (event) => {
      if (!isOpen()) return;
      event.preventDefault();
      const point = pointerPoint(event);
      canvas.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, point);
      if (state.pointers.size >= 2) startPinch();
    });
    canvas.addEventListener("pointermove", (event) => {
      const previous = state.pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      const point = pointerPoint(event);
      state.pointers.set(event.pointerId, point);
      if (state.pointers.size === 1) {
        state.offsetX += point.x - previous.x;
        state.offsetY += point.y - previous.y;
      } else {
        if (!state.gesture) startPinch();
        const [first, second] = [...state.pointers.values()];
        const midpoint = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        const distance = Math.max(
          1,
          Math.hypot(second.x - first.x, second.y - first.y),
        );
        const scale = CropUtils.clamp(
          state.gesture.scale * (distance / state.gesture.distance),
          state.minScale,
          state.minScale * 6,
        );
        const factor = scale / state.gesture.scale;
        state.scale = scale;
        state.offsetX =
          midpoint.x + (state.gesture.offsetX - state.gesture.midpoint.x) * factor;
        state.offsetY =
          midpoint.y + (state.gesture.offsetY - state.gesture.midpoint.y) * factor;
      }
      clampImagePosition();
      syncZoomControl();
      render();
    });
    const endPointer = (event) => {
      state.pointers.delete(event.pointerId);
      if (state.pointers.size >= 2) startPinch();
      else state.gesture = null;
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener(
      "wheel",
      (event) => {
        if (!isOpen()) return;
        event.preventDefault();
        const point = pointerPoint(event);
        applyScale(state.scale * (event.deltaY > 0 ? 0.92 : 1.08), point.x, point.y);
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (event) => {
      const amount = event.shiftKey ? 12 : 3;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "ArrowLeft") state.offsetX -= amount;
        if (event.key === "ArrowRight") state.offsetX += amount;
        if (event.key === "ArrowUp") state.offsetY -= amount;
        if (event.key === "ArrowDown") state.offsetY += amount;
        clampImagePosition();
        render();
      } else if (["+", "=", "-", "_"].includes(event.key)) {
        event.preventDefault();
        applyScale(
          state.scale * (["+", "="].includes(event.key) ? 1.08 : 0.92),
          state.cropBox.x + state.cropBox.width / 2,
          state.cropBox.y + state.cropBox.height / 2,
        );
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) close();
    });
    if ("ResizeObserver" in global)
      new ResizeObserver(() => sizeViewport()).observe(get("#cropperStage"));
    else global.addEventListener("resize", () => sizeViewport());
  }

  initialize();
  global.DesktopCropper = { open, close, isOpen };
})(window);
