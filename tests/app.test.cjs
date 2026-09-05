const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "data/personas.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function boot(saved = null, options = {}) {
  const elements = new Map();
  class Element {
    constructor() { this.textContent = ""; this.innerHTML = ""; this.hidden = false; this.disabled = false; this.value = ""; this.checked = false; this.attributes = {}; this.handlers = {}; this.style = {}; }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.handlers[k] = fn; }
    querySelectorAll() { return options.checkedSinners || []; }
    append() {}
    focus() {}
    select() {}
    remove() {}
  }
  const el = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const storage = new Map(saved ? [["lcb-personality-picker-v1", JSON.stringify(saved)]] : []);
  const copied = [];
  const media = { matches: false, addEventListener() {} };
  const context = {
    window: { matchMedia: () => media, crypto: { getRandomValues: (arr) => { arr[0] = 0; return arr; } } },
    document: {
      getElementById: el, querySelector: (sel) => el(sel),
      documentElement: { dataset: {} }, body: new Element(), fonts: { ready: Promise.resolve() },
      createElement: () => new Element(), execCommand: () => false,
    },
    localStorage: {
      getItem: (key) => { if (options.storageThrows) throw Error("Unavailable"); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (options.storageThrows) throw Error("Unavailable"); storage.set(key, value); },
    },
    navigator: { clipboard: { writeText: async (text) => { if (options.copyFails) throw Error("Denied"); copied.push(text); } } },
    URL, Map, Set, Date, Uint32Array, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    ResizeObserver: class { observe() {} }, setTimeout: () => 1, clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(dataSource, context);
  if (options.mutateDataset) options.mutateDataset(context.window.LCB_PERSONA_DATA);
  vm.runInContext(appSource, context);
  const click = async (id) => { if (!el(id).disabled) await el(id).handlers.click?.(); };
  const change = async (id, value, kind = "change") => {
    el(id).value = value;
    await el(id).handlers[kind]?.({ target: el(id), isComposing: false });
  };
  return { el, click, change, copied, context, storage };
}

test("single draw, details and real copy line breaks", async () => {
  const app = boot();
  assert.equal(app.el("poolCount").textContent, "185");
  await app.click("drawButton");
  const html = app.el("resultStage").innerHTML;
  for (const field of ["名前", "囚人名", "レア度", "シーズン"]) assert.ok(html.includes(field));
  await app.click("copyButton");
  assert.equal(app.copied[0].split("\n").length, 3);
  assert.ok(!app.copied[0].includes("\\n"));
  assert.ok(app.el("copyButton").textContent.includes("コピー済み"));
});
test("party has one of each sinner in canonical order and labelled copy", async () => {
  const app = boot();
  await app.click("partyModeButton");
  await app.click("drawButton");
  assert.equal((app.el("resultStage").innerHTML.match(/<li>/g) || []).length, 12);
  await app.click("copyButton");
  const lines = app.copied[0].split("\n").slice(1);
  assert.deepEqual(lines.map((line) => line.split(" / ")[0]), [
    "イサン", "ファウスト", "ドンキホーテ", "良秀", "ムルソー", "ホンル",
    "ヒースクリフ", "イシュメール", "ロージャ", "シンクレア", "ウーティス", "グレゴール",
  ]);
});
test("mode switches retain each result; same-mode click is not destructive", async () => {
  const app = boot();
  await app.click("drawButton");
  const single = app.el("resultStage").innerHTML;
  await app.click("singleModeButton");
  assert.equal(app.el("resultStage").innerHTML, single);
  await app.click("partyModeButton");
  await app.click("drawButton");
  const party = app.el("resultStage").innerHTML;
  await app.click("singleModeButton");
  assert.equal(app.el("resultStage").innerHTML, single);
  await app.click("partyModeButton");
  assert.equal(app.el("resultStage").innerHTML, party);
});
test("missing party candidate disables extraction and exposes recovery", async () => {
  const app = boot();
  await app.click("partyModeButton");
  await app.change("searchInput", "イサン", "input");
  assert.equal(app.el("drawButton").disabled, true);
  assert.equal(app.el("poolWarning").hidden, false);
  assert.ok(app.el("poolWarning").textContent.includes("ファウスト"));
  await app.click("resetFiltersButton");
  assert.equal(app.el("drawButton").disabled, false);
});
test("exclusion cannot repeat any of 185 personalities; result clear preserves exclusion", async () => {
  const app = boot({ excludeDrawn: true });
  for (let i = 0; i < 185; i++) {
    assert.equal(app.el("drawButton").disabled, false);
    await app.click("drawButton");
  }
  assert.equal(app.el("poolCount").textContent, "0");
  assert.equal(app.el("drawButton").disabled, true);
  await app.click("resetButton");
  assert.equal(app.el("poolCount").textContent, "0");
  await app.click("clearHistoryButton");
  assert.equal(app.el("poolCount").textContent, "185");
  assert.equal(app.el("drawButton").disabled, false);
});
test("saved filters migrate, future seasons are populated, selected sinners stay ordered", async () => {
  const app = boot({ mode: "party", sinners: ["グレゴール", "イサン"], season: "99" }, {
    mutateDataset: (data) => { data.personas.push({ ...data.personas[0], id: "test-new", season: "99", seasonLabel: "Season 99" }); },
  });
  assert.ok(app.el("seasonSelect").innerHTML.includes("Season 99"));
  assert.equal(app.el("seasonSelect").value, "99");
  await app.change("seasonSelect", "all");
  await app.click("drawButton");
  await app.click("copyButton");
  assert.deepEqual(app.copied[0].split("\n").slice(1).map((line) => line.split(" / ")[0]), ["イサン", "グレゴール"]);
});
test("storage unavailable still permits extraction", async () => {
  const app = boot(null, { storageThrows: true });
  await app.click("drawButton");
  assert.equal(app.el("copyButton").disabled, false);
});
test("clipboard failure is visible and is not reported as success", async () => {
  const app = boot(null, { copyFails: true });
  await app.click("drawButton");
  await app.click("copyButton");
  assert.equal(app.el("actionNotice").hidden, false);
  assert.ok(app.el("actionNotice").textContent.includes("コピーできなかった"));
  assert.equal(app.el("copyButton").textContent, "コピー");
});
test("result text is escaped and non-wiki links are blocked", async () => {
  const app = boot(null, { mutateDataset: (data) => {
    data.personas[0].name = '<img src=x onerror="alert(1)">';
    data.personas[0].detailUrl = "javascript:alert(1)";
  } });
  await app.click("drawButton");
  const html = app.el("resultStage").innerHTML;
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes('href="javascript:'));
});
