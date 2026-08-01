import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hero artwork remains a single static image", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/src/styles.css", import.meta.url), "utf8");
  const script = await readFile(new URL("../web/src/main.js", import.meta.url), "utf8");

  assert.equal((html.match(/mandate-seal\.webp/g) ?? []).length, 1);
  assert.doesNotMatch(html, /hero-art-rotor/);
  assert.doesNotMatch(css, /rotor-plate-spin|hero-art-rotor|seal-light-sweep/);
  assert.doesNotMatch(script, /alignHeroRotor|is-spinning-fast|is-seal-paused/);
});
