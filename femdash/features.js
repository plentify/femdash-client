(function () {
  if (typeof GameScene === "undefined") return;
  const FD = (window.FemDash = window.FemDash || {});
  const LS = "femdash_settings";
  const load = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } };
  const opts = Object.assign({ messages: true }, load());
  const saveOpts = () => localStorage.setItem(LS, JSON.stringify(opts));
  const stats = (FD.stats = { deaths: 0, best: 0, completions: 0, start: Date.now() });
  let scene = null;

  // tiny event bus (used by the mod loader) 
  const listeners = {};
  FD.on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
  FD.emit = (n, d) => { (listeners[n] || []).slice().forEach(f => { try { f(d); } catch (e) { console.error("[FemDash] handler error in '" + n + "'", e); } }); };

  // styles
  const css = document.createElement("style");
  css.textContent = `
  #fd-panel,#fd-mm,.fd-dl{font:12px "Segoe UI",system-ui,-apple-system,Roboto,"DejaVu Sans",sans-serif;color:#d6d6de}
  #fd-panel{position:fixed;left:0;top:14px;box-sizing:border-box;transform-origin:top left;z-index:9999;width:290px;display:none;flex-direction:column;overflow:hidden;background:#1d1d21;border:1px solid #3b3b44;border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.5);user-select:none}
  #fd-head,.fd-hd{display:flex;align-items:center;gap:4px;height:28px;flex:none;padding:0 6px 0 10px;background:#27272d;border-bottom:1px solid #3b3b44;color:#d6d6de}
  #fd-head{cursor:move;touch-action:none}
  #fd-head .ttl,.fd-hd .ttl{flex:1;font-weight:600}
  #fd-head .ver{color:#8a8a96;margin-right:4px}
  #fd-head button,.fd-hd button{min-width:20px;height:20px;padding:0 4px;border:0;border-radius:3px;background:none;color:#8a8a96;font-family:inherit;font-size:12px;line-height:20px;cursor:pointer}
  #fd-head button:hover,.fd-hd button:hover{background:#3a3a43;color:#fff}
  #fd-panel.min > :not(#fd-head){display:none}
  #fd-panel.min #fd-head{border-bottom:0}
  #fd-main{display:flex;flex:1;min-height:210px;min-width:0}
  #fd-tabs{width:78px;flex:none;padding:6px 0;background:#202025;border-right:1px solid #33333b}
  #fd-tabs .tab,#fd-mm .tab{display:block;width:100%;padding:6px 12px;border:0;border-left:2px solid transparent;background:none;color:#9a9aa6;font:inherit;text-align:left;cursor:pointer}
  #fd-tabs .tab:hover,#fd-mm .tab:hover{color:#fff}
  #fd-tabs .tab.on,#fd-mm .tab.on{color:#fff;background:#2e2e36;border-left-color:#ff8fc8}
  #fd-body{flex:1;min-width:0;overflow-y:auto;padding:6px 12px 12px}
  #fd-body::-webkit-scrollbar,#fd-mm .mb::-webkit-scrollbar{width:8px}#fd-body::-webkit-scrollbar-thumb,#fd-mm .mb::-webkit-scrollbar-thumb{background:#44444e;border-radius:4px}
  .fd-lb{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#80808c;margin:10px 0 4px}
  #fd-panel .ck{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;color:#d6d6de}
  #fd-panel .ck:hover{color:#fff}
  .cbx{position:relative;width:14px;height:14px;flex:none;border:1px solid #6a6a76;border-radius:2px;background:#16161a}
  #fd-panel .ck.on .cbx{background:#ff8fc8;border-color:#ff8fc8}
  #fd-panel .ck.on .cbx:after{content:"\\2713";position:absolute;inset:0;font-size:10px;line-height:12px;text-align:center;color:#1d1d21}
  #fd-panel .sp{cursor:default;gap:6px}
  #fd-panel .sp input{flex:1;min-width:0;accent-color:#ff8fc8;height:14px}
  #fd-panel .mut,.fd-mut{color:#80808c}
  #fd-panel .sp b{min-width:38px;text-align:right;font-weight:500}
  .fdb{display:block;margin:4px 0;padding:5px 10px;border:1px solid #4a4a54;border-radius:3px;background:#26262c;color:#d6d6de;font:inherit;cursor:pointer}
  .fdb:hover{background:#30303a;color:#fff}
  #fd-panel .hint{color:#80808c;margin:6px 0 2px}
  #fd-panel .kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #2a2a31}
  #fd-panel .kv span{color:#9a9aa6}
  #fd-toast{position:fixed;left:50%;top:14%;transform:translate(-50%,-6px);z-index:9997;padding:8px 16px;border-radius:4px;background:#27272d;border:1px solid #3b3b44;border-left:3px solid #ff8fc8;box-shadow:0 6px 20px rgba(0,0,0,.45);color:#ececf4;font:13px "Segoe UI",system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;white-space:nowrap}
  #fd-toast.show{opacity:1;transform:translate(-50%,0)}`;
  document.head.appendChild(css);

  // links
  FD.repo = "https://github.com/plentify/femdash-client";
  const nativeOpen = window.open;
  window.open = function (u) {
    if (typeof u === "string" && /^https?:\/\/github\.com\/web-dashers\/web-dashers\.github\.io\/?$/i.test(u)) arguments[0] = FD.repo;
    return nativeOpen.apply(this, arguments);
  };

  // toast 
  const toastEl = document.createElement("div");
  toastEl.id = "fd-toast";
  let toastTimer = 0, lastToast = 0;
  FD.toast = function (text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms || 1300);
    lastToast = Date.now();
  };

  // messages 
  const DEATH = ["oopsie~ try again \u2661", "you've got this, cutie \u2661", "deep breath, and again \u2661", "that spike was just rude", "gentle retry, bestie \u2661", "again again again \u2661", "still adorable, just saying"];
  const CLOSE = ["SO close!! {p}% \u2661", "{p}%... one more, you're so near \u2661", "almost!! {p}% \u2661"];
  const WIN = ["you did it!! so proud of you \u2661", "level cleared, you star \u2728", "slay, completely \u2661"];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const curPercent = () => {
    const n = parseFloat(scene && scene._percentageLabel && scene._percentageLabel.text);
    return Number.isFinite(n) ? n : 0;
  };

  // source patches (no upstream edits) 
  // Some menu text lives in local variables, so re-compile the method with one extra entry.
  function patchMethod(name, re, insert) {
    try {
      const fn = GameScene.prototype[name];
      const src = fn.toString();
      if (!re.test(src)) { console.warn("[FemDash] " + name + " changed upstream; skipped."); return; }
      const patched = src.replace(re, insert).replace(new RegExp("^" + name + "\\s*"), "function ");
      GameScene.prototype[name] = (0, eval)("(" + patched + ")");
    } catch (e) { console.warn("[FemDash] could not patch " + name, e); }
  }
  // Credits: our line at the very bottom
  patchMethod("_buildInfoPopup", /(\{ text: "\u00a9 2026 RobTop Games[^\n]*\},)(\s*\];)/,
    '$1\n      { text: \'Client by: Plentify "01"\', scale: 0.7, font: "goldFont" },\n      { text: \'Logo by: GD Colon\', scale: 0.7, font: "goldFont" },$2');
  // Update Log: F2 hint at the very top
  patchMethod("_buildUpdateLogPopup", /(const updateEntries = \[)/,
    '$1\n      { text: "F2 to open the client menu", scale: 0.75, color: 0xff8fc8 },');

  // hooks
  const proto = GameScene.prototype;
  const oc = proto.create;
  proto.create = function () {
    const r = oc.apply(this, arguments);
    scene = FD.scene = this;
    document.body.appendChild(toastEl);
    FD.ready = true; FD.emit("ready", this);
    return r;
  };
  if (typeof PlayerObject !== "undefined") {
    const ok = PlayerObject.prototype.killPlayer;
    PlayerObject.prototype.killPlayer = function () {
      const was = this.p && this.p.isDead;
      const r = ok.apply(this, arguments);
      if (!was && this.p && this.p.isDead && this._activationKey === "main" && scene && !scene._editorPlaytestActive && !scene._menuActive) {
        const p = Math.floor(curPercent());
        stats.deaths++;
        if (p > stats.best) stats.best = p;
        FD.emit("death", { percent: p, deaths: stats.deaths });
        if (opts.messages && Date.now() - lastToast > 350) {
          FD.toast(p >= 80 && p < 100 ? pick(CLOSE).replace("{p}", p) : pick(DEATH));
        }
      }
      return r;
    };
  }
  const olc = proto._levelComplete;
  if (olc) proto._levelComplete = function () {
    const r = olc.apply(this, arguments);
    stats.completions++; stats.best = 100;
    FD.emit("complete", { completions: stats.completions });
    if (opts.messages) FD.toast(pick(WIN), 2800);
    return r;
  };

  // quick menu
  const flag = (label, key) => ({ label, get: () => !!window[key], set: v => { window[key] = v; } });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const safeRun = f => { try { return f(); } catch (e) { console.error("[FemDash] menu error", e); } };
  const saveGame = () => { if (scene && scene._saveSettings) safeRun(() => scene._saveSettings()); };

  const panel = el("div"); panel.id = "fd-panel";
  const rows = [], dyn = [];
  const head = el("div"); head.id = "fd-head";
  head.title = "Drag to move \u2022 double-click to reset";
  head.innerHTML = '<span class="ttl">FemDash</span><span class="ver">F2</span><button data-a="dn" title="Smaller">\u2212</button><button data-a="up" title="Bigger">+</button><button data-a="min" title="Collapse">\u25be</button>';
  const main = el("div"); main.id = "fd-main";
  const tabsEl = el("div"); tabsEl.id = "fd-tabs";
  const body = el("div"); body.id = "fd-body";
  main.append(tabsEl, body);
  panel.append(head, main);

  const pages = {};
  [["play", "Play"], ["hud", "HUD"], ["look", "Look"], ["mods", "Mods"], ["stats", "Stats"]].forEach(([k, label]) => {
    const b = el("button", "tab", label); b.dataset.t = k;
    b.onclick = () => { opts.tab = k; saveOpts(); showTab(); };
    tabsEl.appendChild(b);
    const pg = el("div"); pg.dataset.p = k; body.appendChild(pg); pages[k] = pg;
  });
  function showTab() {
    const t = pages[opts.tab] ? opts.tab : "play";
    tabsEl.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    Object.keys(pages).forEach(k => { pages[k].style.display = k === t ? "block" : "none"; });
    body.scrollTop = 0;
  }
  const label = (page, text) => { const l = el("div", "fd-lb", text); page.appendChild(l); return l; };
  function addToggle(page, o, local) {
    const row = el("div", "ck"); row.append(el("div", "cbx"), el("span", null, o.label));
    row.onclick = () => { safeRun(() => o.set(!o.get())); if (!local) saveGame(); refresh(); };
    page.appendChild(row); rows.push([row, { get: () => !!safeRun(o.get) }]);
  }
  const GROUPS = {
    play: [["Gameplay", [flag("Noclip", "noClip"), flag("Show hitboxes", "showHitboxes"), flag("Hitbox trail", "showHitboxTrail"), flag("Hitboxes on death", "hitboxesOnDeath")]]],
    hud: [
      ["Overlays", [
        { label: "Percentage", get: () => !!window.showPercentage, set: v => { window.showPercentage = v; if (scene && scene._percentageLabel) scene._percentageLabel.setVisible(v); } },
        { label: "FPS counter", get: () => !!(scene && scene._fpsText && scene._fpsText.visible), set: v => { if (scene && scene._fpsText) scene._fpsText.setVisible(v); } },
        flag("CPS counter", "showCPS"),
      ]],
      ["Client", [{ label: "Death and win messages", get: () => opts.messages, set: v => { opts.messages = v; saveOpts(); }, local: true }]],
    ],
    look: [
      ["Rendering", [flag("Glow", "showGlow"), flag("Solid wave trail", "solidWave"), flag("Low detail mode", "enableLDM")]],
      ["Client", [{ label: "Pastel theme (reloads)", get: () => localStorage.getItem("femdash_theme") !== "off", set: v => { localStorage.setItem("femdash_theme", v ? "on" : "off"); location.reload(); }, local: true }]],
    ],
  };
  Object.keys(GROUPS).forEach(k => GROUPS[k].forEach(([title, items]) => { label(pages[k], title); items.forEach(it => addToggle(pages[k], it, it.local)); }));

  // speed
  label(pages.play, "Speed");
  const spRow = el("div", "ck sp");
  spRow.innerHTML = '<span class="mut">0.25</span><input type="range" min="0.25" max="2" step="0.05" value="1"><b id="fd-spd">1.00x</b>';
  pages.play.appendChild(spRow);
  const rng = spRow.querySelector("input"), spd = spRow.querySelector("#fd-spd");
  rng.oninput = () => { window.speedHack = parseFloat(rng.value); spd.textContent = parseFloat(rng.value).toFixed(2) + "x"; };
  rng.onchange = () => { rng.blur(); saveGame(); };

  // mods tab: manager button + sections that mods add through FD.menu
  const mmBtn = el("button", "fdb", "Open mod manager");
  mmBtn.style.marginTop = "8px";
  mmBtn.onclick = () => { if (FD.openModManager) FD.openModManager(); else FD.toast("Mod loader not found"); };
  const modsInfo = el("div", "hint");
  const modsBox = el("div");
  const modsEmpty = el("div", "hint", "Mods you install can add their own options here.");
  pages.mods.append(mmBtn, modsInfo, modsBox, modsEmpty);
  FD.menu = {
    section(title) {
      modsEmpty.style.display = "none";
      label(modsBox, title);
      return {
        toggle(o) { addToggle(modsBox, o, true); },
        button(o) { const b = el("button", "fdb", o.label); b.onclick = () => safeRun(o.onClick); modsBox.appendChild(b); },
        slider(o) {
          const row = el("div", "ck sp"), val = el("b"), inp = document.createElement("input");
          inp.type = "range"; inp.min = o.min != null ? o.min : 0; inp.max = o.max != null ? o.max : 1; inp.step = o.step || 0.05;
          inp.oninput = () => { val.textContent = inp.value; safeRun(() => o.set(parseFloat(inp.value))); }; inp.onchange = () => inp.blur();
          row.append(el("span", "mut", o.label), inp, val); modsBox.appendChild(row);
          dyn.push(() => { const v = safeRun(o.get); if (v != null) { inp.value = v; val.textContent = inp.value; } });
        },
      };
    },
  };

  // stats tab
  label(pages.stats, "This session");
  const kv = el("div");
  kv.innerHTML = '<div class="kv"><span>Deaths</span><b id="fd-d">0</b></div><div class="kv"><span>Best run</span><b id="fd-b">0%</b></div><div class="kv"><span>Completions</span><b id="fd-c">0</b></div><div class="kv"><span>Time played</span><b id="fd-t">0m</b></div>';
  pages.stats.appendChild(kv);
  const ver = el("div", "hint", "FemDash v" + (FD.version || "")); pages.stats.appendChild(ver);

  panel.addEventListener("keydown", e => e.stopPropagation());
  panel.addEventListener("mousedown", e => e.stopPropagation());

  function refresh() {
    rows.forEach(([row, it]) => row.classList.toggle("on", !!it.get()));
    dyn.forEach(f => f());
    const s = parseFloat(window.speedHack); rng.value = Number.isFinite(s) ? s : 1; spd.textContent = (Number.isFinite(s) ? s : 1).toFixed(2) + "x";
    panel.querySelector("#fd-d").textContent = stats.deaths;
    panel.querySelector("#fd-b").textContent = stats.best + "%";
    panel.querySelector("#fd-c").textContent = stats.completions;
    panel.querySelector("#fd-t").textContent = Math.floor((Date.now() - stats.start) / 60000) + "m";
    const list = (FD.mods && FD.mods.list) ? FD.mods.list() : [], run = list.filter(m => m.state === "loaded").length;
    modsInfo.textContent = list.length ? run + " of " + list.length + " mod" + (list.length === 1 ? "" : "s") + " running" : "No mods installed";
  }
  // layout: move / resize / collapse (saved between sessions)
  const PANEL_W = 290, SCALES = [0.7, 0.85, 1, 1.15];
  function applyLayout() {
    const sc = SCALES.indexOf(opts.scale) >= 0 ? opts.scale : 1;
    panel.style.transform = "scale(" + sc + ")";
    panel.style.maxHeight = "calc((100vh - 28px) / " + sc + ")";
    panel.classList.toggle("min", !!opts.min);
    const pos = opts.pos || { x: window.innerWidth - PANEL_W * sc - 14, y: 14 };
    const r = panel.getBoundingClientRect();
    const h = r.height || 40, w = PANEL_W * sc;
    pos.x = Math.min(Math.max(pos.x, 60 - w), window.innerWidth - 60);
    pos.y = Math.min(Math.max(pos.y, 0), Math.max(0, window.innerHeight - 34));
    panel.style.left = pos.x + "px";
    panel.style.top = pos.y + "px";
    if (opts.pos) opts.pos = pos;
  }
  head.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = ev => { opts.pos = { x: ev.clientX - dx, y: ev.clientY - dy }; applyLayout(); };
    const up = () => { head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); saveOpts(); };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
  });
  head.addEventListener("dblclick", e => {
    if (e.target.closest("button")) return;
    opts.pos = null; opts.scale = 1; opts.min = false; saveOpts(); applyLayout();
  });
  head.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const i = Math.max(0, SCALES.indexOf(opts.scale >= 0 && SCALES.indexOf(opts.scale) >= 0 ? opts.scale : 1));
    if (b.dataset.a === "dn") opts.scale = SCALES[Math.max(0, i - 1)];
    if (b.dataset.a === "up") opts.scale = SCALES[Math.min(SCALES.length - 1, i + 1)];
    if (b.dataset.a === "min") { opts.min = !opts.min; b.textContent = opts.min ? "\u25b8" : "\u25be"; }
    saveOpts(); applyLayout();
  });
  head.querySelector('[data-a="min"]').textContent = opts.min ? "\u25b8" : "\u25be";
  window.addEventListener("resize", () => { if (open) applyLayout(); });

  let open = false;
  FD.toggleMenu = function (force) {
    open = typeof force === "boolean" ? force : !open;
    panel.style.display = open ? "flex" : "none";
    if (open) { showTab(); applyLayout(); refresh(); }
  };
  setInterval(() => { if (open) refresh(); }, 1000);
  window.addEventListener("keydown", e => { if (e.key === "F2") { e.preventDefault(); FD.toggleMenu(); } });

  const mount = () => { document.body.appendChild(panel); };
  if (document.body) mount(); else window.addEventListener("DOMContentLoaded", mount);
})();
