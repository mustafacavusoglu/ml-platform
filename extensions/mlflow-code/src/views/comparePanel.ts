import * as vscode from 'vscode';
import { effectiveTrackingUri, type MlflowConfig } from '../config';
import { latestMetrics } from '../core/mlflowModel';
import { MlflowClient } from '../mlflow/client';
import { MlflowAuthError, MlflowNotFoundError } from '../mlflow/errors';
import type { MlflowRun } from '../mlflow/types';

interface SerializedRun {
  id: string;
  name: string;
  status: string;
  startTime?: number;
  endTime?: number;
  metrics: Array<{ key: string; value: number }>;
  params: Array<{ key: string; value: string }>;
  tags: Array<{ key: string; value: string }>;
}

export class ComparePanel {
  private static current?: ComparePanel;

  private panel: vscode.WebviewPanel;
  private preselectedRunIds: ReadonlySet<string>;
  private runs: MlflowRun[] = [];
  private experimentId?: string;
  private experimentName?: string;

  constructor(
    private readonly client: MlflowClient,
    private readonly config: MlflowConfig,
    preselectedRunIds: ReadonlySet<string> = new Set()
  ) {
    this.preselectedRunIds = preselectedRunIds;
    if (ComparePanel.current) {
      const existing = ComparePanel.current;
      existing.panel.reveal(vscode.ViewColumn.Active);
      existing.preselectedRunIds = preselectedRunIds;
      this.panel = existing.panel;
      void existing.load();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'mlflowRunCompare',
      this.config.useDummyData ? 'MLflow Run Comparison (dummy)' : 'MLflow Run Comparison',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );
    this.panel.webview.html = getCompareHtml();
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    this.panel.onDidDispose(() => {
      if (ComparePanel.current === this) {
        ComparePanel.current = undefined;
      }
    });
    ComparePanel.current = this;
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await this.client.listExperimentRuns();
      this.runs = result.runs;
      this.experimentId = result.experiment.experimentId;
      this.experimentName = result.experiment.name;
      await this.postRuns();
    } catch (error) {
      const message =
        error instanceof MlflowAuthError
          ? 'Authentication required. Run MLflow: Sign in to OpenShift.'
          : error instanceof MlflowNotFoundError
            ? `Experiment "${this.config.namespace ?? ''}" not found.`
            : error instanceof Error
              ? error.message
              : String(error);
      await this.panel.webview.postMessage({ type: 'error', message });
    }
  }

  private async postRuns(): Promise<void> {
    const serialized = serializeRuns(this.runs);
    await this.panel.webview.postMessage({
      type: 'runs',
      runs: serialized,
      preselected: Array.from(this.preselectedRunIds),
      experiment: {
        id: this.experimentId ?? '',
        name: this.experimentName ?? '',
      },
    });
  }

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.postRuns();
        break;
      case 'refresh':
        await this.load();
        break;
      case 'copyCsv':
        if (typeof message.csv === 'string') {
          await vscode.env.clipboard.writeText(message.csv);
        }
        break;
      case 'openRun': {
        const runId = typeof message.runId === 'string' ? message.runId : undefined;
        if (runId) {
          const trackingUri = effectiveTrackingUri(this.config);
          if (trackingUri) {
            await vscode.env.openExternal(
              vscode.Uri.parse(
                `${trackingUri}/#/experiments/${this.experimentId ?? this.config.namespace ?? ''}/runs/${runId}`
              )
            );
          }
        }
        break;
      }
    }
  }
}

function serializeRuns(runs: MlflowRun[]): SerializedRun[] {
  return runs.map((run) => {
    const latest = latestMetrics(run.data.metrics);
    return {
      id: run.info.runId,
      name: run.info.runName ?? run.info.runId,
      status: run.info.status,
      startTime: run.info.startTime,
      endTime: run.info.endTime,
      metrics: Array.from(latest.values(), (metric) => ({ key: metric.key, value: metric.value })),
      params: run.data.params.map((param) => ({ key: param.key, value: param.value })),
      tags: run.data.tags.map((tag) => ({ key: tag.key, value: tag.value })),
    };
  });
}

function getCompareHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    :root {
      color-scheme: light dark;
      --border: var(--vscode-panel-border, #ccc);
      --muted: var(--vscode-descriptionForeground, #777);
      --accent: var(--vscode-focusBorder, #007fd4);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    button, input, select { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--border); padding: 5px 8px; }
    button { cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .experiment { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .experiment-id { color: var(--muted); font-weight: 400; font-size: 12px; }
    .layout { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 51px); }
    .picker { border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
    .picker-head { padding: 10px 12px; border-bottom: 1px solid var(--border); display: grid; gap: 8px; }
    .picker-head input { width: 100%; }
    .picker-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .picker-actions button { padding: 4px 7px; font-size: 12px; }
    .selection-count { color: var(--muted); font-size: 12px; }
    .run-list { overflow: auto; flex: 1; padding: 6px; }
    .run-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .run-item:hover { background: var(--vscode-list-hoverBackground); }
    .run-item input { margin-top: 2px; }
    .run-main { min-width: 0; display: grid; gap: 2px; }
    .run-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .run-meta { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; background: #888; flex: 0 0 9px; margin-top: 4px; }
    .status-dot.running { background: #4ec9b0; }
    .status-dot.finished { background: #4caf50; }
    .status-dot.failed { background: #f14c4c; }
    .status-dot.killed { background: #d7ba7d; }
    .comparison { min-width: 0; display: flex; flex-direction: column; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    .toolbar input[type="search"] { flex: 1 1 200px; min-width: 160px; }
    .column-picker { position: relative; }
    .column-menu { position: absolute; top: 100%; left: 0; z-index: 10; width: 280px; max-height: 420px; overflow: auto; background: var(--vscode-editorWidget-background, #252526); border: 1px solid var(--border); padding: 8px; box-shadow: 0 4px 12px rgb(0 0 0 / 20%); }
    .column-menu-head { display: flex; gap: 6px; margin-bottom: 8px; }
    .column-options { display: grid; gap: 5px; }
    .column-option { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .table-wrap { flex: 1; overflow: auto; }
    table { border-collapse: collapse; width: max-content; min-width: 100%; }
    th, td { border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); padding: 7px 11px; text-align: left; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
    th { position: sticky; top: 0; background: var(--vscode-editorWidget-background, #252526); z-index: 2; font-weight: 600; }
    th:first-child, td:first-child { position: sticky; left: 0; background: var(--vscode-editor-background); z-index: 1; }
    th:first-child { z-index: 3; }
    td.label { color: var(--muted); max-width: 280px; }
    td.metric { font-variant-numeric: tabular-nums; }
    .status-text { display: inline-flex; align-items: center; gap: 5px; }
    .status-text::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #888; display: inline-block; }
    .status-text.running::before { background: #4ec9b0; }
    .status-text.finished::before { background: #4caf50; }
    .status-text.failed::before { background: #f14c4c; }
    .status-text.killed::before { background: #d7ba7d; }
    .run-header { min-width: 160px; }
    .run-header-name { display: block; }
    .run-header-id { display: block; color: var(--muted); font-size: 11px; font-weight: 400; }
    .run-row-name, .run-row-id { display: block; }
    .run-row-id { color: var(--muted); font-size: 11px; font-weight: 400; }
    .link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; }
    .empty, .error { padding: 24px; color: var(--muted); }
    .error { color: var(--vscode-errorForeground); }
    @media (max-width: 720px) {
      .layout { grid-template-columns: 1fr; height: auto; }
      .picker { border-right: 0; border-bottom: 1px solid var(--border); max-height: 280px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="experiment">
      <span id="experiment-label"></span>
      <div class="experiment-id" id="experiment-id"></div>
    </div>
  </header>
  <div class="layout">
    <aside class="picker">
      <div class="picker-head">
        <input id="run-search" type="search" placeholder="Search runs" autocomplete="off">
        <div class="picker-actions">
          <button id="refresh">Refresh</button>
          <button id="all" class="secondary">Select all</button>
          <button id="none" class="secondary">Clear</button>
          <button id="newest" class="secondary">Newest 3</button>
          <button id="copy" class="secondary">Copy CSV</button>
        </div>
        <div class="selection-count" id="selection-count"></div>
      </div>
      <div class="run-list" id="run-list"></div>
    </aside>
    <section class="comparison">
      <div class="toolbar">
        <select id="metric" title="Sort runs by metric"></select>
        <div class="column-picker">
          <button id="columns-button" class="secondary">Columns</button>
          <div id="column-menu" class="column-menu" hidden>
            <div class="column-menu-head">
              <button id="columns-all" class="secondary">All</button>
              <button id="columns-none" class="secondary">None</button>
            </div>
            <div class="column-options" id="column-options"></div>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead id="head"></thead>
          <tbody id="body"></tbody>
        </table>
      </div>
      <div id="empty" class="empty" hidden>Select at least one run from the left panel.</div>
      <div id="error" class="error" hidden></div>
    </section>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let runs = [];
    let rows = [];
    let selected = new Set();
    let experiment = { id: '', name: '' };
    let runQuery = '';
    let rowQuery = '';
    let metricKey = 'start_time';
    let sortDirection = -1;
    let pendingPreselected = [];
    let hiddenColumns = new Set();

    const runList = document.getElementById('run-list');
    const head = document.getElementById('head');
    const body = document.getElementById('body');
    const empty = document.getElementById('empty');
    const error = document.getElementById('error');
    const runSearch = document.getElementById('run-search');
    const metricSelect = document.getElementById('metric');
    const selectionCount = document.getElementById('selection-count');
    const experimentLabel = document.getElementById('experiment-label');
    const experimentId = document.getElementById('experiment-id');
    const columnsButton = document.getElementById('columns-button');
    const columnMenu = document.getElementById('column-menu');
    const columnOptions = document.getElementById('column-options');

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'runs') {
        runs = message.runs || [];
        pendingPreselected = message.preselected || [];
        experiment = message.experiment || { id: '', name: '' };
        updateExperimentLabel();
        rows = buildRows(runs);
        initializeSelection();
        populateMetricSelect();
        populateColumnOptions();
        hideError();
        render();
      } else if (message.type === 'error') {
        showError(message.message || 'Unknown error');
      }
    });

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('all').addEventListener('click', () => {
      if (selected.size === runs.length && runs.length > 0) selected.clear();
      else selected = new Set(runs.map(run => run.id));
      render();
    });
    document.getElementById('none').addEventListener('click', () => { selected.clear(); render(); });
    document.getElementById('newest').addEventListener('click', () => { selected = new Set(runs.slice(0, 3).map(run => run.id)); render(); });
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ type: 'copyCsv', csv: toCsv(visibleRows(), orderedSelectedRuns()) }));
    runSearch.addEventListener('input', () => { runQuery = runSearch.value.trim().toLowerCase(); render(); });
    metricSelect.addEventListener('change', () => { metricKey = metricSelect.value; sortDirection = -1; renderComparison(); });
    head.addEventListener('click', (event) => {
      const th = event.target.closest('th[data-column]');
      if (!th) return;
      const key = th.dataset.column;
      if (metricKey === key) sortDirection *= -1; else { metricKey = key; sortDirection = -1; }
      metricSelect.value = key;
      renderComparison();
    });
    columnsButton.addEventListener('click', () => { columnMenu.hidden = !columnMenu.hidden; });
    document.getElementById('columns-all').addEventListener('click', () => { hiddenColumns.clear(); populateColumnOptions(); renderComparison(); });
    document.getElementById('columns-none').addEventListener('click', () => { hiddenColumns = new Set(rows.map(row => row.key)); populateColumnOptions(); renderComparison(); });
    body.addEventListener('click', (event) => {
      const link = event.target.closest('[data-run-link]');
      if (link) vscode.postMessage({ type: 'openRun', runId: link.dataset.runLink });
    });

    vscode.postMessage({ type: 'ready' });

    function buildRows(runs) {
      const byKey = new Map();
      const add = (key, label, type, runId, value) => {
        if (!byKey.has(key)) byKey.set(key, { key, label, type, values: {} });
        byKey.get(key).values[runId] = value;
      };
      for (const run of runs) {
        add('run_id', 'Run ID', 'string', run.id, run.id);
        add('status', 'Status', 'status', run.id, run.status);
        add('start_time', 'Start time', 'time', run.id, formatStart(run.startTime));
        add('duration', 'Duration', 'duration', run.id, duration(run.startTime, run.endTime));
        for (const metric of run.metrics) add('metric:' + metric.key, metric.key, 'number', run.id, metric.value);
        for (const param of run.params) add('param:' + param.key, param.key, 'string', run.id, param.value);
        for (const tag of run.tags) add('tag:' + tag.key, tag.key, 'string', run.id, tag.value);
      }
      return Array.from(byKey.values());
    }

    function initializeSelection() {
      const wanted = pendingPreselected.filter(id => runs.some(run => run.id === id));
      if (wanted.length > 0) selected = new Set(wanted);
      else if (runs.length <= 10) selected = new Set(runs.map(run => run.id));
      else selected = new Set(runs.slice(0, 3).map(run => run.id));
    }

    function updateExperimentLabel() {
      experimentLabel.textContent = experiment.name || 'MLflow experiment';
      experimentId.textContent = experiment.id ? 'id: ' + experiment.id : '';
    }

    function populateMetricSelect() {
      const previous = metricKey;
      metricSelect.innerHTML = '';
      for (const row of rows) {
        const option = document.createElement('option');
        option.value = row.key;
        option.textContent = row.label;
        metricSelect.appendChild(option);
      }
      metricSelect.value = rows.some(row => row.key === previous)
        ? previous
        : rows.some(row => row.key === 'start_time')
          ? 'start_time'
          : rows[0]?.key ?? '';
      metricKey = metricSelect.value;
    }

    function populateColumnOptions() {
      columnOptions.replaceChildren();
      for (const row of rows) {
        const option = document.createElement('label');
        option.className = 'column-option';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !hiddenColumns.has(row.key);
        input.addEventListener('change', () => {
          if (input.checked) hiddenColumns.delete(row.key); else hiddenColumns.add(row.key);
          renderComparison();
        });
        option.append(input, document.createTextNode(row.label));
        columnOptions.appendChild(option);
      }
    }

    function visibleRows() {
      return rows.filter(row => !hiddenColumns.has(row.key));
    }

    function render() {
      renderPicker();
      renderComparison();
      updateSelectAllLabel();
    }

    function updateSelectAllLabel() {
      const allButton = document.getElementById('all');
      allButton.textContent = selected.size === runs.length && runs.length > 0 ? 'Clear all' : 'Select all';
    }

    function renderPicker() {
      const visibleRuns = runs.filter(run => !runQuery || run.name.toLowerCase().includes(runQuery) || run.id.toLowerCase().includes(runQuery));
      selectionCount.textContent = selected.size + '/' + runs.length + ' selected';
      runList.replaceChildren();
      for (const run of visibleRuns) {
        const item = document.createElement('label');
        item.className = 'run-item';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = selected.has(run.id);
        check.addEventListener('change', () => {
          if (check.checked) selected.add(run.id); else selected.delete(run.id);
          render();
        });
        const dot = document.createElement('span');
        dot.className = 'status-dot ' + run.status.toLowerCase();
        const main = document.createElement('span');
        main.className = 'run-main';
        const name = document.createElement('span');
        name.className = 'run-name';
        name.textContent = run.name;
        const meta = document.createElement('span');
        meta.className = 'run-meta';
        meta.textContent = formatStart(run.startTime) + ' · ' + run.id;
        main.append(name, meta);
        item.append(check, dot, main);
        runList.appendChild(item);
      }
    }

    function renderComparison() {
      const allSelectedRuns = orderedSelectedRuns();
      const visibleRuns = allSelectedRuns.filter(run => !runQuery || run.name.toLowerCase().includes(runQuery) || run.id.toLowerCase().includes(runQuery));
      empty.hidden = allSelectedRuns.length !== 0;
      renderHead();
      body.replaceChildren();
      for (const run of visibleRuns) {
        const tr = document.createElement('tr');
        const runCell = document.createElement('td');
        runCell.className = 'label';
        const runName = document.createElement('span');
        runName.className = 'run-row-name';
        runName.textContent = run.name;
        const runId = document.createElement('span');
        runId.className = 'run-row-id';
        runId.textContent = run.id;
        runCell.append(runName, runId);
        tr.appendChild(runCell);
        for (const row of visibleRows()) {
          const td = document.createElement('td');
          const value = row.values[run.id];
          if (row.type === 'status') {
            const span = document.createElement('span');
            span.className = 'status-text ' + String(value || '').toLowerCase();
            span.textContent = value || '';
            td.appendChild(span);
          } else {
            td.textContent = value === undefined || value === '' ? '—' : String(value);
            if (row.type === 'number') {
              td.className = 'metric';
              const numericValue = Number(value);
              if (Number.isFinite(numericValue)) {
                td.style.backgroundColor = metricColor(row, numericValue, allSelectedRuns);
              }
            }
            if (row.type === 'time') {
              const link = document.createElement('span');
              link.className = 'link';
              link.dataset.runLink = run.id;
              link.textContent = td.textContent;
              td.replaceChildren(link);
            }
          }
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
    }

    function renderHead() {
      head.replaceChildren();
      const runHeader = document.createElement('th');
      runHeader.textContent = 'Run';
      head.appendChild(runHeader);
      for (const row of visibleRows()) {
        const th = document.createElement('th');
        th.dataset.column = row.key;
        th.style.cursor = 'pointer';
        th.textContent = row.label;
        th.title = 'Click to sort by ' + row.label;
        head.appendChild(th);
      }
    }

    function orderedSelectedRuns() {
      const ordered = orderedRuns();
      return ordered.filter(run => selected.has(run.id));
    }

    function orderedRuns() {
      const metricRow = rows.find(row => row.key === metricKey);
      if (!metricRow) return runs;
      return runs.slice().sort((a, b) => {
        return compareValues(metricRow.values[a.id], metricRow.values[b.id]) * sortDirection;
      });
    }

    function compareValues(a, b) {
      if (a === undefined || a === '' || a === null) return 1;
      if (b === undefined || b === '' || b === null) return -1;
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a).localeCompare(String(b));
    }

    function formatStart(value) {
      if (value === undefined || value === null) return '';
      return new Date(value).toISOString();
    }

    function metricColor(row, value, selectedRuns) {
      const values = selectedRuns
        .map(run => Number(row.values[run.id]))
        .filter(Number.isFinite);
      if (values.length < 2) return '';
      const min = Math.min(...values);
      const max = Math.max(...values);
      const normalized = max === min ? 0.5 : (value - min) / (max - min);
      const lowerIsBetter = /loss|error|mae|mse|rmse/i.test(row.key);
      const hue = lowerIsBetter ? (1 - normalized) * 120 : normalized * 120;
      return 'hsla(' + hue + ', 70%, 45%, 0.16)';
    }

    function duration(start, end) {
      if (start === undefined || start === null) return '';
      if (end === undefined || end === null) return 'running';
      const seconds = Math.max(0, Math.floor((end - start) / 1000));
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm ' + (seconds % 60) + 's';
      return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
    }

    function toCsv(rows, runs) {
      const header = ['Run', ...rows.map(row => row.label)];
      const lines = [header.map(escapeCsv).join(',')];
      for (const run of runs) {
        lines.push([run.name + ' (' + run.id + ')', ...rows.map(row => row.values[run.id] ?? '')].map(escapeCsv).join(','));
      }
      return lines.join('\\n');
    }

    function escapeCsv(value) {
      const text = String(value ?? '');
      return /[",\\n\\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function showError(message) {
      error.textContent = message;
      error.hidden = false;
    }

    function hideError() {
      error.textContent = '';
      error.hidden = true;
    }
  </script>
</body>
</html>`;
}
