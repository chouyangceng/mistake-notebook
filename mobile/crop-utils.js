(function exposeCropUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CropUtils = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    fitViewport,
    minimumScale,
    clampPosition,
    zoomAtPoint,
    outputSize,
  };
});
