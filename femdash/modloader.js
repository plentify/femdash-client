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
    const entry = Object.assign({ id: meta.id, name: meta.name || meta.id, version: meta.version || "?", author: meta.author || "unknown", description: meta.description || "", icon: (meta.icon || "").slice(0, 4), enabled: true, source, code, added: Date.now() }, extra || {});
    const i = mods.findIndex(x => x.id === entry.id);
    if (i >= 0 && mods[i].added) entry.added = mods[i].added;
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
  #fd-mm-ov{position:fixed;inset:0;z-index:10000;background:rgba(10,10,14,.55);display:none;align-items:center;justify-content:center}
  #fd-mm{position:relative;display:flex;flex-direction:column;width:580px;max-width:94vw;height:430px;max-height:88vh;box-sizing:border-box;overflow:hidden;background:#1d1d21;border:1px solid #3b3b44;border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
  #fd-mm .wrap{display:flex;flex:1;min-height:0}
  #fd-mm .side{width:118px;flex:none;padding:6px 0;background:#202025;border-right:1px solid #33333b}
  #fd-mm .mb{flex:1;min-width:0;overflow-y:auto}
  #fd-mm .pad{padding:12px}
  #fd-mm table{border-collapse:collapse;width:100%}
  #fd-mm th{font-weight:400;text-align:left;color:#80808c;font-size:11px;padding:6px 10px;border-bottom:1px solid #33333b;position:sticky;top:0;background:#1d1d21}
  #fd-mm td{padding:7px 10px;border-bottom:1px solid #2a2a31;cursor:default}
  #fd-mm tr.row{cursor:pointer}
  #fd-mm tr.row:hover td{background:#23232a}
  #fd-mm tr.sel td{background:#2a2a32}
  #fd-mm tr.sel td:first-child{box-shadow:inset 2px 0 0 #ff8fc8}
  #fd-mm .ok{color:#7fd6a4}#fd-mm .bad{color:#ff7a8a}#fd-mm .mut{color:#80808c}#fd-mm .dim{opacity:.55}
  #fd-mm .det{margin:12px;padding:10px 12px;border:1px solid #33333b;border-radius:4px;background:#18181c;color:#b6b6c2;line-height:1.55}
  #fd-mm .det b{color:#fff}
  #fd-mm code{font:11px "Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace}
  #fd-mm .acts{display:flex;gap:6px;margin-top:8px}
  #fd-mm .btn,.fd-dl .btn{padding:4px 12px;border:1px solid #4a4a54;border-radius:3px;background:#26262c;color:#d6d6de;font:inherit;cursor:pointer}
  #fd-mm .btn:hover,.fd-dl .btn:hover{background:#30303a;color:#fff}
  #fd-mm .btn:disabled{opacity:.45;cursor:default}
  #fd-mm .btn.pri,.fd-dl .btn.pri{background:#ff8fc8;border-color:#ff8fc8;color:#1d1d21;font-weight:600}
  #fd-mm .btn.dng,.fd-dl .btn.dng{border-color:#ff7a8a;color:#ff7a8a}
  #fd-mm .btn.dng:hover{background:#3a2228}
  #fd-mm .srch,#fd-mm textarea,#fd-mm input[type=text]{width:100%;box-sizing:border-box;border:1px solid #3b3b44;border-radius:3px;background:#16161a;color:#e6e6ee;padding:6px 8px;font:inherit;outline:none}
  #fd-mm .srch:focus,#fd-mm textarea:focus,#fd-mm input[type=text]:focus{border-color:#ff8fc8}
  #fd-mm .srch{margin:10px 12px 0;width:calc(100% - 24px)}
  #fd-mm textarea{height:120px;resize:vertical;margin:8px 0;font:11px "Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace}
  #fd-mm .warn{margin:12px 12px 0;padding:8px 10px;border:1px solid #5a4a2a;border-radius:4px;background:#2a2418;color:#d9c9a0}
  #fd-mm .empty{padding:28px 14px;color:#80808c}
  #fd-mm .dz{margin:12px;padding:26px 12px;text-align:center;border:1px dashed #4a4a54;border-radius:4px;color:#9a9aa6;cursor:pointer}
  #fd-mm .dz:hover,#fd-mm .dz.hot{border-color:#ff8fc8;color:#fff;background:#202026}
  #fd-mm details{margin:12px}
  #fd-mm summary{cursor:pointer;color:#9a9aa6}
  #fd-mm .row2{display:flex;gap:6px;margin-top:6px}
  #fd-mm .note{color:#80808c;margin:12px 12px 0}
  #fd-mm .mr{display:flex;align-items:center;gap:10px;flex:none;padding:7px 12px;border-top:1px solid #3b3b44;background:#2a2418;color:#d9c9a0}
  #fd-mm .mr span{flex:1}
  .fd-dl-ov{position:fixed;inset:0;z-index:10001;background:rgba(10,10,14,.5);display:flex;align-items:center;justify-content:center}
  .fd-dl{width:380px;max-width:92vw;box-sizing:border-box;background:#1d1d21;border:1px solid #3b3b44;border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden}
  .fd-dl .dt{padding:8px 12px;background:#27272d;border-bottom:1px solid #3b3b44;color:#fff;font-weight:600}
  .fd-dl .db{padding:12px;white-space:pre-line;color:#b6b6c2;line-height:1.5}
  .fd-dl .da{display:flex;justify-content:flex-end;gap:6px;padding:0 12px 12px}`;
  document.head.appendChild(css);

  const h = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) Object.assign(e, props); kids.flat().forEach(k => { if (k != null && k !== false) e.append(k); }); return e; };
  const stop = el => ["keydown", "keyup", "mousedown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "\u2014";

  // replacements for alert/confirm, in the same style
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
  let tab = "installed", market = null, marketErr = "", query = "", draft = null, selected = null, bodyEl = null, listEl = null;
  const mount = () => document.body.appendChild(ov);
  if (document.body) mount(); else window.addEventListener("DOMContentLoaded", mount);
  function close() { ov.style.display = "none"; }

  function render() {
    box.textContent = "";
    const side = h("div", { className: "side" });
    [["installed", "Installed (" + mods.length + ")"], ["market", "Marketplace"], ["add", "Add"]].forEach(([k, l]) => side.append(h("button", { className: "tab" + (tab === k ? " on" : ""), textContent: l, onclick: () => { tab = k; render(); } })));
    bodyEl = h("div", { className: "mb" });
    box.append(h("div", { className: "fd-hd" }, h("span", { className: "ttl", textContent: "Mods" }), h("button", { textContent: "\u2715", title: "Close", onclick: close })), h("div", { className: "wrap" }, side, bodyEl));
    if (safeMode) bodyEl.append(h("div", { className: "warn", textContent: "Safe mode: mods are switched off for this session. Remove ?nomods from the address to run them." }));
    if (tab === "installed") renderInstalled(); else if (tab === "market") renderMarket(); else renderAdd();
    if (dirty) box.append(h("div", { className: "mr" }, h("span", { textContent: "Changes apply after a reload." }), h("button", { className: "btn pri", textContent: "Reload now", onclick: () => location.reload() })));
  }

  function statusOf(m) {
    const s = (status[m.id] || {}).state;
    if (s === "loaded") return ["Running", "ok"];
    if (s === "error") return ["Error", "bad"];
    if (s === "safe") return ["Not running (safe mode)", "mut"];
    if (s === "off" || m.enabled === false) return ["Disabled", "mut"];
    return dirty ? ["Reload to run", "mut"] : ["Not loaded", "mut"];
  }
  function details(m) {
    const st = status[m.id] || {}, s = statusOf(m);
    const enable = h("button", { className: "btn", textContent: m.enabled === false ? "Enable" : "Disable", onclick: () => { m.enabled = m.enabled === false; save(); dirty = true; render(); } });
    const rm = h("button", {
      className: "btn dng", textContent: "Remove", onclick: async () => {
        if (await dialog({ title: "Remove " + m.name + "?", body: "It will be deleted from this browser. You can add it again later.", ok: "Remove", cancel: "Keep", danger: true })) { mods = mods.filter(x => x !== m); save(); dirty = true; selected = null; render(); }
      }
    });
    return h("div", { className: "det" },
      h("div", null, h("b", { textContent: m.name }), " " + m.version + " by " + m.author, m.source === "market" ? h("span", { className: "ok", textContent: "  (verified)" }) : null),
      h("div", null, "Status: ", h("span", { className: s[1], textContent: s[0] })),
      m.description ? h("div", { className: "mut", textContent: m.description }) : null,
      st.error ? h("div", { className: "bad" }, h("code", { textContent: st.error })) : null,
      h("div", { className: "acts" }, enable, rm));
  }
  function renderList() {
    listEl.textContent = "";
    const q = query.trim().toLowerCase(), shown = mods.filter(m => !q || (m.name + " " + m.author + " " + m.id).toLowerCase().includes(q));
    if (!mods.length) { listEl.append(h("div", { className: "empty", textContent: "No mods installed. Use Marketplace or Add." })); return; }
    if (!shown.length) { listEl.append(h("div", { className: "empty", textContent: "No mods match your search." })); return; }
    if (!mods.some(m => m.id === selected)) selected = shown[0].id;
    const tb = h("tbody");
    shown.forEach(m => {
      const dim = m.enabled === false ? " dim" : "";
      tb.append(h("tr", { className: "row" + (m.id === selected ? " sel" : ""), onclick: () => { selected = m.id; renderList(); } },
        h("td", { className: dim }, m.name, m.source === "market" ? h("span", { className: "ok", textContent: " (verified)" }) : null),
        h("td", { className: "mut" + dim, textContent: m.version }), h("td", { className: "mut" + dim, textContent: m.author }), h("td", { className: "mut" + dim, textContent: fmtDate(m.added) })));
    });
    listEl.append(h("table", null, h("thead", null, h("tr", null, h("th", { textContent: "Name" }), h("th", { textContent: "Version" }), h("th", { textContent: "Author" }), h("th", { textContent: "Date added" }))), tb));
    const sel = mods.find(m => m.id === selected); if (sel) listEl.append(details(sel));
  }
  function renderInstalled() {
    if (mods.length > 4) bodyEl.append(h("input", { className: "srch", type: "text", placeholder: "Search mods", value: query, oninput: e => { query = e.target.value; renderList(); } }));
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
      btn.disabled = true; btn.textContent = "Installing";
      const r = await fetch("femdash/" + item.file + "?t=" + Date.now()); if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = await r.arrayBuffer();
      if ((await sha256(buf)) !== String(item.sha256 || "").toLowerCase()) throw new Error("The file doesn't match what FemDash verified, so it wasn't installed.");
      install(new TextDecoder().decode(buf), "market", { verifiedHash: item.sha256 });
      tab = "installed"; render();
    } catch (e) { await tell("Install failed", String(e.message || e)); btn.disabled = false; btn.textContent = "Install"; }
  }
  function renderMarket() {
    bodyEl.append(h("div", { className: "note", textContent: "Verified mods are reviewed by the FemDash team and checked against a fingerprint before they install." }));
    if (market === null) { bodyEl.append(h("div", { className: "empty", textContent: "Loading" })); loadMarket(); return; }
    if (marketErr) bodyEl.append(h("div", { className: "empty bad", textContent: marketErr }));
    else if (!market.length) { bodyEl.append(h("div", { className: "empty", textContent: "No verified mods yet. The first one is coming soon." })); return; }
    const tb = h("tbody");
    market.forEach(it => {
      const have = mods.find(x => x.id === it.id), btn = h("button", { className: "btn pri", textContent: have ? (have.version !== it.version ? "Update" : "Reinstall") : "Install" });
      btn.onclick = () => installFromMarket(it, btn);
      tb.append(h("tr", null, h("td", null, it.name, h("span", { className: "ok", textContent: " (verified)" }), it.description ? h("div", { className: "mut", textContent: it.description }) : null), h("td", { className: "mut", textContent: it.version }), h("td", { className: "mut", textContent: it.author }), h("td", null, btn)));
    });
    bodyEl.append(h("table", { style: "margin-top:8px" }, h("thead", null, h("tr", null, h("th", { textContent: "Name" }), h("th", { textContent: "Version" }), h("th", { textContent: "Author" }), h("th"))), tb));
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
    const dz = h("div", { className: "dz", textContent: "Drop a .js file here, or click to choose" });
    dz.onclick = () => file.click();
    ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("hot"); }));
    ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("hot"); }));
    dz.addEventListener("drop", async e => { const f = e.dataTransfer.files[0]; if (f) setDraft(await f.text(), "local"); });
    bodyEl.append(dz, file);
    if (draft) {
      const meta = parseHeader(draft.code), ok = meta && ID_RE.test(meta.id || "");
      bodyEl.append(h("div", { className: "det", style: "margin-top:0" },
        ok ? [h("div", null, h("b", { textContent: meta.name || meta.id }), " " + (meta.version || "?") + " by " + (meta.author || "unknown")), h("div", { className: "mut", textContent: "id: " + meta.id }), meta.description ? h("div", { className: "mut", textContent: meta.description }) : null]
          : [h("div", null, h("b", { textContent: "This doesn't look like a FemDash mod" })), h("div", { className: "bad" }, h("code", { textContent: "Missing or invalid header. It must start with // ==FemDashMod== and include a valid // @id line. See MODDING.md." }))],
        h("div", { className: "acts" }, h("button", { className: "btn pri", textContent: "Install", disabled: !ok, onclick: commitDraft }), h("button", { className: "btn", textContent: "Clear", onclick: () => { draft = null; render(); } }))));
    }
    const ta = h("textarea", { placeholder: "Paste a mod here", spellcheck: false });
    const url = h("input", { type: "text", placeholder: "https://... link to a .js mod" });
    bodyEl.append(h("details", null, h("summary", { textContent: "Paste code or use a link" }), ta,
      h("div", { className: "row2" }, h("button", { className: "btn", textContent: "Use pasted code", onclick: () => { if (ta.value.trim()) setDraft(ta.value, "local"); } })),
      h("div", { className: "mut", style: "margin-top:12px", textContent: "From a link:" }), h("div", { style: "margin-top:4px" }, url),
      h("div", { className: "row2" }, h("button", {
        className: "btn", textContent: "Fetch from link", onclick: async () => {
          try { const r = await fetch(url.value.trim()); if (!r.ok) throw new Error("HTTP " + r.status); setDraft(await r.text(), "url"); }
          catch (e) { tell("Couldn't fetch the mod", String(e.message || e) + "\n\nThe site may block other pages from loading it. Download the file and drop it here instead."); }
        }
      }))));
  }
  FD.openModManager = function () { render(); ov.style.display = "flex"; };
})();
