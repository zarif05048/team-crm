import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const context = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(fs.readFileSync("src/lib/panel-size.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { panelBounds, clampPanelWidth, savedPanelWidth, RESIZE_HANDLE_WIDTH } = context.exports;

for (const stored of [null, "", " ", "NaN", "Infinity", "-20", "0", "broken"]) {
  assert.equal(savedPanelWidth(stored, 240), 240, `Invalid preference: ${stored}`);
}
assert.equal(savedPanelWidth("315", 240), 315);

// The navigation and inbox share the same viewport budget. Even at their
// largest widths, enough space must remain for a readable conversation.
for (const viewport of [1024, 1280, 1440, 1920]) {
  const navigationLimits = panelBounds(viewport, 192, 400, 280 + RESIZE_HANDLE_WIDTH + 360);
  const navigation = clampPanelWidth(9999, navigationLimits, 240);
  const remaining = viewport - navigation - RESIZE_HANDLE_WIDTH;
  const inboxLimits = panelBounds(remaining, 280, 720, 360);
  const inbox = clampPanelWidth(9999, inboxLimits, 384);
  assert.ok(navigation >= 192 && navigation <= 400);
  assert.ok(inbox >= 280 && inbox <= 720);
  assert.ok(remaining - inbox - RESIZE_HANDLE_WIDTH >= 360);
  assert.equal(clampPanelWidth(-9999, inboxLimits, 384), 280);
}

// A wider saved layout fits temporarily in a smaller window, then restores
// when the window grows. Invalid numeric requests still stay inside bounds.
const preference = savedPanelWidth("600", 384);
assert.equal(clampPanelWidth(preference, panelBounds(774, 280, 720, 360), 384), 404);
assert.equal(clampPanelWidth(preference, panelBounds(1400, 280, 720, 360), 384), 600);
assert.equal(clampPanelWidth(NaN, panelBounds(774, 280, 720, 360), 384), 384);
assert.equal(clampPanelWidth(384.7, panelBounds(774, 280, 720, 360), 384), 385);
console.log("Saved panel widths, invalid preferences and readable three-panel width limits passed.");
