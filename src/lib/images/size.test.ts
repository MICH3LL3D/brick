import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { imageSize, sizeOk } from "./size";

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  b.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test("png sizes are read from the header", () => assert.deepEqual(imageSize(png(640, 480), "image/png"), { w: 640, h: 480 }));

test("thumbnails, banners and oversize pictures are rejected", () => {
  assert.equal(sizeOk(png(640, 480), "image/png"), true);
  assert.equal(sizeOk(png(120, 120), "image/png"), false); // tiny
  assert.equal(sizeOk(png(1600, 300), "image/png"), false); // banner
  assert.equal(sizeOk(png(9000, 9000), "image/png"), false); // huge
  assert.equal(sizeOk(Buffer.from("not an image"), "image/jpeg"), false); // unreadable header
});

test("real saved jpegs parse", { skip: !fs.existsSync(path.join(process.cwd(), "public/part-images")) }, () => {
  const dir = path.join(process.cwd(), "public/part-images");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jpg")).slice(0, 5)) {
    const s = imageSize(fs.readFileSync(path.join(dir, f)), "image/jpeg");
    assert.ok(s && s.w > 0 && s.h > 0, f);
  }
});
