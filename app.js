const csvPath = "gastric_cancer_trials_summary.csv";
const embeddedDatasets = window.CANCER_TRIAL_DATASETS;
const embeddedTrials = window.GASTRIC_CANCER_TRIALS;

const columns = [
  "標準治療",
  "試験名",
  "治療ライン",
  "レジメン",
  "試験レジメン",
  "対照レジメン",
  "対象患者",
  "PFS（月）",
  "OS（月）",
  "PFS-HR",
  "OS-HR",
  "ORR（%）",
  "DCR（%）",
  "CR率（%）",
  "対照群PFS（月）",
  "対照群OS（月）",
  "発表論文DOI",
  "発表年",
];

const numericColumns = new Set([
  "PFS（月）",
  "OS（月）",
  "PFS-HR",
  "OS-HR",
  "ORR（%）",
  "DCR（%）",
  "CR率（%）",
  "対照群PFS（月）",
  "対照群OS（月）",
  "発表年",
]);

const state = {
  datasetKey: "gastric",
  trials: [],
  global: "",
  columnFilters: Object.fromEntries(columns.map((column) => [column, ""])),
  line: "all",
  standardOnly: false,
  sort: {
    column: "治療ライン",
    direction: "asc",
    then: { column: "発表年", direction: "desc" },
  },
};

const tableHead = document.querySelector("#tableHead");
const tableBody = document.querySelector("#tableBody");
const resultCount = document.querySelector("#resultCount");
const globalSearch = document.querySelector("#globalSearch");
const standardOnly = document.querySelector("#standardOnly");
const resetFilters = document.querySelector("#resetFilters");
const lineFilters = document.querySelector("#lineFilters");
const datasetTabs = document.querySelector("#datasetTabs");
const datasetTitle = document.querySelector("#datasetTitle");
const datasetEyebrow = document.querySelector("#datasetEyebrow");

function availableDatasets() {
  if (embeddedDatasets && typeof embeddedDatasets === "object") return embeddedDatasets;
  if (Array.isArray(embeddedTrials)) {
    return {
      gastric: {
        label: "胃癌",
        title: "胃癌化学療法 Key Trials",
        eyebrow: "Gastric Cancer Chemotherapy Evidence",
        rows: embeddedTrials,
      },
    };
  }
  return {};
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function normalizeRow(row) {
  const normalized = { ...row };
  if (!("標準治療" in normalized)) normalized["標準治療"] = "FALSE";
  if (!("CR率（%）" in normalized) && "CR rate（%）" in normalized) {
    normalized["CR率（%）"] = normalized["CR rate（%）"];
  }
  if (!("対照群PFS（月）" in normalized) && "対象群PFS（月）" in normalized) {
    normalized["対照群PFS（月）"] = normalized["対象群PFS（月）"];
  }
  if (!("対照群OS（月）" in normalized) && "対象群OS（月）" in normalized) {
    normalized["対照群OS（月）"] = normalized["対象群OS（月）"];
  }
  columns.forEach((column) => {
    if (!(column in normalized)) normalized[column] = "";
    if (numericColumns.has(column)) {
      const numericValue = numberOrNull(normalized[column]);
      normalized[column] = numericValue ?? normalized[column];
    }
  });
  return normalized;
}

function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
}

function numberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text || ["ND", "NR"].includes(text.toUpperCase()) || text === "未確認") return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function treatmentLineRank(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.startsWith("1st")) return 1;
  if (text.startsWith("2nd/3rd")) return 2.5;
  if (text.startsWith("2nd")) return 2;
  if (text.startsWith("3rd")) return 3;
  if (text.startsWith("4th")) return 4;
  return 99;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayText(value) {
  if (value === null || value === undefined || value === "") return "";
  return value;
}

function isStandardTreatment(row) {
  return String(row["標準治療"] ?? "").trim().toUpperCase() === "TRUE";
}

function regimenTagClass(part) {
  const token = normalize(part);
  if (/(ipilimumab|tremelimumab)/i.test(token)) return "ctla";
  if (/(bevacizumab|ramucirumab|aflibercept|regorafenib|fruquintinib)/i.test(token)) return "vegf";
  if (/(cetuximab|panitumumab)/i.test(token)) return "egfr";
  if (/(sotorasib|adagrasib)/i.test(token)) return "ras";
  if (/(nivolumab|tislelizumab|pembrolizumab|Sintilimab|Toripalimab|Camrelizumab)/i.test(token)) return "ici";
  if (/(zanidatamab|trastuzumab|pertuzumab|t-dxd|deruxtecan)/i.test(token)) return "her";
  if (/bemarituzumab/i.test(token)) return "fgfr";
  if (/zolbetuximab/i.test(token)) return "cldn";
  if (/(chemo|chemotherapy|capox|folfox|mfolfox|sox|s-1|cisplatin|fluoropyrimidine|paclitaxel|irinotecan|ftd|tpi|tas-102)/i.test(token)) return "chemo";
  return "other";
}

