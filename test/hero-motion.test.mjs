import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hero mechanism rotates independently and respects reduced motion", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/src/styles.css", import.meta.url), "utf8");
  const script = await readFile(new URL("../web/src/main.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /class="hero-art-rotor"/);
  assert.match(html, /class="hero-art-sweep"/);
  assert.match(css, /@keyframes seal-orbit/);
  assert.match(css, /@keyframes seal-light-sweep/);
  assert.match(css, /\.hero\.is-spinning-fast \.hero-art-base/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.hero-art-base/);
  assert.match(script, /is-spinning-fast/);
});
