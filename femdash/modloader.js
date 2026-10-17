// mod loader
(function () {
  "use strict";
  const FD = window.FemDash;
  if (!FD || !FD.menu) return;

  const KEY = "femdash_mods";
  const ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;
  const safeMode = /[?&]nomods(\b|=)/.test(location.search);
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  let mods = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(mods));
  const status = {}; // id -> { state, error }
  let dirty = false; // changes that need a reload

  // header parsing / install 
  function parseHeader(code) {
    const m = code.match(/\/\/\s*==FemDashMod==([\s\S]*?)\/\/\s*==\/FemDashMod==/);
    if (!m) return null;
    const o = {};
    m[1].split("\n").forEach(l => { const x = l.match(/^\s*\/\/\s*@(\w+)\s+(.+?)\s*$/); if (x) o[x[1]] = x[2]; });
    return o;
  }
  function install(code, source, extra) {
    const meta = parseHeader(code);
    if (!meta || !ID_RE.test(meta.id || "")) throw new Error("The mod needs a header with a valid @id (lowercase letters, numbers, - or _). See MODDING.md.");
    if (code.length > 300000) throw new Error("Mod is too large (300 KB max).");
    const entry = Object.assign({ id: meta.id, name: meta.name || meta.id, version: meta.version || "?", author: meta.author || "unknown", description: meta.description || "", icon: (meta.icon || "").slice(0, 4), enabled: true, source, code }, extra || {});
    const i = mods.findIndex(x => x.id === entry.id);
    if (i >= 0) mods[i] = entry; else mods.push(entry);
    save(); dirty = true;
    return entry;
  }
  const CONFIRM = "Mods can run any code on this page, including reading your saved game data.\nOnly install mods from people you trust.\n\n";

  // the API every mod receives
  function makeApi(m) {
    const okRun = (what, f) => { try { const r = f(); if (r && typeof r.catch === "function") r.catch(e => fail(what, e)); return r; } catch (e) { fail(what, e); } };
    const fail = (what, e) => { console.error("[FemDash] mod '" + m.id + "' error in " + what, e); status[m.id] = Object.assign(status[m.id] || {}, { error: what + ": " + (e && e.message || e) }); };
    let sec = null;
    const section = () => sec || (sec = FD.menu.section(m.name));
    const skey = k => "femdash_mod_" + m.id + ":" + k;
    return {
      id: m.id, name: m.name, version: m.version,
      scene: () => FD.scene || null,
      classes: { get GameScene() { return window.GameScene || (typeof GameScene !== "undefined" ? GameScene : undefined); }, get PlayerObject() { return typeof PlayerObject !== "undefined" ? PlayerObject : undefined; } },
      on(ev, fn) {
        const h = d => okRun("on('" + ev + "')", () => fn(d));
        if (ev === "ready" && FD.ready) { setTimeout(() => h(FD.scene), 0); return; }
        FD.on(ev, h);
      },
      onFrame(fn) { this.on("ready", s => s.events.on("postupdate", () => okRun("onFrame", () => fn(s)))); },
      menu: {
        toggle: o => okRun("menu.toggle", () => section().toggle(o)),
        button: o => okRun("menu.button", () => section().button(o)),
        slider: o => okRun("menu.slider", () => section().slider(o)),
      },
      toast: (t, ms) => FD.toast(String(t), ms),
      storage: {
        get: (k, d) => { try { const v = localStorage.getItem(skey(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set: (k, v) => { try { localStorage.setItem(skey(k), JSON.stringify(v)); } catch (e) { } },
        remove: k => localStorage.removeItem(skey(k)),
      },
      // Wrap a method: fn(original, ...args). If your wrapper throws, the original still runs.
      wrap(obj, method, fn) {
        const orig = obj[method];
        if (typeof orig !== "function") throw new Error("api.wrap: " + method + " is not a function");
        obj[method] = function () {
          const args = arguments, bound = (...a) => orig.apply(this, a.length ? a : args);
          try { return fn.call(this, bound, ...args); } catch (e) { fail("wrap(" + method + ")", e); return orig.apply(this, args); }
        };
      },
      log: (...a) => console.log("[mod:" + m.id + "]", ...a),
    };
  }

  let current = null;
  FD.mod = function (fn) {
    if (!current) throw new Error("FemDash.mod() can only be called while a mod is loading.");
    if (typeof fn !== "function") throw new Error("FemDash.mod() needs a function: FemDash.mod(function (api) { ... })");
    current.fn = fn;
  };
  function runMod(m) {
    status[m.id] = { state: "loading" };
    try {
      const holder = { fn: null }; current = holder;
      new Function("FemDash", String(m.code) + "\n//# sourceURL=femdash-mod-" + m.id + ".js")(FD);
      current = null;
      if (!holder.fn) throw new Error("The mod never called FemDash.mod(function (api) { ... }).");
      const r = holder.fn(makeApi(m));
      if (r && typeof r.catch === "function") r.catch(e => { status[m.id] = { state: "error", error: String(e && e.message || e) }; });
      status[m.id] = Object.assign({ state: "loaded" }, status[m.id].error ? { error: status[m.id].error } : {});
    } catch (e) {
      current = null;
      status[m.id] = { state: "error", error: String(e && e.message || e) };
      console.error("[FemDash] mod '" + m.id + "' failed to load", e);
    }
  }
  mods.forEach(m => {
    if (safeMode) status[m.id] = { state: "safe" };
    else if (m.enabled === false) status[m.id] = { state: "off" };
    else runMod(m);
  });
  FD.mods = { list: () => mods.map(m => ({ id: m.id, name: m.name, version: m.version, enabled: m.enabled !== false, state: (status[m.id] || {}).state })) };

  // mod manager UI
  const css = document.createElement("style");
  css.textContent = `
  #fd-mm-ov{position:fixed;inset:0;z-index:10000;background:rgba(10,4,20,.62);display:none;align-items:center;justify-content:center}
  #fd-mm{display:flex;flex-direction:column;width:540px;max-width:94vw;max-height:88vh;box-sizing:border-box;overflow:hidden;background:#3b1e5a;border:3px solid #1c0f33;border-radius:16px;box-shadow:5px 6px 0 #1c0f33;color:#fff;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif}
  #fd-mm .mh{display:flex;align-items:center;padding:9px 10px 9px 16px;background:#ff8fc8;color:#3b1e5a;border-bottom:3px solid #1c0f33}
  #fd-mm .mh .ttl{flex:1;font:800 20px system-ui,sans-serif}
  #fd-mm .mx{width:28px;height:28px;padding:0;border-radius:8px;border:2px solid #1c0f33;background:#3b1e5a;color:#fff;font:800 13px system-ui,sans-serif;cursor:pointer}
  #fd-mm .mx:hover{background:#5b3d80}
  #fd-mm .mt{display:flex;gap:6px;padding:10px 12px 0}
  #fd-mm .tab{padding:7px 14px;border-radius:10px;border:2px solid #1c0f33;background:#4a2a70;color:#d9b8ff;font:800 12px system-ui,sans-serif;cursor:pointer}
  #fd-mm .tab:hover{background:#5b3d80}
  #fd-mm .tab.on{background:#ff8fc8;color:#3b1e5a}
  #fd-mm .mb{flex:1;min-height:0;overflow-y:auto;padding:12px}
  #fd-mm .mb::-webkit-scrollbar{width:8px}#fd-mm .mb::-webkit-scrollbar-thumb{background:#7d5aa6;border-radius:4px}
  #fd-mm .mr{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:3px solid #1c0f33;background:#331a4f}
  #fd-mm .mr span{flex:1;color:#ffe2b8}
  #fd-mm .btn{padding:7px 13px;border-radius:9px;border:2px solid #1c0f33;background:#5b3d80;color:#fff;font:800 12px system-ui,sans-serif;cursor:pointer}
  #fd-mm .btn:hover,.fd-dl .btn:hover{filter:brightness(1.15)}
  #fd-mm .btn:disabled{opacity:.5;cursor:default}
  #fd-mm .btn.pri,.fd-dl .btn.pri{background:#ff8fc8;color:#3b1e5a}
  #fd-mm .btn.dng,.fd-dl .btn.dng{background:#ff7a8a;color:#3b1e5a}
  #fd-mm .srch,#fd-mm textarea,#fd-mm input[type=text]{width:100%;box-sizing:border-box;border-radius:10px;border:2px solid #1c0f33;background:#2a1240;color:#fff;padding:9px 11px;font:600 13px system-ui,sans-serif;outline:none}
  #fd-mm .srch:focus,#fd-mm textarea:focus,#fd-mm input[type=text]:focus{border-color:#ff8fc8}
  #fd-mm .srch{margin-bottom:10px}
  #fd-mm textarea{height:130px;resize:vertical;font:12px ui-monospace,Consolas,monospace;margin:8px 0}
  #fd-mm .mc,#fd-mm .mk{position:relative;display:flex;gap:12px;padding:12px;margin-bottom:10px;border-radius:12px;border:2px solid #1c0f33;background:#4a2a70}
  #fd-mm .ico{flex:none;width:46px;height:46px;border-radius:11px;border:2px solid #1c0f33;background:#ff8fc8;color:#3b1e5a;font:800 21px system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
  #fd-mm .info{flex:1;min-width:0}
  #fd-mm .nm{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:800 15px system-ui,sans-serif}
  #fd-mm .ver{color:#b79cff;font:700 12px system-ui,sans-serif}
  #fd-mm .meta{color:#d9b8ff;font-size:12px;margin-top:2px}
  #fd-mm .desc{color:#efe3ff;font-size:12px;margin-top:5px}
  #fd-mm .chips{margin-top:7px}
  #fd-mm .chip,#fd-mm .vb{display:inline-block;padding:2px 9px;border-radius:999px;border:2px solid #1c0f33;font:800 10px system-ui,sans-serif}
  #fd-mm .chip.ok{background:#8edbff;color:#1c0f33}
  #fd-mm .chip.off{background:#6b4a93;color:#e9dcff}
  #fd-mm .chip.err{background:#ff7a8a;color:#1c0f33}
  #fd-mm .chip.warn{background:#ffc878;color:#1c0f33}
  #fd-mm .vb{background:#8edbff;color:#1c0f33}
  #fd-mm .errs{margin-top:8px;padding:7px 9px;border-radius:8px;border:2px solid #1c0f33;background:#5b1f33;color:#ffb3bd;font:11px ui-monospace,Consolas,monospace;word-break:break-word}
  #fd-mm .side{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:8px}
  #fd-mm .sw{position:relative;width:42px;height:24px;flex:none;border-radius:12px;border:2px solid #1c0f33;background:#6b4a93;cursor:pointer;transition:background .12s}
  #fd-mm .sw:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #1c0f33;transition:left .12s}
  #fd-mm .sw.on{background:#ff8fc8}#fd-mm .sw.on:after{left:20px}
  #fd-mm .more{width:30px;height:24px;padding:0;border-radius:8px;border:2px solid #1c0f33;background:#5b3d80;color:#fff;font:800 14px/14px system-ui,sans-serif;cursor:pointer}
  #fd-mm .more:hover{background:#7d5aa6}
  #fd-mm .acts{margin-top:9px}
  #fd-mm .warn{padding:9px 11px;margin-bottom:10px;border-radius:10px;border:2px solid #1c0f33;background:#6a4a1f;color:#ffe2b8;font-size:12px}
  #fd-mm .note{color:#b79cff;font-size:12px;margin:0 2px 10px}
  #fd-mm .empty{text-align:center;padding:28px 12px;border-radius:12px;border:3px dashed #7d5aa6;color:#d9b8ff}
  #fd-mm .empty b{display:block;font:800 17px system-ui,sans-serif;color:#fff;margin-bottom:4px}
  #fd-mm .ribbon{position:absolute;top:-2px;right:14px;padding:3px 10px;border:2px solid #1c0f33;border-top:0;border-radius:0 0 9px 9px;background:#8edbff;color:#1c0f33;font:800 10px system-ui,sans-serif}
  #fd-mm .mk .go{align-self:center}
  #fd-mm .dz{padding:30px 12px;margin-bottom:10px;text-align:center;border-radius:14px;border:3px dashed #b79cff;background:#432463;cursor:pointer}
  #fd-mm .dz:hover,#fd-mm .dz.hot{background:#573483;border-color:#ff8fc8}
  #fd-mm .dzi{font-size:26px;line-height:1;color:#ff8fc8}
  #fd-mm .dzt{font:800 15px system-ui,sans-serif;margin-top:6px}
  #fd-mm .dzs{color:#b79cff;font-size:12px;margin-top:2px}
  #fd-mm details{margin-top:12px}
  #fd-mm summary{cursor:pointer;color:#d9b8ff;font-weight:800}
  #fd-mm .row2{display:flex;gap:8px;margin-top:8px}
  .fd-dl-ov{position:fixed;inset:0;z-index:10001;background:rgba(10,4,20,.55);display:flex;align-items:center;justify-content:center}
  .fd-dl{width:380px;max-width:92vw;box-sizing:border-box;padding:16px;border-radius:14px;border:3px solid #1c0f33;background:#3b1e5a;box-shadow:4px 5px 0 #1c0f33;color:#fff;font:600 13px system-ui,sans-serif}
  .fd-dl .dt{font:800 17px system-ui,sans-serif;color:#ff8fc8;margin-bottom:8px}
  .fd-dl .db{white-space:pre-line;color:#efe3ff;line-height:1.45}
  .fd-dl .da{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
  .fd-dl .btn{padding:7px 14px;border-radius:9px;border:2px solid #1c0f33;background:#5b3d80;color:#fff;font:800 12px system-ui,sans-serif;cursor:pointer}`;
  document.head.appendChild(css);

  const h = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) Object.assign(e, props); kids.flat().forEach(k => { if (k != null && k !== false) e.append(k); }); return e; };
  const stop = el => ["keydown", "keyup", "mousedown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));

  // styled replacements for alert/confirm
  function dialog(o) {
    return new Promise(res => {
      const ovl = h("div", { className: "fd-dl-ov" }), d = h("div", { className: "fd-dl" }), bar = h("div", { className: "da" });
      const done = v => { ovl.remove(); res(v); };
      if (o.cancel) bar.append(h("button", { className: "btn", textContent: o.cancel, onclick: () => done(false) }));
      bar.append(h("button", { className: "btn " + (o.danger ? "dng" : "pri"), textContent: o.ok || "OK", onclick: () => done(true) }));
      d.append(h("div", { className: "dt", textContent: o.title }), h("div", { className: "db", textContent: o.body }), bar);
      ovl.append(d); stop(ovl); document.body.appendChild(ovl);
    });
  }
  const tell = (title, body) => dialog({ title, body });

  const ov = h("div", { id: "fd-mm-ov" }), box = h("div", { id: "fd-mm" });
  ov.appendChild(box);
  box.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  stop(box);
  ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
  let tab = "installed", market = null, marketErr = "", query = "", draft = null, openCard = null, bodyEl = null, listEl = null;
  const mount = () => document.body.appendChild(ov);
  if (document.body) mount(); else window.addEventListener("DOMContentLoaded", mount);
  function close() { ov.style.display = "none"; }

  function render() {
    box.textContent = "";
    const tabs = h("div", { className: "mt" });
    [["installed", "Installed (" + mods.length + ")"], ["market", "Marketplace"], ["add", "Add mod"]].forEach(([k, l]) => tabs.append(h("button", { className: "tab" + (tab === k ? " on" : ""), textContent: l, onclick: () => { tab = k; render(); } })));
    bodyEl = h("div", { className: "mb" });
    box.append(h("div", { className: "mh" }, h("span", { className: "ttl", textContent: "Mods \u2661" }), h("button", { className: "mx", textContent: "\u2715", title: "Close", onclick: close })), tabs, bodyEl);
    if (safeMode) bodyEl.append(h("div", { className: "warn", textContent: "Safe mode: mods are switched off for this session. Remove ?nomods from the address to run them." }));
    if (tab === "installed") renderInstalled(); else if (tab === "market") renderMarket(); else renderAdd();
    if (dirty) box.append(h("div", { className: "mr" }, h("span", { textContent: "Changes apply after a reload." }), h("button", { className: "btn pri", textContent: "Reload now", onclick: () => location.reload() })));
  }

  function chipFor(m) {
    const s = (status[m.id] || {}).state;
    if (s === "loaded") return ["Running", "ok"];
    if (s === "error") return ["Error", "err"];
    if (s === "safe") return ["Safe mode", "warn"];
    if (s === "off" || m.enabled === false) return ["Disabled", "off"];
    return dirty ? ["Reload to run", "warn"] : ["Not loaded", "off"];
  }
  function card(m) {
    const st = status[m.id] || {}, chip = chipFor(m);
    const sw = h("div", { className: "sw" + (m.enabled !== false ? " on" : ""), title: "Enable / disable", onclick: () => { m.enabled = m.enabled === false; save(); dirty = true; render(); } });
    const more = h("button", { className: "more", textContent: "\u22ef", title: "More", onclick: () => { openCard = openCard === m.id ? null : m.id; renderList(); } });
    const rm = h("button", {
      className: "btn dng", textContent: "Remove mod", onclick: async () => {
        if (await dialog({ title: "Remove " + m.name + "?", body: "It will be deleted from this browser. You can add it again later.", ok: "Remove", cancel: "Keep", danger: true })) { mods = mods.filter(x => x !== m); save(); dirty = true; openCard = null; render(); }
      }
    });
    return h("div", { className: "mc" },
      h("div", { className: "ico", textContent: m.icon || (m.name || "?").trim().charAt(0).toUpperCase() }),
      h("div", { className: "info" },
        h("div", { className: "nm" }, h("span", { textContent: m.name }), h("span", { className: "ver", textContent: "v" + m.version }), m.source === "market" ? h("span", { className: "vb", textContent: "\u2713 Verified" }) : null),
        h("div", { className: "meta", textContent: "by " + m.author + (m.source === "url" ? " \u2022 from a link" : m.source === "local" ? " \u2022 added by you" : "") }),
        m.description ? h("div", { className: "desc", textContent: m.description }) : null,
        h("div", { className: "chips" }, h("span", { className: "chip " + chip[1], textContent: chip[0] })),
        st.error ? h("div", { className: "errs", textContent: st.error }) : null,
        openCard === m.id ? h("div", { className: "acts" }, rm) : null),
      h("div", { className: "side" }, sw, more));
  }
  function renderList() {
    listEl.textContent = "";
    const q = query.trim().toLowerCase(), shown = mods.filter(m => !q || (m.name + " " + m.author + " " + m.id).toLowerCase().includes(q));
    if (!mods.length) listEl.append(h("div", { className: "empty" }, h("b", { textContent: "No mods yet \u2661" }), "Install one from the Marketplace, or add your own in the Add mod tab."));
    else if (!shown.length) listEl.append(h("div", { className: "note", textContent: "No mods match your search." }));
    else shown.forEach(m => listEl.append(card(m)));
  }
  function renderInstalled() {
    if (mods.length > 4) bodyEl.append(h("input", { className: "srch", type: "text", placeholder: "Search mods...", value: query, oninput: e => { query = e.target.value; renderList(); } }));
    listEl = h("div"); bodyEl.append(listEl); renderList();
  }

  async function sha256(buf) { const d = await crypto.subtle.digest("SHA-256", buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
  async function loadMarket() {
    try {
      const r = await fetch("femdash/marketplace.json?t=" + Date.now()); if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json(); market = Array.isArray(j.mods) ? j.mods : []; marketErr = "";
    } catch (e) { market = []; marketErr = "Couldn't reach the marketplace (" + (e.message || e) + ")."; }
    if (tab === "market" && ov.style.display !== "none") render();
  }
  async function installFromMarket(item, btn) {
    try {
      if (!(window.crypto && crypto.subtle)) throw new Error("Verifying a mod needs https or localhost.");
      btn.disabled = true; btn.textContent = "Installing...";
      const r = await fetch("femdash/" + item.file + "?t=" + Date.now()); if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = await r.arrayBuffer();
      if ((await sha256(buf)) !== String(item.sha256 || "").toLowerCase()) throw new Error("The file doesn't match what FemDash verified, so it wasn't installed.");
      install(new TextDecoder().decode(buf), "market", { verifiedHash: item.sha256 });
      tab = "installed"; render();
    } catch (e) { await tell("Install failed", String(e.message || e)); btn.disabled = false; btn.textContent = "Install"; }
  }
  function renderMarket() {
    bodyEl.append(h("div", { className: "note", textContent: "Verified mods are reviewed by the FemDash team and checked against a fingerprint before they install." }));
    if (market === null) { bodyEl.append(h("div", { className: "note", textContent: "Loading..." })); loadMarket(); return; }
    if (marketErr) bodyEl.append(h("div", { className: "errs", textContent: marketErr }));
    if (!market.length && !marketErr) bodyEl.append(h("div", { className: "empty" }, h("b", { textContent: "Coming soon \u2661" }), "The first verified mod is on its way."));
    market.forEach(it => {
      const have = mods.find(x => x.id === it.id), btn = h("button", { className: "btn pri go", textContent: have ? (have.version !== it.version ? "Update" : "Reinstall") : "Install" });
      btn.onclick = () => installFromMarket(it, btn);
      bodyEl.append(h("div", { className: "mk" }, h("span", { className: "ribbon", textContent: "\u2713 Verified" }),
        h("div", { className: "ico", textContent: it.icon || (it.name || "?").trim().charAt(0).toUpperCase() }),
        h("div", { className: "info" }, h("div", { className: "nm" }, h("span", { textContent: it.name }), h("span", { className: "ver", textContent: "v" + it.version })), h("div", { className: "meta", textContent: "by " + it.author }), it.description ? h("div", { className: "desc", textContent: it.description }) : null),
        btn));
    });
  }

  function setDraft(code, source) { draft = { code, source }; render(); }
  async function commitDraft() {
    const meta = parseHeader(draft.code);
    if (!meta || !ID_RE.test(meta.id || "")) return;
    if (!await dialog({ title: "Install \"" + (meta.name || meta.id) + "\"?", body: CONFIRM + "by " + (meta.author || "unknown"), ok: "Install", cancel: "Cancel" })) return;
    try { install(draft.code, draft.source); draft = null; tab = "installed"; render(); } catch (e) { await tell("Couldn't install", String(e.message || e)); }
  }
  function renderAdd() {
    bodyEl.append(h("div", { className: "warn", textContent: "Mods run with full access to this page. Only add mods from people you trust. Mods from the Marketplace are the only ones FemDash verifies." }));
    const file = h("input", { type: "file", accept: ".js,text/javascript", style: "display:none" });
    file.onchange = async () => { if (file.files[0]) setDraft(await file.files[0].text(), "local"); };
    const dz = h("div", { className: "dz" }, h("div", { className: "dzi", textContent: "\u2b06" }), h("div", { className: "dzt", textContent: "Drop a .js mod here" }), h("div", { className: "dzs", textContent: "or click to choose a file" }));
    dz.onclick = () => file.click();
    ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("hot"); }));
    ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("hot"); }));
    dz.addEventListener("drop", async e => { const f = e.dataTransfer.files[0]; if (f) setDraft(await f.text(), "local"); });
    bodyEl.append(dz, file);
    if (draft) {
      const meta = parseHeader(draft.code), ok = meta && ID_RE.test(meta.id || "");
      bodyEl.append(h("div", { className: "mc" },
        h("div", { className: "ico", textContent: ok ? ((meta.icon || meta.name || meta.id).trim().slice(0, 2).toUpperCase()) : "!" }),
        h("div", { className: "info" },
          ok ? [h("div", { className: "nm" }, h("span", { textContent: meta.name || meta.id }), h("span", { className: "ver", textContent: "v" + (meta.version || "?") })), h("div", { className: "meta", textContent: "by " + (meta.author || "unknown") + " \u2022 id: " + meta.id }), meta.description ? h("div", { className: "desc", textContent: meta.description }) : null]
            : [h("div", { className: "nm", textContent: "This doesn't look like a FemDash mod" }), h("div", { className: "errs", textContent: "Missing or invalid header. It must start with // ==FemDashMod== and include a valid // @id line. See MODDING.md." })],
          h("div", { className: "acts row2" }, h("button", { className: "btn pri", textContent: "Install", disabled: !ok, onclick: commitDraft }), h("button", { className: "btn", textContent: "Clear", onclick: () => { draft = null; render(); } })))));
    }
    const ta = h("textarea", { placeholder: "Paste a mod here...", spellcheck: false });
    const url = h("input", { type: "text", placeholder: "https://... link to a .js mod" });
    bodyEl.append(h("details", null, h("summary", { textContent: "Paste code or use a link" }), ta,
      h("div", { className: "row2" }, h("button", { className: "btn", textContent: "Use pasted code", onclick: () => { if (ta.value.trim()) setDraft(ta.value, "local"); } })),
      h("div", { className: "note", style: "margin-top:12px", textContent: "From a link:" }), url,
      h("div", { className: "row2" }, h("button", {
        className: "btn", textContent: "Fetch from link", onclick: async () => {
          try { const r = await fetch(url.value.trim()); if (!r.ok) throw new Error("HTTP " + r.status); setDraft(await r.text(), "url"); }
          catch (e) { tell("Couldn't fetch the mod", String(e.message || e) + "\n\nThe site may block other pages from loading it. Download the file and drop it here instead."); }
        }
      }))));
  }
  FD.openModManager = function () { render(); ov.style.display = "flex"; };
})();
