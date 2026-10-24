import { test } from "node:test";
import assert from "node:assert/strict";
import { ManualSet } from "./manual-format";
import { SAMPLE_MANUALS } from "./manual-sample";

test("sample manuals parse and have 12 books / 37 pages", () => {
  const m = ManualSet.parse(SAMPLE_MANUALS);
  assert.equal(m.books.length, 12);
  assert.equal(m.books.reduce((n, b) => n + b.pages.length, 0), 37);
});

test("every SEE tag points at a page that exists", () => {
  for (const b of SAMPLE_MANUALS.books) for (const p of b.pages) for (const s of p.see) {
    const t = SAMPLE_MANUALS.books.find((x) => x.id === s.book);
    assert.ok(t?.pages[s.page - 1], `${b.id}.${p.page} -> ${s.book}.${s.page}`);
  }
});
