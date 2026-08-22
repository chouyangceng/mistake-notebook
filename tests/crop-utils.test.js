const assert = require("assert");
const CropUtils = require("../mobile/crop-utils");

assert.strictEqual(CropUtils.normalizeQuarterTurns(-1), 3);
assert.strictEqual(CropUtils.normalizeQuarterTurns(5), 1);
assert.deepStrictEqual(CropUtils.rotatedSize(1200, 800, 0), {
  width: 1200,
  height: 800,
});
assert.deepStrictEqual(CropUtils.rotatedSize(1200, 800, 1), {
  width: 800,
  height: 1200,
});
assert.deepStrictEqual(CropUtils.rotatedSize(1200, 800, 3), {
  width: 800,
  height: 1200,
});

assert.deepStrictEqual(CropUtils.fitViewport(400, 300, 1), {
  width: 300,
  height: 300,
});
assert.deepStrictEqual(CropUtils.fitViewport(300, 400, 4 / 3), {
  width: 300,
  height: 225,
});

assert.strictEqual(CropUtils.minimumScale(1200, 800, 300, 300), 0.375);
assert.deepStrictEqual(
  CropUtils.clampPosition(20, -400, 1200, 800, 0.5, 300, 300),
  { x: 0, y: -100 },
);

assert.deepStrictEqual(
  CropUtils.zoomAtPoint(
    { scale: 1, offsetX: -50, offsetY: -25 },
    2,
    100,
    80,
  ),
  { scale: 2, offsetX: -200, offsetY: -130 },
);

assert.deepStrictEqual(
  CropUtils.clampCropBox(
    { x: -10, y: 260, width: 180, height: 100 },
    300,
    300,
    72,
  ),
  { x: 0, y: 200, width: 180, height: 100 },
);
assert.deepStrictEqual(
  CropUtils.moveCropBox(
    { x: 20, y: 30, width: 120, height: 100 },
    300,
    -50,
    320,
    240,
  ),
  { x: 200, y: 0, width: 120, height: 100 },
);
assert.deepStrictEqual(
  CropUtils.moveCropBox(
    { x: 40, y: 50, width: 120, height: 100 },
    -12,
    12,
    320,
    240,
  ),
  { x: 28, y: 62, width: 120, height: 100 },
);
assert.deepStrictEqual(
  CropUtils.resizeCropBox(
    { x: 50, y: 50, width: 150, height: 120 },
    "se",
    40,
    30,
    300,
    260,
    72,
  ),
  { x: 50, y: 50, width: 190, height: 150 },
);
assert.deepStrictEqual(
  CropUtils.resizeCropBox(
    { x: 50, y: 50, width: 120, height: 120 },
    "nw",
    -20,
    -20,
    300,
    300,
    72,
    1,
  ),
  { x: 30, y: 30, width: 140, height: 140 },
);
assert.deepStrictEqual(
  CropUtils.clampImageToCropBox(
    20,
    -400,
    1200,
    800,
    0.5,
    { x: 40, y: 50, width: 300, height: 250 },
  ),
  { x: 20, y: -100 },
);
assert.deepStrictEqual(
  CropUtils.clampImageToCropBox(
    -72,
    -25,
    400,
    300,
    1,
    { x: 50, y: 40, width: 200, height: 180 },
  ),
  { x: -72, y: -25 },
);
assert.deepStrictEqual(
  CropUtils.zoomAtPoint(
    { scale: 1, offsetX: -100, offsetY: -50 },
    1.2,
    150,
    120,
  ),
  { scale: 1.2, offsetX: -150, offsetY: -84 },
);

assert.deepStrictEqual(CropUtils.outputSize(4000, 3000), {
  width: 2048,
  height: 1536,
});
assert.deepStrictEqual(CropUtils.outputSize(800, 600), {
  width: 800,
  height: 600,
});
assert.deepStrictEqual(CropUtils.outputSize(10000, 10000), {
  width: 2000,
  height: 2000,
});

console.log("crop-utils tests passed");
