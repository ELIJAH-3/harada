(() => {
  const JSONBIN = "https://api.jsonbin.io/v3";
  const LOCAL_CHART = "harada.chart";
  const LOCAL_CONFIG = "harada.config";

  const log = {
    info: (event, data) => console.info("[Harada]", event, data || ""),
    warn: (event, data) => console.warn("[Harada]", event, data || ""),
    error: (event, data) => console.error("[Harada]", event, data || "")
  };

  function maskSecret(value) {
    const text = String(value || "");
    if (!text) return "(empty)";
    if (text.length <= 8) return `${text.slice(0, 2)}…`;
    return `${text.slice(0, 4)}…${text.slice(-4)}`;
  }

  function envConfig() {
    const env = window.HARADA_CONFIG || {};
    return {
      masterKey: String(env.masterKey || env.JSONBIN_MASTER_KEY || "").trim(),
      binId: String(env.binId || env.JSONBIN_BIN_ID || "").trim()
    };
  }

  const BLOCKS = [
    { id: "nw", label: "1 · NW" },
    { id: "n", label: "2 · N" },
    { id: "ne", label: "3 · NE" },
    { id: "w", label: "8 · W" },
    { id: "c", label: "Center 3×3" },
    { id: "e", label: "4 · E" },
    { id: "sw", label: "7 · SW" },
    { id: "s", label: "6 · S" },
    { id: "se", label: "5 · SE" }
  ];

  const SUB_POS = { nw: 0, n: 1, ne: 2, w: 3, e: 5, sw: 6, s: 7, se: 8 };
  const HARADA_MARK = ["1", "2", "3", "8", "★", "4", "7", "6", "5"];

  const macro = document.getElementById("macro");
  const titleInput = document.getElementById("chart-title");
  const statusEl = document.getElementById("status");
  const settings = document.getElementById("settings");
  const masterKeyInput = document.getElementById("master-key");
  const binIdInput = document.getElementById("bin-id");

  const cells = {};
  let saveTimer = 0;
  let saving = false;
  let pendingSave = false;
  let ready = false;
  let dirty = false;

  function emptyChart() {
    return {
      version: 1,
      title: "",
      updatedAt: null,
      center: ["", "", "", "", "", "", "", "", ""],
      actions: {
        nw: ["", "", "", "", "", "", "", ""],
        n: ["", "", "", "", "", "", "", ""],
        ne: ["", "", "", "", "", "", "", ""],
        w: ["", "", "", "", "", "", "", ""],
        e: ["", "", "", "", "", "", "", ""],
        sw: ["", "", "", "", "", "", "", ""],
        s: ["", "", "", "", "", "", "", ""],
        se: ["", "", "", "", "", "", "", ""]
      }
    };
  }

  function actionIndex(pos) {
    return pos < 4 ? pos : pos - 1;
  }

  function buildGrid() {
    BLOCKS.forEach((block) => {
      const section = document.createElement("section");
      section.className = "block";
      section.dataset.block = block.id;
      section.dataset.label = block.label;

      for (let pos = 0; pos < 9; pos += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        const area = document.createElement("textarea");
        area.rows = 1;
        area.maxLength = 240;
        area.autocomplete = "off";
        area.spellcheck = false;

        const mark = document.createElement("span");
        mark.className = "mark";

        if (block.id === "c") {
          if (pos === 4) {
            cell.classList.add("main");
            mark.textContent = "★ Main goal";
            area.placeholder = "Specific, time-bound main goal";
          } else {
            const key = Object.keys(SUB_POS).find((k) => SUB_POS[k] === pos);
            cell.classList.add("sub");
            cell.dataset.key = key;
            mark.textContent = HARADA_MARK[pos];
            area.placeholder = "Supporting goal";
          }
        } else if (pos === 4) {
          cell.classList.add("auto");
          cell.dataset.key = block.id;
          mark.textContent = HARADA_MARK[4];
          area.readOnly = true;
          area.tabIndex = -1;
          area.placeholder = "Copied from center 3×3";
        } else {
          mark.textContent = HARADA_MARK[pos];
          area.placeholder = "Action";
          cell.classList.add("swappable");
          cell.draggable = true;
          cell.title = "Drag to swap with another outer cell";
        }

        cell.dataset.cellId = `${block.id}-${pos}`;
        cell.append(mark, area);
        section.append(cell);
        cells[`${block.id}-${pos}`] = area;
      }

      macro.append(section);
    });
  }

  function syncOuterCenters() {
    Object.entries(SUB_POS).forEach(([key, pos]) => {
      cells[`${key}-4`].value = cells[`c-${pos}`].value;
    });
  }

  function collectChart() {
    const chart = emptyChart();
    chart.title = titleInput.value.trim();
    chart.updatedAt = new Date().toISOString();
    for (let pos = 0; pos < 9; pos += 1) {
      chart.center[pos] = cells[`c-${pos}`].value;
    }
    Object.keys(SUB_POS).forEach((key) => {
      const values = [];
      for (let pos = 0; pos < 9; pos += 1) {
        if (pos === 4) continue;
        values.push(cells[`${key}-${pos}`].value);
      }
      chart.actions[key] = values;
    });
    return chart;
  }

  function applyChart(chart) {
    const data = { ...emptyChart(), ...chart };
    titleInput.value = data.title || "";
    for (let pos = 0; pos < 9; pos += 1) {
      cells[`c-${pos}`].value = (data.center && data.center[pos]) || "";
    }
    Object.keys(SUB_POS).forEach((key) => {
      const values = (data.actions && data.actions[key]) || [];
      for (let pos = 0; pos < 9; pos += 1) {
        if (pos === 4) continue;
        cells[`${key}-${pos}`].value = values[actionIndex(pos)] || "";
      }
    });
    syncOuterCenters();
  }

  function getLocalConfig() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CONFIG) || "{}");
    } catch (err) {
      log.warn("local config parse failed", err);
      return {};
    }
  }

  function getConfig() {
    const env = envConfig();
    const local = getLocalConfig();
    const masterKey = env.masterKey || local.masterKey || "";
    const binId = env.binId || local.binId || "";
    return {
      masterKey,
      binId,
      source: {
        masterKey: env.masterKey ? "env" : local.masterKey ? "localStorage" : "none",
        binId: env.binId ? "env" : local.binId ? "localStorage" : "none"
      }
    };
  }

  function setConfig(next) {
    const env = envConfig();
    const config = { ...getLocalConfig(), ...next };
    if (env.masterKey) config.masterKey = env.masterKey;
    if (env.binId) config.binId = env.binId;
    localStorage.setItem(LOCAL_CONFIG, JSON.stringify(config));
    masterKeyInput.value = config.masterKey || "";
    binIdInput.value = config.binId || "";
    log.info("config updated", {
      masterKey: maskSecret(config.masterKey),
      binId: config.binId || "(empty)",
      source: getConfig().source
    });
    return getConfig();
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function cacheLocal(chart) {
    localStorage.setItem(LOCAL_CHART, JSON.stringify(chart));
    log.info("cached locally", { title: chart.title || "(untitled)", updatedAt: chart.updatedAt });
  }

  function saveLocal() {
    cacheLocal(collectChart());
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_CHART);
      if (raw) {
        applyChart(JSON.parse(raw));
        log.info("loaded local chart");
        return;
      }
      log.info("no local chart found");
    } catch (err) {
      log.error("local chart load failed", err);
      applyChart(emptyChart());
    }
  }

  function headers(masterKey, extra) {
    return {
      "Content-Type": "application/json",
      "X-Master-Key": masterKey,
      ...extra
    };
  }

  async function readError(res) {
    try {
      const body = await res.json();
      return body.message || body.error || res.statusText;
    } catch {
      return res.statusText || `HTTP ${res.status}`;
    }
  }

  async function saveRemote() {
    if (!ready) {
      log.info("save skipped: still hydrating from JSONBin");
      return;
    }
    if (!dirty) {
      log.info("save skipped: no edits in this tab");
      return;
    }

    const { masterKey, binId, source } = getConfig();
    if (!masterKey) {
      saveLocal();
      log.warn("save skipped: JSONBin key missing");
      setStatus("JSONBin key required", "err");
      if (!settings.open) settings.showModal();
      return;
    }

    if (saving) {
      pendingSave = true;
      log.info("save queued because one is already in flight");
      return;
    }

    saving = true;
    pendingSave = false;
    const chart = collectChart();
    localStorage.setItem(LOCAL_CHART, JSON.stringify(chart));
    setStatus("Saving to JSONBin…", "busy");

    const name = (chart.title || "Harada 9x9").slice(0, 120);
    const url = binId ? `${JSONBIN}/b/${binId}` : `${JSONBIN}/b`;
    const method = binId ? "PUT" : "POST";
    log.info("saving to JSONBin", {
      method,
      url,
      binId: binId || "(new)",
      source,
      masterKey: maskSecret(masterKey),
      title: name
    });

    try {
      if (binId) {
        const res = await fetch(url, {
          method: "PUT",
          headers: headers(masterKey, { "X-Bin-Name": name }),
          body: JSON.stringify(chart),
          keepalive: true
        });
        log.info("JSONBin PUT response", { status: res.status, ok: res.ok });
        if (!res.ok) throw new Error(await readError(res));
      } else {
        const res = await fetch(url, {
          method: "POST",
          headers: headers(masterKey, {
            "X-Bin-Name": name,
            "X-Bin-Private": "true"
          }),
          body: JSON.stringify(chart),
          keepalive: true
        });
        log.info("JSONBin POST response", { status: res.status, ok: res.ok });
        if (!res.ok) throw new Error(await readError(res));
        const payload = await res.json();
        const id = payload.metadata && payload.metadata.id;
        if (!id) throw new Error("JSONBin did not return a bin id");
        log.info("created JSONBin bin", { binId: id });
        setConfig({ binId: id });
      }
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!pendingSave) dirty = false;
      setStatus(`Saved to JSONBin ${time}`, "ok");
      log.info("JSONBin save succeeded", { at: time });
    } catch (err) {
      log.error("JSONBin save failed", err);
      setStatus(err.message || "JSONBin save failed", "err");
    } finally {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        log.info("running queued save");
        await saveRemote();
      }
    }
  }

  async function loadRemote() {
    const { masterKey, binId, source } = getConfig();
    if (!masterKey || !binId) {
      loadLocal();
      log.warn("remote load skipped", {
        reason: !masterKey ? "no master key" : "no bin id",
        source
      });
      setStatus(!masterKey ? "No JSONBin key" : "No Bin ID yet", "err");
      return false;
    }

    setStatus("Loading…", "busy");
    const url = `${JSONBIN}/b/${binId}/latest`;
    log.info("loading from JSONBin", { url, binId, source, masterKey: maskSecret(masterKey) });
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: headers(masterKey)
      });
      log.info("JSONBin GET response", { status: res.status, ok: res.ok });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const record = payload.record || payload;
      applyChart(record);
      cacheLocal(record);
      dirty = false;
      setStatus("Loaded from JSONBin", "ok");
      log.info("JSONBin load succeeded", { title: record.title || "", updatedAt: record.updatedAt });
      return true;
    } catch (err) {
      log.error("JSONBin load failed; showing local cache", err);
      loadLocal();
      setStatus("Offline · showing local copy", "err");
      return false;
    }
  }

  function persistConfigFromForm() {
    setConfig({
      masterKey: masterKeyInput.value.trim(),
      binId: binIdInput.value.trim()
    });
  }

  function markDirty() {
    if (!ready) return false;
    dirty = true;
    return true;
  }

  function scheduleSave() {
    if (!markDirty()) {
      log.info("ignored edit while hydrating");
      return;
    }
    saveLocal();
    setStatus("Saving to JSONBin…", "busy");
    window.clearTimeout(saveTimer);
    log.info("save scheduled");
    saveTimer = window.setTimeout(() => {
      saveRemote();
    }, 500);
  }

  function saveNow() {
    if (!markDirty()) return Promise.resolve();
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    log.info("save now");
    return saveRemote();
  }

  function swappableCell(node) {
    const cell = node && node.closest ? node.closest(".cell") : null;
    return cell && cell.classList.contains("swappable") ? cell : null;
  }

  function swapCells(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const from = cells[fromId];
    const to = cells[toId];
    if (!from || !to) return;
    const previous = from.value;
    from.value = to.value;
    to.value = previous;
    log.info("swapped outer cells", { fromId, toId });
    scheduleSave();
  }

  function bindSwap() {
    let dragId = "";

    macro.addEventListener("dragstart", (event) => {
      if (event.target instanceof HTMLTextAreaElement) {
        event.preventDefault();
        return;
      }
      const cell = swappableCell(event.target);
      if (!cell) {
        event.preventDefault();
        return;
      }
      dragId = cell.dataset.cellId || "";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragId);
      cell.classList.add("dragging");
    });

    macro.addEventListener("dragend", () => {
      dragId = "";
      macro.querySelectorAll(".dragging, .drop-target").forEach((el) => {
        el.classList.remove("dragging", "drop-target");
      });
    });

    macro.addEventListener("dragover", (event) => {
      const cell = swappableCell(event.target);
      if (!cell || cell.dataset.cellId === dragId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });

    macro.addEventListener("dragenter", (event) => {
      const cell = swappableCell(event.target);
      if (!cell) return;
      event.preventDefault();
      macro.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
      if (cell.dataset.cellId !== dragId) cell.classList.add("drop-target");
    });

    macro.addEventListener("drop", (event) => {
      event.preventDefault();
      const target = swappableCell(event.target);
      const fromId = event.dataTransfer.getData("text/plain") || dragId;
      const toId = target && target.dataset.cellId;
      macro.querySelectorAll(".dragging, .drop-target").forEach((el) => {
        el.classList.remove("dragging", "drop-target");
      });
      if (!target || !fromId || fromId === toId) return;
      swapCells(fromId, toId);
    });

    macro.addEventListener("click", (event) => {
      const cell = swappableCell(event.target);
      if (!cell || event.target instanceof HTMLTextAreaElement) return;
      const area = cell.querySelector("textarea");
      if (area) area.focus();
    });
  }

  function bind() {
    macro.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLTextAreaElement)) return;
      if (event.target.closest('[data-block="c"]')) syncOuterCenters();
      scheduleSave();
    });

    titleInput.addEventListener("input", scheduleSave);
    macro.addEventListener("change", saveNow);
    titleInput.addEventListener("change", saveNow);

    document.getElementById("btn-save").addEventListener("click", saveNow);
    document.getElementById("btn-load").addEventListener("click", loadRemote);
    document.getElementById("btn-settings").addEventListener("click", () => settings.showModal());

    masterKeyInput.addEventListener("change", persistConfigFromForm);
    binIdInput.addEventListener("change", persistConfigFromForm);

    settings.addEventListener("close", () => {
      persistConfigFromForm();
    });

    document.getElementById("btn-copy-bin").addEventListener("click", async () => {
      const id = binIdInput.value.trim();
      if (!id) {
        setStatus("No Bin ID to copy", "err");
        return;
      }
      await navigator.clipboard.writeText(id);
      setStatus("Bin ID copied", "ok");
    });

    document.getElementById("btn-new").addEventListener("click", () => {
      const wipe = window.confirm("Clear every cell on this chart?");
      if (!wipe) return;
      applyChart(emptyChart());
      saveNow();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (!ready || dirty) {
        log.info("skip refresh from JSONBin", { ready, dirty });
        return;
      }
      log.info("tab visible · fetching JSONBin");
      loadRemote();
    });

    const fullscreenBtn = document.getElementById("btn-fullscreen");
    const exitFullscreenBtn = document.getElementById("btn-exit-fullscreen");

    function isFullscreenQuery() {
      return new URLSearchParams(window.location.search).get("fullscreen") === "1";
    }

    function setFullscreenQuery(on) {
      const url = new URL(window.location.href);
      if (on) url.searchParams.set("fullscreen", "1");
      else url.searchParams.delete("fullscreen");
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
        window.history.replaceState(null, "", next);
      }
    }

    function setFullscreen(on) {
      document.body.classList.toggle("is-fullscreen", on);
      fullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
      setFullscreenQuery(on);
      log.info("fullscreen", { on });
    }

    fullscreenBtn.addEventListener("click", () => {
      setFullscreen(!document.body.classList.contains("is-fullscreen"));
    });
    exitFullscreenBtn.addEventListener("click", () => setFullscreen(false));
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (settings.open) return;
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;

      const fullscreen = document.body.classList.contains("is-fullscreen");
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setFullscreen(!fullscreen);
        return;
      }
      if (event.key === "Escape" && fullscreen) {
        event.preventDefault();
        setFullscreen(false);
      }
    });
    window.addEventListener("popstate", () => setFullscreen(isFullscreenQuery()));
    setFullscreen(isFullscreenQuery());
    bindSwap();
  }

  log.info("boot");
  buildGrid();
  log.info("grid built");
  const config = getConfig();
  masterKeyInput.value = config.masterKey || "";
  binIdInput.value = config.binId || "";
  const sourceNote = document.getElementById("config-source");
  if (sourceNote) {
    sourceNote.textContent = ` Key: ${config.source.masterKey}. Bin: ${config.source.binId}.`;
  }
  log.info("config resolved", {
    masterKey: maskSecret(config.masterKey),
    binId: config.binId || "(empty)",
    source: config.source,
    envPresent: Boolean(window.HARADA_CONFIG)
  });
  if (!config.masterKey) {
    log.error(
      "JSONBin key required because config.js has an empty masterKey. Render env vars are copied into config.js only during a rebuild. Set JSONBIN_MASTER_KEY, set Build Command to `node scripts/build-config.js`, then Save, rebuild, and deploy. Confirm by opening /config.js — masterKey must not be empty."
    );
  }
  bind();
  (async () => {
    const { masterKey, binId } = getConfig();
    if (masterKey && binId) {
      await loadRemote();
    } else {
      loadLocal();
      if (masterKey) setStatus("Ready · auto-saves to JSONBin", "ok");
      else setStatus("JSONBin key required", "err");
    }
    ready = true;
    log.info("ready", { dirty });
  })();
})();
