import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hero mechanism rotates independently and respects reduced motion", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/src/styles.css", import.meta.url), "utf8");
  const script = await readFile(new URL("../web/src/main.js", import.meta.url), "utf8");

  assert.match(html, /class="hero-art-rotor"/);
  assert.match(css, /@keyframes seal-idle-spin/);
  assert.match(css, /\.hero-art-rotor\s*\{[^}]*animation:\s*seal-idle-spin/s);
  assert.match(css, /\.hero\.is-spinning-fast \.hero-art-rotor/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.hero-art-rotor/);
  assert.match(script, /is-spinning-fast/);
});
