(function () {
  const PAL = {
    pink: 0xff8fc8, lavender: 0xb79cff, blue: 0x8edbff, plum: 0x3b1e5a,
    menuBg: 0xd9b8ff, menuGround: 0xff9acb,
  };
  const enabled = () => localStorage.getItem("femdash_theme") !== "off";
  window.FemDash = {
    PAL,
    version: "0.1.0",
    setTheme(on) { localStorage.setItem("femdash_theme", on ? "on" : "off"); location.reload(); },
  };
  if (!enabled()) return;

  document.title = "FemDash Client";
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.content = "#FF8FC8";
  document.documentElement.style.background = "#2a1240";

  // Default icon colors (only if the player hasn't picked their own)
  if (localStorage.getItem("iconMainColor") === null) window.mainColor = PAL.pink;
  if (localStorage.getItem("iconSecondaryColor") === null) window.secondaryColor = PAL.blue;

  // Preload the FemDash logo as an <img>; applied to the menu once the scene exists
  const logoImg = new Image();
  logoImg.src = "femdash/logo.png";

  if (typeof GameScene === "undefined") {
    console.warn("[FemDash] Game scripts not found. Put the femdash/ folder inside the full Web Dashers repo (next to assets/) and serve that folder as the root.");
    return;
  }
  // Loading screen: FemDash logo, pastel background, themed messages.
  // These live inside BootScene.preload (local variables), so re-compile it with replacements.
  if (typeof BootScene !== "undefined") {
    try {
      const FD_MESSAGES = ["uwu (idk what to add lol)", "MIKU MIKU BEEEAAMMM"];
      let src = BootScene.prototype.preload.toString();
      const before = src;
      src = src
        .replace(/const LOADING_MESSAGES = \[[\s\S]*?\];(?=\s*const sliderOriginX)/, () => "const LOADING_MESSAGES = " + JSON.stringify(FD_MESSAGES) + ";")
        .replace(/(this\.load\.image\("Phaserlogo"[^\n]*\);)/, (m) => m + '\n    this.load.image("femdash_logo_big", "femdash/logo.png");')
        .replace(/this\.add\.image\(cx, cy, "GJ_WebSheet", "gj_logo\.png"\)\.setOrigin\(0\.5\)/, 'this.add.image(cx, cy, "femdash_logo_big").setOrigin(0.5).setScale(0.702)')
        .replace(/\.setTint\(0x0066ff\)/, ".setTint(0x" + PAL.menuBg.toString(16) + ")");
      if (src !== before && /femdash_logo_big/.test(src) && /LOADING_MESSAGES = \[\"/.test(src)) {
        BootScene.prototype.preload = (0, eval)("(" + src.replace(/^preload\s*/, "function ") + ")");
      } else {
        console.warn("[FemDash] Loading screen layout changed upstream; left as is.");
      }
    } catch (e) { console.warn("[FemDash] could not theme loading screen", e); }
  }

  const proto = GameScene.prototype;
  const origCreate = proto.create;
  proto.create = function () {
    const r = origCreate.apply(this, arguments);
    const applyLogo = () => {
      if (!this._logo || !this._logo.scene) return;
      if (!this.textures.exists("femdash_logo")) this.textures.addImage("femdash_logo", logoImg);
      const targetW = 740;
      this._logo.setTexture("femdash_logo");
      this._logo.setScale(targetW / logoImg.naturalWidth);
    };
    if (logoImg.complete) applyLogo(); else logoImg.onload = applyLogo;
    return r;
  };

  // Menu-only recolor; levels keep their own colors so gameplay stays readable
  const origUpdate = proto.update;
  proto.update = function () {
    const r = origUpdate.apply(this, arguments);
    if (this._menuActive && this._bg) {
      this._bg.setTint(PAL.menuBg);
      this._level && this._level.setGroundColor && this._level.setGroundColor(PAL.menuGround);
    }
    return r;
  };
})();
