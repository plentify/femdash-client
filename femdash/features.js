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
  @keyframes fdfade{from{opacity:0}to{opacity:1}}
  #fd-panel{position:fixed;left:0;top:14px;box-sizing:border-box;transform-origin:top left;z-index:9999;width:300px;display:none;flex-direction:column;overflow:hidden;background:#3b1e5a;border:3px solid #1c0f33;border-radius:14px;box-shadow:4px 5px 0 #1c0f33;color:#fff;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;animation:fdfade .14s ease-out}
  #fd-head{display:flex;align-items:center;gap:5px;padding:7px 8px 7px 12px;background:#ff8fc8;color:#3b1e5a;border-bottom:3px solid #1c0f33;cursor:move;touch-action:none}
  #fd-head .ttl{flex:1;font:800 17px system-ui,sans-serif;letter-spacing:.2px}
  #fd-head button{width:24px;height:24px;padding:0;border-radius:7px;border:2px solid #1c0f33;background:#3b1e5a;color:#fff;font:800 13px/18px system-ui,sans-serif;cursor:pointer}
  #fd-head button:hover{background:#5b3d80}
  #fd-panel.min{border-radius:12px}
  #fd-panel.min > :not(#fd-head){display:none}
  #fd-panel.min #fd-head{border-bottom:0}
  #fd-tabs{display:flex;gap:4px;padding:8px 8px 0}
  #fd-tabs .tab{flex:1;padding:6px 0;border-radius:9px;border:2px solid #1c0f33;background:#4a2a70;color:#d9b8ff;font:800 11px system-ui,sans-serif;cursor:pointer}
  #fd-tabs .tab:hover{background:#5b3d80}
  #fd-tabs .tab.on{background:#ff8fc8;color:#3b1e5a}
  #fd-body{flex:1;min-height:0;overflow-y:auto;padding:10px 10px 4px}
  #fd-body::-webkit-scrollbar{width:8px}#fd-body::-webkit-scrollbar-thumb{background:#7d5aa6;border-radius:4px}
  #fd-panel .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;padding:8px 10px;border-radius:10px;border:2px solid #1c0f33;background:#4a2a70;cursor:pointer}
  #fd-panel .row:hover{background:#573483}
  #fd-panel .row .chev{color:#ff8fc8;font-weight:800;font-size:16px;line-height:1}
  #fd-panel .sw{position:relative;width:40px;height:22px;flex:none;border-radius:11px;border:2px solid #1c0f33;background:#6b4a93;transition:background .12s}
  #fd-panel .sw:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #1c0f33;box-sizing:content-box;margin:-2px 0 0 -2px;width:14px;height:14px;transition:left .12s}
  #fd-panel .on .sw{background:#ff8fc8}
  #fd-panel .on .sw:after{left:20px}
  #fd-panel .row:active .sw:after{width:18px}
  #fd-panel .card{margin-bottom:6px;padding:8px 10px;border-radius:10px;border:2px solid #1c0f33;background:#4a2a70}
  #fd-panel .card .crow{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
  #fd-panel .card b{color:#ff8fc8}
  #fd-panel .hint{color:#b79cff;font-size:11px;margin:2px 2px 8px}
  #fd-panel .empty{color:#b79cff;font-size:12px;text-align:center;padding:14px 8px}
  #fd-panel .sec{display:inline-block;margin:6px 0 6px;padding:2px 10px;border-radius:999px;border:2px solid #1c0f33;background:#ff8fc8;color:#3b1e5a;font:800 11px system-ui,sans-serif}
  #fd-panel input[type=range]{width:100%;accent-color:#ff8fc8;margin:2px 0 6px}
  #fd-panel .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #fd-panel .sc{padding:10px 8px;border-radius:10px;border:2px solid #1c0f33;background:#4a2a70;text-align:center}
  #fd-panel .sc b{display:block;font:800 22px system-ui,sans-serif;color:#ff8fc8}
  #fd-panel .sc span{color:#d9b8ff;font-size:11px}
  #fd-foot{display:flex;justify-content:space-between;padding:7px 12px;border-top:3px solid #1c0f33;background:#331a4f;color:#b79cff;font-size:11px}
  #fd-toast{position:fixed;left:50%;top:14%;transform:translate(-50%,-10px);z-index:9997;padding:9px 20px;border-radius:999px;background:#ff8fc8;border:3px solid #1c0f33;box-shadow:3px 4px 0 #1c0f33;color:#3b1e5a;font:800 19px system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;white-space:nowrap}
  #fd-toast.show{opacity:1;transform:translate(-50%,0)}`;
  document.head.appendChild(css);

  // links
  FD.repo = "https://github.com/plentify/femdash-client";
  const nativeOpen = window.open;
  window.open = function (u) {
    if (typeof u === "string" && /^https?:\/\/github\.com\/web-dashers\/web-dashers\.github\.io\/?$/i.test(u)) arguments[0] = FD.repo;
    return nativeOpen.apply(this, arguments);
  };

  // toast mmmh, yum
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
  head.innerHTML = '<span class="ttl">FemDash \u2661</span><button data-a="dn" title="Smaller">\u2212</button><button data-a="up" title="Bigger">+</button><button data-a="min" title="Collapse">\u25be</button>';
  const tabsEl = el("div"); tabsEl.id = "fd-tabs";
  const body = el("div"); body.id = "fd-body";
  const foot = el("div"); foot.id = "fd-foot";
  foot.innerHTML = "<span>FemDash v" + (FD.version || "") + "</span><span>F2 to close</span>";
  panel.append(head, tabsEl, body, foot);

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
  function addToggle(page, o, local) {
    const row = el("div", "row"); row.appendChild(el("span", null, o.label)); row.appendChild(el("div", "sw"));
    row.onclick = () => { safeRun(() => o.set(!o.get())); if (!local) saveGame(); refresh(); };
    page.appendChild(row); rows.push([row, { get: () => !!safeRun(o.get) }]);
  }
  const GROUPS = {
    play: [flag("Noclip", "noClip"), flag("Show hitboxes", "showHitboxes"), flag("Hitbox trail", "showHitboxTrail"), flag("Hitboxes on death", "hitboxesOnDeath")],
    hud: [
      { label: "Percentage", get: () => !!window.showPercentage, set: v => { window.showPercentage = v; if (scene && scene._percentageLabel) scene._percentageLabel.setVisible(v); } },
      { label: "FPS counter", get: () => !!(scene && scene._fpsText && scene._fpsText.visible), set: v => { if (scene && scene._fpsText) scene._fpsText.setVisible(v); } },
      flag("CPS counter", "showCPS"),
      { label: "Cute messages", get: () => opts.messages, set: v => { opts.messages = v; saveOpts(); }, local: true },
    ],
    look: [
      flag("Glow", "showGlow"), flag("Solid wave trail", "solidWave"), flag("Low detail mode", "enableLDM"),
      { label: "Pastel theme (reloads)", get: () => localStorage.getItem("femdash_theme") !== "off", set: v => { localStorage.setItem("femdash_theme", v ? "on" : "off"); location.reload(); }, local: true },
    ],
  };
  Object.keys(GROUPS).forEach(k => GROUPS[k].forEach(it => addToggle(pages[k], it, it.local)));

  // speed
  const spCard = el("div", "card");
  spCard.innerHTML = '<div class="crow"><span>Speed</span><b id="fd-spd">1.00x</b></div><input type="range" min="0.25" max="2" step="0.05" value="1"><div class="hint" style="margin:0">1.00x is normal speed</div>';
  pages.play.appendChild(spCard);
  const rng = spCard.querySelector("input"), spd = spCard.querySelector("#fd-spd");
  rng.oninput = () => { window.speedHack = parseFloat(rng.value); spd.textContent = parseFloat(rng.value).toFixed(2) + "x"; };
  rng.onchange = () => { rng.blur(); saveGame(); };

  // mods tab: manager button + sections that mods add through FD.menu
  const mmRow = el("div", "row"); mmRow.append(el("span", null, "Open mod manager"), el("span", "chev", "\u203a"));
  mmRow.onclick = () => { if (FD.openModManager) FD.openModManager(); else FD.toast("Mod loader not found"); };
  const modsInfo = el("div", "hint");
  const modsBox = el("div");
  const modsEmpty = el("div", "empty", "Mods you install can add their own toggles, buttons and sliders here.");
  pages.mods.append(mmRow, modsInfo, modsBox, modsEmpty);
  FD.menu = {
    section(title) {
      modsEmpty.style.display = "none";
      modsBox.appendChild(el("div", "sec", title));
      return {
        toggle(o) { addToggleTo(modsBox, o); },
        button(o) { const row = el("div", "row"); row.append(el("span", null, o.label), el("span", "chev", "\u203a")); row.onclick = () => safeRun(o.onClick); modsBox.appendChild(row); },
        slider(o) {
          const card = el("div", "card"), top = el("div", "crow"), val = el("b");
          top.append(el("span", null, o.label), val);
          const inp = document.createElement("input"); inp.type = "range"; inp.min = o.min != null ? o.min : 0; inp.max = o.max != null ? o.max : 1; inp.step = o.step || 0.05;
          inp.oninput = () => { val.textContent = inp.value; safeRun(() => o.set(parseFloat(inp.value))); }; inp.onchange = () => inp.blur();
          card.append(top, inp); modsBox.appendChild(card);
          dyn.push(() => { const v = safeRun(o.get); if (v != null) { inp.value = v; val.textContent = inp.value; } });
        },
      };
    },
  };
  function addToggleTo(page, o) { addToggle(page, o, true); }

  // stats tab
  const grid = el("div", "grid");
  grid.innerHTML = '<div class="sc"><b id="fd-d">0</b><span>Deaths</span></div><div class="sc"><b id="fd-b">0%</b><span>Best run</span></div><div class="sc"><b id="fd-c">0</b><span>Completions</span></div><div class="sc"><b id="fd-t">0m</b><span>Time played</span></div>';
  pages.stats.appendChild(grid);

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
    modsInfo.textContent = list.length ? run + " of " + list.length + " mod" + (list.length === 1 ? "" : "s") + " running" : "No mods installed yet";
  }
  //  layout: move / resize / collapse (saved between sessions)
  const PANEL_W = 300, SCALES = [0.7, 0.85, 1, 1.15];
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
