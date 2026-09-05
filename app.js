(() => {
  "use strict";
  const dataset = window.LCB_PERSONA_DATA;
  if (!dataset || !Array.isArray(dataset.personas) || !dataset.personas.length) {
    document.querySelector("#resultStage").textContent = "人格データを読み込めなかった。ページを再読み込みしてほしい。";
    document.querySelector("#drawButton").disabled = true;
    return;
  }

  const personas = dataset.personas;
  const byId = new Map(personas.map((p) => [p.id, p]));
  const storageKey = "lcb-personality-picker-v1";
  const themeKey = "lcb-personality-picker-theme";
  const colors = {
    イサン: "#d4e1e8", ファウスト: "#ffb1b4", ドンキホーテ: "#ffef23",
    良秀: "#cf0000", ムルソー: "#293b95", ホンル: "#5bffde",
    ヒースクリフ: "#4e3076", イシュメール: "#ff9500", ロージャ: "#820000",
    シンクレア: "#8b9c15", ウーティス: "#325339", グレゴール: "#69350b",
  };
  const order = Object.keys(colors);
  const sinners = [
    ...order.filter((s) => personas.some((p) => p.sinner === s)),
    ...new Set(personas.map((p) => p.sinner).filter((s) => !order.includes(s))),
  ];
  const seasons = new Map(personas.map((p) => [String(p.season), p.seasonLabel]));
  const $ = (id) => document.getElementById(id);
  const defaults = { mode: "single", search: "", rarity: "all", season: "all", sinners: [], excludeDrawn: false, history: [] };
  let state = loadState();
  const results = { single: null, party: null };
  let copyTimer;
  let fitFrame;
  const mobile = window.matchMedia("(max-width: 760px)");

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved || typeof saved !== "object") return { ...defaults };
      const history = Array.isArray(saved.history)
        ? saved.history.filter((entry) => entry && byId.has(entry.id) && typeof entry.at === "string")
        : [];
      return {
        mode: saved.mode === "party" ? "party" : "single",
        search: typeof saved.search === "string" ? saved.search : "",
        rarity: ["all", "1", "2", "3"].includes(saved.rarity) ? saved.rarity : "all",
        season: seasons.has(saved.season) ? saved.season : "all",
        sinners: sinners.filter((s) => Array.isArray(saved.sinners) && saved.sinners.includes(s)),
        excludeDrawn: saved.excludeDrawn === true,
        history: [...new Map(history.map((entry) => [entry.id, entry])).values()],
      };
    } catch {
      return { ...defaults };
    }
  }
  function saveState() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Works without storage. */ }
  }
  function getTheme() {
    try {
      const saved = localStorage.getItem(themeKey);
      if (["light", "dark"].includes(saved)) return saved;
    } catch { /* Use system preference. */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("themeToggle").textContent = theme === "dark" ? "ライト" : "ダーク";
    $("themeToggle").setAttribute("aria-pressed", String(theme === "dark"));
    $("themeToggle").setAttribute("aria-label", theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える");
    document.querySelector("meta[name='theme-color']").content = theme === "dark" ? "#151614" : "#e9e6df";
  }
  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "wikiwiki.jp" ? escapeHtml(url.href) : "#";
    } catch { return "#"; }
  }
  function normalize(value) { return String(value).normalize("NFKC").toLocaleLowerCase("ja-JP").trim(); }
  function candidates() {
    const search = normalize(state.search);
    const excluded = new Set(state.history.map((entry) => entry.id));
    return personas.filter((p) =>
      (!search || [p.name, p.sinner, p.seasonLabel].some((value) => normalize(value).includes(search))) &&
      (state.rarity === "all" || String(p.rarity) === state.rarity) &&
      (state.season === "all" || String(p.season) === state.season) &&
      (!state.sinners.length || state.sinners.includes(p.sinner)) &&
      (!state.excludeDrawn || !excluded.has(p.id))
    );
  }
  function targetSinners() { return sinners.filter((s) => !state.sinners.length || state.sinners.includes(s)); }
  function partyGroups(pool = candidates()) {
    return targetSinners().map((sinner) => ({ sinner, pool: pool.filter((p) => p.sinner === sinner) }));
  }
  function randomIndex(length) {
    if (length <= 1) return 0;
    if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * length);
    const limit = 0x100000000 - (0x100000000 % length);
    const values = new Uint32Array(1);
    do { window.crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % length;
  }
  function mark(sinner) {
    return '<span class="sinner-mark" style="--sinner-color:' + (colors[sinner] || "#888877") + '" aria-hidden="true"></span>';
  }

  function renderSingle(persona) {
    const name = persona ? escapeHtml(persona.name) : "未抽出";
    $("resultStage").innerHTML = `
      <div class="single-result" style="--sinner-color:${persona ? colors[persona.sinner] || "#888877" : "var(--line)"}">
        <dl class="result-details">
          <div class="name-row"><dt>名前</dt><dd class="identity-name ${persona ? "" : "empty-value"}"><span>${name}</span></dd></div>
          <div><dt>囚人名</dt><dd class="sinner-value">${persona ? mark(persona.sinner) + escapeHtml(persona.sinner) : "—"}</dd></div>
          <div><dt>レア度</dt><dd>${persona ? "星" + persona.rarity : "—"}</dd></div>
          <div><dt>シーズン</dt><dd>${persona ? escapeHtml(persona.seasonLabel) : "—"}</dd></div>
        </dl>
        ${persona ? `<a class="result-link" href="${safeUrl(persona.detailUrl)}" target="_blank" rel="noreferrer">wikiで詳細を見る ↗</a>` : '<span class="result-link" aria-hidden="true">—</span>'}
      </div>`;
    scheduleFit();
  }
  function renderParty(party) {
    const rows = party || targetSinners().map((sinner) => ({ sinner }));
    $("resultStage").innerHTML = `
      <ol class="party-list" aria-label="囚人番号順のパーティ">
        ${rows.map((p) => `<li>
          <span class="party-sinner">${mark(p.sinner)}${escapeHtml(p.sinner)}</span>
          ${p.name ? `<a class="party-persona-name" href="${safeUrl(p.detailUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(p.sinner)}：${escapeHtml(p.name)}（wiki）">${escapeHtml(p.name)}</a>` : '<span class="party-persona-name empty-value">—</span>'}
        </li>`).join("")}
      </ol>`;
  }
  function renderResult() {
    const result = results[state.mode];
    $("resultStage").className = "result-stage " + (state.mode === "party" ? "party-stage" : "single-stage");
    if (state.mode === "party") renderParty(result);
    else renderSingle(result);
    $("copyButton").disabled = !result;
    $("resetButton").disabled = !result;
    clearTimeout(copyTimer);
    $("copyButton").textContent = "コピー";
  }
  function fitName() {
    const name = document.querySelector(".identity-name");
    if (!name) return;
    name.style.removeProperty("font-size");
    const style = getComputedStyle(name);
    const height = parseFloat(style.minHeight);
    let size = parseFloat(style.fontSize);
    const text = name.querySelector("span");
    while (size > 16 && text.getBoundingClientRect().height > height + 1) {
      size -= .5;
      name.style.fontSize = size + "px";
    }
    // No line clamp: extreme zoom or future longer names may grow, never disappear.
  }
  function scheduleFit() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitName);
  }
  function updatePool() {
    const pool = candidates();
    const missing = state.mode === "party" ? partyGroups(pool).filter((group) => !group.pool.length) : [];
    $("poolCount").textContent = pool.length.toLocaleString("ja-JP");
    $("modeNote").textContent = state.mode === "party" ? targetSinners().length + "人 · 各1人格" : "等確率 · 1人格";
    $("drawButton").disabled = !pool.length || !!missing.length;
    $("drawButton").setAttribute("aria-label", state.mode === "party" ? "パーティを抽出" : "人格を抽出");
    let warning = "";
    if (!pool.length) warning = "条件に合う人格がいない。条件を緩めるか、除外を解除してほしい。";
    else if (missing.length) warning = missing.map((g) => g.sinner).join("・") + "の候補がない。条件を緩めるか、囚人を指定してほしい。";
    $("poolWarning").textContent = warning;
    $("poolWarning").hidden = !warning;
    const active = [state.search.trim(), state.rarity !== "all", state.season !== "all", state.sinners.length, state.excludeDrawn].filter(Boolean).length;
    $("filterSummary").textContent = active ? active + "項目で絞り込み" : "すべて";
    $("sinnerSummary").textContent = state.sinners.length ? state.sinners.length + "人を指定" : "全員";
    $("clearHistoryButton").textContent = "除外を解除" + (state.history.length ? "（" + state.history.length + "）" : "");
    $("clearHistoryButton").disabled = !state.history.length;
    if (state.mode === "party" && !results.party) renderParty(null);
  }
  function renderMode() {
    $("singleModeButton").setAttribute("aria-pressed", String(state.mode === "single"));
    $("partyModeButton").setAttribute("aria-pressed", String(state.mode === "party"));
    $("drawButtonLabel").textContent = "抽出する";
    renderResult();
    updatePool();
  }
  function switchMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    clearNotice();
    saveState();
    renderMode();
  }
  function renderFilters() {
    $("searchInput").value = state.search;
    $("raritySelect").value = state.rarity;
    $("seasonSelect").value = state.season;
    $("excludeDrawn").checked = state.excludeDrawn;
    $("sinnerFilters").innerHTML = sinners.map((sinner) => `
      <label class="sinner-option" style="--sinner-color:${colors[sinner] || "#888877"}">
        <input type="checkbox" value="${escapeHtml(sinner)}"${state.sinners.includes(sinner) ? " checked" : ""}>
        <span>${escapeHtml(sinner)}</span>
      </label>`).join("");
  }
  function clearNotice() {
    $("actionNotice").hidden = true;
    $("actionNotice").textContent = "";
    $("drawMessage").textContent = "";
  }
  function actionError(message) {
    $("actionNotice").textContent = message;
    $("actionNotice").hidden = false;
  }
  function draw() {
    clearNotice();
    const pool = candidates();
    const groups = state.mode === "party" ? partyGroups(pool) : [];
    if (!pool.length || groups.some((g) => !g.pool.length)) { updatePool(); return; }
    const result = state.mode === "party"
      ? groups.map((g) => g.pool[randomIndex(g.pool.length)])
      : pool[randomIndex(pool.length)];
    results[state.mode] = result;
    const entries = (Array.isArray(result) ? result : [result]).map((p) => ({ id: p.id, at: new Date().toISOString() }));
    state.history = [...new Map([...state.history, ...entries].map((entry) => [entry.id, entry])).values()];
    saveState();
    renderResult();
    updatePool();
  }
  async function copyResult() {
    const result = results[state.mode];
    if (!result) return;
    const text = Array.isArray(result)
      ? ["Limbus Company パーティ抽出", ...result.map((p) => p.sinner + " / " + p.name)].join("\n")
      : ["Limbus Company 人格単発ガチャ", result.name + "（" + result.sinner + " / 星" + result.rarity + " / " + result.seasonLabel + "）", result.detailUrl].join("\n");
    clearNotice();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.className = "sr-only";
        textarea.setAttribute("readonly", "");
        document.body.append(textarea);
        textarea.select();
        let copied;
        try { copied = document.execCommand("copy"); } finally { textarea.remove(); $("copyButton").focus(); }
        if (!copied) throw new Error("Copy rejected");
      }
      if (results[state.mode] !== result) return;
      $("copyButton").textContent = "コピー済み";
      $("drawMessage").textContent = "結果をコピーした。";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { $("copyButton").textContent = "コピー"; }, 2000);
    } catch {
      actionError("コピーできなかった。結果の文字を選択してコピーしてほしい。");
    }
  }
  function filterChanged() { clearNotice(); saveState(); updatePool(); }
  $("filterForm").addEventListener("submit", (e) => e.preventDefault());
  $("singleModeButton").addEventListener("click", () => switchMode("single"));
  $("partyModeButton").addEventListener("click", () => switchMode("party"));
  $("drawButton").addEventListener("click", draw);
  $("copyButton").addEventListener("click", copyResult);
  $("resetButton").addEventListener("click", () => {
    results[state.mode] = null;
    clearNotice();
    renderResult();
    $("drawMessage").textContent = "結果をクリアした。除外履歴は維持している。";
  });
  $("searchInput").addEventListener("input", (e) => {
    if (e.isComposing) return;
    state.search = e.target.value;
    filterChanged();
  });
  $("searchInput").addEventListener("compositionend", (e) => { state.search = e.target.value; filterChanged(); });
  for (const [id, key] of [["raritySelect", "rarity"], ["seasonSelect", "season"]]) {
    $(id).addEventListener("change", (e) => { state[key] = e.target.value; filterChanged(); });
  }
  $("sinnerFilters").addEventListener("change", () => {
    state.sinners = [...$("sinnerFilters").querySelectorAll("input:checked")].map((input) => input.value);
    filterChanged();
  });
  $("clearSinnersButton").addEventListener("click", () => { state.sinners = []; renderFilters(); filterChanged(); });
  $("excludeDrawn").addEventListener("change", (e) => { state.excludeDrawn = e.target.checked; filterChanged(); });
  $("clearHistoryButton").addEventListener("click", () => {
    state.history = [];
    filterChanged();
    $("drawMessage").textContent = "除外履歴を解除した。";
  });
  $("resetFiltersButton").addEventListener("click", () => {
    state = { ...defaults, mode: state.mode, history: state.history, sinners: [] };
    renderFilters();
    filterChanged();
  });
  $("themeToggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(themeKey, theme); } catch { /* Optional preference. */ }
    applyTheme(theme);
  });
  mobile.addEventListener("change", () => { $("filterPanel").open = !mobile.matches; });
  new ResizeObserver(scheduleFit).observe($("resultStage"));
  document.fonts?.ready.then(scheduleFit);

  $("seasonSelect").innerHTML = '<option value="all">すべて</option>' + [...seasons]
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([value, label]) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + "</option>").join("");
  $("dataDate").textContent = dataset.meta?.fetchedAt ? "データ取得 " + dataset.meta.fetchedAt : "";
  $("filterPanel").open = !mobile.matches;
  applyTheme(getTheme());
  renderFilters();
  renderMode();
})();
