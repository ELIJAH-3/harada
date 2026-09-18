(() => {
  const JSONBIN = "https://api.jsonbin.io/v3";
  const LOCAL_CHART = "harada.chart";
  const LOCAL_CONFIG = "harada.config";

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
        }

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

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CONFIG) || "{}");
    } catch {
      return {};
    }
  }

  function setConfig(next) {
    const config = { ...getConfig(), ...next };
    localStorage.setItem(LOCAL_CONFIG, JSON.stringify(config));
    masterKeyInput.value = config.masterKey || "";
    binIdInput.value = config.binId || "";
    return config;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function saveLocal() {
    localStorage.setItem(LOCAL_CHART, JSON.stringify(collectChart()));
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_CHART);
      if (raw) applyChart(JSON.parse(raw));
    } catch {
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
    const { masterKey, binId } = getConfig();
    if (!masterKey) {
      saveLocal();
      setStatus("JSONBin key required", "err");
      if (!settings.open) settings.showModal();
      return;
    }

    if (saving) {
      pendingSave = true;
      return;
    }

    saving = true;
    pendingSave = false;
    const chart = collectChart();
    localStorage.setItem(LOCAL_CHART, JSON.stringify(chart));
    setStatus("Saving to JSONBin…", "busy");

    const name = (chart.title || "Harada 9x9").slice(0, 120);
    try {
      if (binId) {
        const res = await fetch(`${JSONBIN}/b/${binId}`, {
          method: "PUT",
          headers: headers(masterKey, { "X-Bin-Name": name }),
          body: JSON.stringify(chart),
          keepalive: true
        });
        if (!res.ok) throw new Error(await readError(res));
      } else {
        const res = await fetch(`${JSONBIN}/b`, {
          method: "POST",
          headers: headers(masterKey, {
            "X-Bin-Name": name,
            "X-Bin-Private": "true"
          }),
          body: JSON.stringify(chart),
          keepalive: true
        });
        if (!res.ok) throw new Error(await readError(res));
        const payload = await res.json();
        const id = payload.metadata && payload.metadata.id;
        if (!id) throw new Error("JSONBin did not return a bin id");
        setConfig({ binId: id });
      }
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setStatus(`Saved to JSONBin ${time}`, "ok");
    } catch (err) {
      setStatus(err.message || "JSONBin save failed", "err");
    } finally {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        await saveRemote();
      }
    }
  }

  async function loadRemote() {
    const { masterKey, binId } = getConfig();
    if (!masterKey || !binId) {
      loadLocal();
      setStatus(!masterKey ? "No JSONBin key" : "No Bin ID yet", "err");
      return;
    }

    setStatus("Loading…", "busy");
    try {
      const res = await fetch(`${JSONBIN}/b/${binId}/latest`, {
        method: "GET",
        headers: headers(masterKey)
      });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      applyChart(payload.record || payload);
      saveLocal();
      setStatus("Loaded from JSONBin", "ok");
    } catch (err) {
      loadLocal();
      setStatus(err.message || "Load failed", "err");
    }
  }

  function persistConfigFromForm() {
    setConfig({
      masterKey: masterKeyInput.value.trim(),
      binId: binIdInput.value.trim()
    });
  }

  function scheduleSave() {
    saveLocal();
    setStatus("Saving to JSONBin…", "busy");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveRemote();
    }, 500);
  }

  function saveNow() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    return saveRemote();
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
      if (getConfig().masterKey) saveNow();
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
      if (document.visibilityState === "hidden") saveNow();
    });
    window.addEventListener("pagehide", saveNow);

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
  }

  buildGrid();
  const config = getConfig();
  masterKeyInput.value = config.masterKey || "";
  binIdInput.value = config.binId || "";
  bind();
  loadLocal();
  if (config.masterKey && config.binId) loadRemote();
  else if (config.masterKey) setStatus("Ready · auto-saves to JSONBin", "ok");
  else setStatus("JSONBin key required", "err");
})();
