import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("vault controls expose a persistent autonomous closeout status card", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const script = await readFile(
    new URL("../web/src/main.js", import.meta.url),
    "utf8",
  );

  assert.match(html, /id="autonomy-card"/);
  assert.match(html, /id="autonomy-status"/);
  assert.match(html, /id="autonomy-detail"/);
  assert.match(script, /els\.autonomyCard\.hidden/);
  assert.match(script, /els\.autonomyStatus\.textContent/);
  assert.match(script, /els\.autonomyDetail\.textContent/);
});
