const assert = require("assert");
const CropUtils = require("../mobile/crop-utils");

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
