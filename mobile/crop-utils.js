(function exposeCropUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CropUtils = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normalizeQuarterTurns(turns) {
    return ((Math.trunc(Number(turns) || 0) % 4) + 4) % 4;
  }

  function rotatedSize(width, height, turns) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    return normalizeQuarterTurns(turns) % 2
      ? { width: safeHeight, height: safeWidth }
      : { width: safeWidth, height: safeHeight };
  }

  function fitViewport(width, height, aspectRatio) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const ratio = Math.max(0.05, Number(aspectRatio) || 1);
    if (safeWidth / safeHeight > ratio) {
      return { width: safeHeight * ratio, height: safeHeight };
    }
    return { width: safeWidth, height: safeWidth / ratio };
  }

  function minimumScale(imageWidth, imageHeight, viewportWidth, viewportHeight) {
    return Math.max(
      viewportWidth / Math.max(1, imageWidth),
      viewportHeight / Math.max(1, imageHeight),
    );
  }

  function clampPosition(
    offsetX,
    offsetY,
    imageWidth,
    imageHeight,
    scale,
    viewportWidth,
    viewportHeight,
  ) {
    const drawnWidth = imageWidth * scale;
    const drawnHeight = imageHeight * scale;
    return {
      x: clamp(offsetX, viewportWidth - drawnWidth, 0),
      y: clamp(offsetY, viewportHeight - drawnHeight, 0),
    };
  }

  function clampCropBox(box, boundsWidth, boundsHeight, minSize = 72) {
    const safeBoundsWidth = Math.max(1, Number(boundsWidth) || 1);
    const safeBoundsHeight = Math.max(1, Number(boundsHeight) || 1);
    const safeMin = Math.min(
      Math.max(24, Number(minSize) || 72),
      safeBoundsWidth,
      safeBoundsHeight,
    );
    const width = clamp(Number(box?.width) || safeMin, safeMin, safeBoundsWidth);
    const height = clamp(
      Number(box?.height) || safeMin,
      safeMin,
      safeBoundsHeight,
    );
    return {
      x: clamp(Number(box?.x) || 0, 0, safeBoundsWidth - width),
      y: clamp(Number(box?.y) || 0, 0, safeBoundsHeight - height),
      width,
      height,
    };
  }

  function moveCropBox(box, deltaX, deltaY, boundsWidth, boundsHeight) {
    return {
      ...box,
      x: clamp(box.x + deltaX, 0, boundsWidth - box.width),
      y: clamp(box.y + deltaY, 0, boundsHeight - box.height),
    };
  }

  function resizeCropBox(
    box,
    handle,
    deltaX,
    deltaY,
    boundsWidth,
    boundsHeight,
    minSize = 72,
    aspectRatio = null,
  ) {
    const west = String(handle).includes("w");
    const east = String(handle).includes("e");
    const north = String(handle).includes("n");
    const south = String(handle).includes("s");
    if (!(west || east) || !(north || south)) return { ...box };
    if (aspectRatio) {
      const ratio = Math.max(0.05, Number(aspectRatio) || 1);
      const anchorX = west ? box.x + box.width : box.x;
      const anchorY = north ? box.y + box.height : box.y;
      const widthFromX = box.width + (west ? -deltaX : deltaX);
      const widthFromY =
        (box.height + (north ? -deltaY : deltaY)) * ratio;
      let width =
        Math.abs(widthFromX - box.width) >=
        Math.abs(widthFromY - box.width)
          ? widthFromX
          : widthFromY;
      const minimumWidth = Math.max(minSize, minSize * ratio);
      const maximumWidth = Math.min(
        west ? anchorX : boundsWidth - anchorX,
        (north ? anchorY : boundsHeight - anchorY) * ratio,
      );
      width = clamp(width, Math.min(minimumWidth, maximumWidth), maximumWidth);
      const height = width / ratio;
      return {
        x: west ? anchorX - width : anchorX,
        y: north ? anchorY - height : anchorY,
        width,
        height,
      };
    }
    let left = box.x;
    let right = box.x + box.width;
    let top = box.y;
    let bottom = box.y + box.height;
    if (west) left = clamp(left + deltaX, 0, right - minSize);
    if (east) right = clamp(right + deltaX, left + minSize, boundsWidth);
    if (north) top = clamp(top + deltaY, 0, bottom - minSize);
    if (south) bottom = clamp(bottom + deltaY, top + minSize, boundsHeight);
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  function clampImageToCropBox(
    offsetX,
    offsetY,
    imageWidth,
    imageHeight,
    scale,
    cropBox,
  ) {
    const drawnWidth = imageWidth * scale;
    const drawnHeight = imageHeight * scale;
    return {
      x: clamp(offsetX, cropBox.x + cropBox.width - drawnWidth, cropBox.x),
      y: clamp(offsetY, cropBox.y + cropBox.height - drawnHeight, cropBox.y),
    };
  }

  function zoomAtPoint(state, nextScale, pointX, pointY) {
    const ratio = nextScale / state.scale;
    return {
      scale: nextScale,
      offsetX: pointX + (state.offsetX - pointX) * ratio,
      offsetY: pointY + (state.offsetY - pointY) * ratio,
    };
  }

  function outputSize(sourceWidth, sourceHeight, maxSide = 2048, maxPixels = 4_000_000) {
    const width = Math.max(1, sourceWidth);
    const height = Math.max(1, sourceHeight);
    const factor = Math.min(
      1,
      maxSide / Math.max(width, height),
      Math.sqrt(maxPixels / (width * height)),
    );
    return {
      width: Math.max(1, Math.round(width * factor)),
      height: Math.max(1, Math.round(height * factor)),
    };
  }

  return {
    clamp,
    normalizeQuarterTurns,
    rotatedSize,
    fitViewport,
    minimumScale,
    clampPosition,
    clampCropBox,
    moveCropBox,
    resizeCropBox,
    clampImageToCropBox,
    zoomAtPoint,
    outputSize,
  };
});
