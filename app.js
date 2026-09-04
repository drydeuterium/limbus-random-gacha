(() => {
  "use strict";

  const dataset = window.LCB_PERSONA_DATA;
  if (!dataset || !Array.isArray(dataset.personas)) {
    document.body.textContent = "人格データを読み込めなかった。";
    return;
  }

  const personas = dataset.personas;
  const personaById = new Map(personas.map((persona) => [persona.id, persona]));
  const storageKey = "lcb-personality-picker-v1";
  const themeStorageKey = "lcb-personality-picker-theme";
  const rarityColors = {
    1: "#2d7772",
    2: "#b58624",
    3: "#d85a49",
  };
  const sinnerOrder = [
    "イサン",
    "ファウスト",
    "ドンキホーテ",
    "良秀",
    "ムルソー",
    "ホンル",
    "ヒースクリフ",
    "イシュメール",
    "ロージャ",
    "シンクレア",
    "ウーティス",
    "グレゴール",
  ];
  const sinners = [
    ...sinnerOrder.filter((sinner) => personas.some((persona) => persona.sinner === sinner)),
    ...[...new Set(personas.map((persona) => persona.sinner))].filter(
      (sinner) => !sinnerOrder.includes(sinner),
    ),
  ];

  const elements = {
    resultStage: document.querySelector("#resultStage"),
    drawButton: document.querySelector("#drawButton"),
    copyButton: document.querySelector("#copyButton"),
    resetButton: document.querySelector("#resetButton"),
    drawMessage: document.querySelector("#drawMessage"),
    filterForm: document.querySelector("#filterForm"),
    filterPanel: document.querySelector("#filterPanel"),
    searchInput: document.querySelector("#searchInput"),
    raritySelect: document.querySelector("#raritySelect"),
    seasonSelect: document.querySelector("#seasonSelect"),
    sinnerFilters: document.querySelector("#sinnerFilters"),
    clearSinnersButton: document.querySelector("#clearSinnersButton"),
    sinnerSummary: document.querySelector("#sinnerSummary"),
    excludeDrawn: document.querySelector("#excludeDrawn"),
    poolCount: document.querySelector("#poolCount"),
    poolOdds: document.querySelector("#poolOdds"),
    historyCount: document.querySelector("#historyCount"),
    historySummaryCount: document.querySelector("#historySummaryCount"),
    poolWarning: document.querySelector("#poolWarning"),
    historyList: document.querySelector("#historyList"),
    clearHistoryButton: document.querySelector("#clearHistoryButton"),
    themeToggle: document.querySelector("#themeToggle"),
  };

  const defaultState = {
    search: "",
    rarity: "all",
    season: "all",
    sinners: [],
    excludeDrawn: false,
    history: [],
  };

  let state = loadState();
  let currentResult = null;
  let drawCount = 0;

  function getTheme() {
    try {
      const saved = localStorage.getItem(themeStorageKey);
      if (saved === "light" || saved === "dark") {
        return saved;
      }
    } catch {
      // Theme preference is a convenience only.
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    elements.themeToggle.textContent = theme === "dark" ? "ライト" : "ダーク";
    elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    elements.themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える",
    );
    document.querySelector("meta[name='theme-color']")?.setAttribute(
      "content",
      theme === "dark" ? "#0c0e0d" : "#d8d5cc",
    );
  }

  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Theme preference is a convenience only.
    }
    applyTheme(theme);
  }

  function syncFilterPanelToViewport() {
    const isMobile = window.matchMedia?.("(max-width: 760px)")?.matches;
    if (isMobile) {
      elements.filterPanel.removeAttribute("open");
    } else {
      elements.filterPanel.setAttribute("open", "");
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!saved || typeof saved !== "object") {
        return { ...defaultState };
      }
      return {
        ...defaultState,
        search: typeof saved.search === "string" ? saved.search : "",
        rarity: ["all", "1", "2", "3"].includes(saved.rarity) ? saved.rarity : "all",
        season:
          ["all", "0", "1", "2", "3", "4", "5", "6", "7", "W"].includes(saved.season)
            ? saved.season
            : "all",
        sinners: Array.isArray(saved.sinners)
          ? saved.sinners.filter((sinner) => sinners.includes(sinner))
          : [],
        excludeDrawn: saved.excludeDrawn === true,
        history: Array.isArray(saved.history)
          ? saved.history
              .filter(
                (entry) =>
                  entry &&
                  typeof entry.id === "string" &&
                  personaById.has(entry.id) &&
                  typeof entry.at === "string",
              )
              .slice(0, 200)
          : [],
      };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage is a convenience only; the picker still works without it.
    }
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCandidates() {
    const search = normalize(state.search);
    const selectedSinners = new Set(state.sinners);
    const drawnIds = new Set(state.history.map((entry) => entry.id));

    return personas.filter((persona) => {
      const matchesSearch =
        !search ||
        normalize(persona.name).includes(search) ||
        normalize(persona.sinner).includes(search) ||
        normalize(persona.seasonLabel).includes(search);
      const matchesRarity = state.rarity === "all" || String(persona.rarity) === state.rarity;
      const matchesSeason = state.season === "all" || persona.season === state.season;
      const matchesSinner =
        selectedSinners.size === 0 || selectedSinners.has(persona.sinner);
      const isNotDrawn = !state.excludeDrawn || !drawnIds.has(persona.id);
      return matchesSearch && matchesRarity && matchesSeason && matchesSinner && isNotDrawn;
    });
  }

  function secureRandomIndex(length) {
    if (length <= 1) {
      return 0;
    }
    if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
      return Math.floor(Math.random() * length);
    }

    const range = 0x100000000;
    const limit = range - (range % length);
    const values = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % length;
  }

  function rarityLabel(rarity) {
    return `星${rarity}`;
  }

  function formatOdds(count) {
    if (!count) {
      return "—";
    }
    return `${(100 / count).toFixed(2)}%`;
  }

  function resultMarkup(persona) {
    const color = rarityColors[persona.rarity] || "#8c9186";
    elements.resultStage.style.setProperty("--rarity-color", color);
    elements.resultStage.className = "result-stage has-result";
    elements.resultStage.innerHTML = `
      <div class="result-filled">
        <span class="result-status">RESULT / LOCKED</span>
        <span class="result-serial">NO.${escapeHtml(persona.id)} / DRAW ${String(drawCount).padStart(2, "0")}</span>
        <h3 class="result-name">${escapeHtml(persona.name)}</h3>
        <div class="result-metadata">
          <span class="result-badge"><span>囚人</span><strong>${escapeHtml(persona.sinner)}</strong></span>
          <span class="result-badge rarity-badge"><span>レア度</span><strong>${rarityLabel(persona.rarity)}</strong></span>
          <span class="result-badge"><span>区分</span><strong>${escapeHtml(persona.seasonLabel)}</strong></span>
          <a
            class="result-link"
            href="${escapeHtml(persona.detailUrl)}"
            target="_blank"
            rel="noreferrer"
          >wikiで詳細を見る</a>
        </div>
      </div>
    `;
  }

  function renderEmptyResult() {
    elements.resultStage.style.removeProperty("--rarity-color");
    elements.resultStage.className = "result-stage is-empty";
    elements.resultStage.innerHTML = `
      <div class="result-empty">
        <span class="result-status">WAITING</span>
        <p class="result-placeholder">未抽選</p>
      </div>
    `;
  }

  function renderPool() {
    const candidates = getCandidates();
    const count = candidates.length;
    const total = personas.length;
    elements.poolCount.textContent = count.toLocaleString("ja-JP");
    elements.poolOdds.textContent = formatOdds(count);
    elements.historyCount.textContent = state.history.length.toLocaleString("ja-JP");
    elements.drawButton.disabled = count === 0;

    if (!count) {
      elements.poolWarning.hidden = false;
      elements.poolWarning.textContent =
        "条件に合う人格がいない。検索語・星・シーズン・囚人の選択を緩めるか、履歴を消去する。";
    } else if (state.excludeDrawn && count < total && state.history.length > 0) {
      elements.poolWarning.hidden = false;
      elements.poolWarning.textContent = `「引いた人格を次回から除外」中。現在の条件では残り${count}人格。`;
    } else {
      elements.poolWarning.hidden = true;
      elements.poolWarning.textContent = "";
    }
  }

  function formatHistoryTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderHistory() {
    elements.historySummaryCount.textContent = `${state.history.length.toLocaleString("ja-JP")}件`;
    if (!state.history.length) {
      elements.historyList.innerHTML = '<p class="history-empty">まだ履歴なし。</p>';
      return;
    }

    elements.historyList.innerHTML = state.history
      .map((entry, index) => {
        const persona = personaById.get(entry.id);
        if (!persona) {
          return "";
        }
        const color = rarityColors[persona.rarity] || "#8c9186";
        return `
          <div class="history-row">
            <span class="history-number">#${String(index + 1).padStart(2, "0")}</span>
            <div class="history-name">
              ${escapeHtml(persona.name)}
              <span>${escapeHtml(persona.sinner)} / ${escapeHtml(persona.seasonLabel)}</span>
            </div>
            <div class="history-meta">
              <span class="history-rarity" style="--rarity-color: ${color}">${rarityLabel(persona.rarity)}</span>
              <span class="history-time">${escapeHtml(formatHistoryTime(entry.at))}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderSinnerFilters() {
    elements.sinnerSummary.textContent = state.sinners.length
      ? `${state.sinners.length}人`
      : "全員";
    elements.sinnerFilters.innerHTML = sinners
      .map((sinner) => {
        const checked = state.sinners.includes(sinner) ? " checked" : "";
        return `
          <label class="sinner-option">
            <input type="checkbox" value="${escapeHtml(sinner)}"${checked}>
            <span>${escapeHtml(sinner)}</span>
          </label>
        `;
      })
      .join("");
  }

  function setMessage(message, isError = false) {
    elements.drawMessage.textContent = message;
    elements.drawMessage.dataset.state = isError ? "error" : "success";
  }

  function draw() {
    const candidates = getCandidates();
    if (!candidates.length) {
      setMessage("抽選対象がないため、引けない。", true);
      renderPool();
      return;
    }

    const persona = candidates[secureRandomIndex(candidates.length)];
    currentResult = persona;
    drawCount += 1;
    state.history = [
      { id: persona.id, at: new Date().toISOString() },
      ...state.history,
    ].slice(0, 200);
    saveState();
    resultMarkup(persona);
    renderHistory();
    renderPool();
    elements.copyButton.hidden = false;
    setMessage(`${persona.sinner}の「${persona.name}」を引いた。`);
  }

  async function copyResult() {
    if (!currentResult) {
      return;
    }
    const text = [
      "Limbus Company 人格単発ガチャ",
      `${currentResult.name}（${currentResult.sinner} / ${rarityLabel(currentResult.rarity)} / ${currentResult.seasonLabel}）`,
      currentResult.detailUrl,
    ].join("\\n");

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setMessage("結果をクリップボードへコピーした。");
    } catch {
      setMessage("コピーできなかった。結果カードの文字を使って記録してほしい。", true);
    }
  }

  function syncFormFromState() {
    elements.searchInput.value = state.search;
    elements.raritySelect.value = state.rarity;
    elements.seasonSelect.value = state.season;
    elements.excludeDrawn.checked = state.excludeDrawn;
  }

  elements.filterForm?.addEventListener("submit", (event) => event.preventDefault());
  elements.drawButton.addEventListener("click", draw);
  elements.copyButton.addEventListener("click", copyResult);
  elements.resetButton.addEventListener("click", () => {
    currentResult = null;
    elements.copyButton.hidden = true;
    renderEmptyResult();
    setMessage("結果をリセットした。履歴は残っている。");
  });
  elements.clearHistoryButton.addEventListener("click", () => {
    state.history = [];
    saveState();
    renderHistory();
    renderPool();
    setMessage("抽選履歴を消去した。");
  });
  elements.clearSinnersButton.addEventListener("click", () => {
    state.sinners = [];
    saveState();
    renderSinnerFilters();
    renderPool();
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    saveState();
    renderPool();
  });
  elements.raritySelect.addEventListener("change", (event) => {
    state.rarity = event.target.value;
    saveState();
    renderPool();
  });
  elements.seasonSelect.addEventListener("change", (event) => {
    state.season = event.target.value;
    saveState();
    renderPool();
  });
  elements.excludeDrawn.addEventListener("change", (event) => {
    state.excludeDrawn = event.target.checked;
    saveState();
    renderPool();
  });
  elements.sinnerFilters.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") {
      return;
    }
    state.sinners = [...elements.sinnerFilters.querySelectorAll("input:checked")].map(
      (input) => input.value,
    );
    saveState();
    renderPool();
  });
  elements.themeToggle.addEventListener("click", toggleTheme);

  syncFilterPanelToViewport();
  applyTheme(getTheme());
  renderSinnerFilters();
  syncFormFromState();
  renderEmptyResult();
  renderHistory();
  renderPool();
})();