function formatRegimen(value) {
  const parts = String(value)
    .split(/\s*\+\s*|＋/)
    .map((part) => part.trim())
    .filter(Boolean);

  return `<div class="regimen-tags">${parts.map((part, index) => (
    `${index > 0 ? '<span class="regimen-plus">＋</span>' : ""}<span class="regimen-tag ${regimenTagClass(part)}">${escapeHtml(part)}</span>`
  )).join("")}</div>`;
}

function formatValue(column, value) {
  const display = displayText(value);
  if (column === "標準治療") {
    const checked = String(display).trim().toUpperCase() === "TRUE" ? " checked" : "";
    return `<input class="standard-checkbox" type="checkbox" disabled${checked} aria-label="標準治療">`;
  }
  if (display === "") return "";
  if (String(display).toUpperCase() === "ND") return '<span class="unknown">ND</span>';
  if (column === "治療ライン") return `<span class="line-pill">${escapeHtml(display)}</span>`;
  if (column === "レジメン") return formatRegimen(display);
  if (column === "発表論文DOI") {
    const href = String(display).startsWith("http") ? display : `https://doi.org/${display}`;
    const label = String(display).replace(/^https?:\/\/doi\.org\//, "");
    return `<a class="doi-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }
  return escapeHtml(display);
}

function sortIndicator(column) {
  if (state.sort.column !== column) return "↕";
  return state.sort.direction === "asc" ? "↑" : "↓";
}

function buildHeader() {
  const labelRow = document.createElement("tr");
  const filterRow = document.createElement("tr");
  filterRow.className = "filter-row";

  columns.forEach((column) => {
    const th = document.createElement("th");
    th.dataset.column = column;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-button";
    button.setAttribute("aria-label", `${column}でソート`);
    button.innerHTML = `<span>${escapeHtml(column)}</span><span class="sort-indicator">${sortIndicator(column)}</span>`;
    button.addEventListener("click", () => changeSort(column));
    th.appendChild(button);
    labelRow.appendChild(th);

    const filterTh = document.createElement("th");
    filterTh.dataset.column = column;
    if (column !== "標準治療") {
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "絞込";
      input.value = state.columnFilters[column];
      input.addEventListener("input", (event) => {
        state.columnFilters[column] = event.target.value;
        render();
      });
      filterTh.appendChild(input);
    }
    filterRow.appendChild(filterTh);
  });

  tableHead.replaceChildren(labelRow, filterRow);
}

function changeSort(column) {
  if (state.sort.column === column) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
    delete state.sort.then;
  } else {
    state.sort = { column, direction: "asc" };
  }
  buildHeader();
  render();
}

function filteredRows() {
  const globalNeedle = normalize(state.global);
  const activeColumnFilters = Object.entries(state.columnFilters)
    .filter(([, value]) => normalize(value));

  return state.trials.filter((row) => {
    if (state.line !== "all" && row["治療ライン"] !== state.line) return false;
    if (state.standardOnly && !isStandardTreatment(row)) return false;

    const rowText = normalize(columns.map((column) => row[column]).join(" "));
    if (globalNeedle && !rowText.includes(globalNeedle)) return false;

    return activeColumnFilters.every(([column, value]) => {
      return normalize(displayText(row[column])).includes(normalize(value));
    });
  });
}

function sortedRows(rows) {
  const { column, direction, then } = state.sort;

  return [...rows].sort((a, b) => {
    const primary = compareRows(a, b, column, direction);
    if (primary !== 0) return primary;
    if (!then) return 0;
    return compareRows(a, b, then.column, then.direction);
  });
}

function compareRows(a, b, column, direction) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (column === "標準治療") {
    return (Number(isStandardTreatment(a)) - Number(isStandardTreatment(b))) * multiplier;
  }

  if (column === "治療ライン") {
    const aRank = treatmentLineRank(a[column]);
    const bRank = treatmentLineRank(b[column]);
    if (aRank !== bRank) return (aRank - bRank) * multiplier;
  }

  if (numericColumns.has(column)) {
    const aNum = numberOrNull(a[column]);
    const bNum = numberOrNull(b[column]);
    if (aNum === null && bNum === null) return 0;
    if (aNum === null) return 1;
    if (bNum === null) return -1;
    return (aNum - bNum) * multiplier;
  }

  return normalize(a[column]).localeCompare(normalize(b[column]), "ja") * multiplier;
}

function renderBody(rows) {
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="empty-state" colspan="${columns.length}">条件に一致する試験はありません。</td>`;
    tableBody.replaceChildren(tr);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      td.dataset.column = column;
      if (numericColumns.has(column)) td.classList.add("numeric");
      if (column === "標準治療") td.classList.add("standard-cell");
      if (column === "試験名") td.classList.add("trial-name");
      if (column === "レジメン") td.classList.add("regimen-name");
      td.title = String(displayText(row[column]) ?? "");
      td.innerHTML = formatValue(column, row[column]);
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  tableBody.replaceChildren(fragment);
}

function renderLineFilters() {
  const lines = ["all", ...new Set(state.trials.map((trial) => trial["治療ライン"]).filter(Boolean))];
  lineFilters.replaceChildren(...lines.map((line) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = line === "all" ? "すべて" : line;
    button.className = state.line === line ? "active" : "";
    button.addEventListener("click", () => {
      state.line = line;
      renderLineFilters();
      render();
    });
    return button;
  }));
}

function renderDatasetTabs() {
  const datasets = availableDatasets();
  datasetTabs.replaceChildren(...Object.entries(datasets).map(([key, dataset]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = dataset.label;
    button.className = state.datasetKey === key ? "active" : "";
    button.setAttribute("aria-pressed", state.datasetKey === key ? "true" : "false");
    button.addEventListener("click", () => changeDataset(key));
    return button;
  }));
}

function resetFilterState() {
  state.global = "";
  state.line = "all";
  state.standardOnly = false;
  state.columnFilters = Object.fromEntries(columns.map((column) => [column, ""]));
  globalSearch.value = "";
  standardOnly.checked = false;
}

function renderMetrics() {
  document.querySelector("#metricTrials").textContent = state.trials.length;
  document.querySelector("#metricLines").textContent = new Set(state.trials.map((trial) => trial["治療ライン"])).size;
}

function render() {
  const rows = sortedRows(filteredRows());
  resultCount.textContent = `${rows.length}件`;
  renderBody(rows);
}

function showLoadError(error) {
  resultCount.textContent = "0件";
  tableBody.innerHTML = `<tr><td class="empty-state" colspan="${columns.length}">
    データを読み込めませんでした。trial-data.jsをCSVから再生成してから開いてください。<br>
    <small>${escapeHtml(error.message)}</small>
  </td></tr>`;
}

async function loadTrials() {
  const datasets = availableDatasets();
  const dataset = datasets[state.datasetKey];
  if (dataset && Array.isArray(dataset.rows)) {
    datasetTitle.textContent = dataset.title;
    datasetEyebrow.textContent = dataset.eyebrow;
    state.trials = dataset.rows.map((row) => normalizeRow(row));
    return;
  }

  const response = await fetch(csvPath, { cache: "no-store" });
  if (!response.ok) throw new Error(`${csvPath}: ${response.status}`);
  const csv = await response.text();
  const rows = parseCsv(csv);
  const headers = (rows.shift() ?? []).map((header) => header.trim());
  state.trials = rows.map((cells) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return normalizeRow(row);
  });
}

function changeDataset(key) {
  if (state.datasetKey === key) return;
  state.datasetKey = key;
  resetFilterState();
  loadTrials()
    .then(() => {
      buildHeader();
      renderDatasetTabs();
      renderMetrics();
      renderLineFilters();
      render();
    })
    .catch(showLoadError);
}

globalSearch.addEventListener("input", (event) => {
  state.global = event.target.value;
  render();
});

standardOnly.addEventListener("change", (event) => {
  state.standardOnly = event.target.checked;
  render();
});

resetFilters.addEventListener("click", () => {
  resetFilterState();
  buildHeader();
  renderLineFilters();
  render();
});

buildHeader();
renderDatasetTabs();
loadTrials()
  .then(() => {
    renderMetrics();
    renderLineFilters();
    render();
  })
  .catch(showLoadError);
