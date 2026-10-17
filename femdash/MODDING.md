# Making FemDash mods

A FemDash mod is one `.js` file. Install it from the client menu: **F2 → Mod manager → Add mod**
(paste it, pick the file, or give a link). Mods are saved in your browser and run every time the game loads.

## 1. The file

Start with this header, then call `FemDash.mod` once:

```js
// ==FemDashMod==
// @id my-first-mod          (required: lowercase letters, numbers, - and _)
// @name My First Mod
// @version 1.0.0
// @author you
// @description What it does, in one line.
// @icon ✨                (optional: an emoji or 1-2 letters shown on your mod's card)
// ==/FemDashMod==

FemDash.mod(function (api) {
  // your code
});
```

Your function runs once, before the game starts. Use `api.on("ready", ...)` for anything that needs the game scene.
See `examples/hello.js` for a complete example.

## 2. The `api` object

| | |
|---|---|
| `api.menu.toggle({label, get, set})` | On/off switch in the F2 menu. `get()` returns a boolean, `set(v)` receives the new one. |
| `api.menu.button({label, onClick})` | A button row. |
| `api.menu.slider({label, min, max, step, get, set})` | A slider. |
| `api.on(event, fn)` | `"ready"` (game scene exists, gets the scene), `"death"` (`{percent, deaths}`), `"complete"` (`{completions}`). |
| `api.onFrame(fn)` | Runs every frame once the game is ready (`fn(scene)`). Keep it fast. |
| `api.scene()` | The Phaser game scene, or `null` before `"ready"`. |
| `api.classes` | `GameScene` and `PlayerObject`, the game's own classes. |
| `api.wrap(obj, "method", (orig, ...args) => {...})` | Wrap a method. Call `orig()` to run the original. If your wrapper throws, the original still runs. |
| `api.storage.get/set/remove` | Saved data private to your mod (JSON values). |
| `api.toast(text, ms)` | Pink pop-up message at the top of the screen. |
| `api.log(...)` | `console.log` with your mod id. |

Menu entries appear in a section named after your mod. Errors inside your handlers are caught and shown in the Mod manager instead of crashing the game.

## 3. Staying safe

- Mods run with **full access to the page**: they can read and change anything, including saved game data. Only install mods you trust, and read the code of anything you didn't write.
- A broken mod stopping the game from loading? Open the game with `?nomods` on the end of the URL (for example `http://127.0.0.1:5500/?nomods`) to start with every mod switched off, then remove the broken one.
- Mod settings changes (enable, disable, remove, install) take effect after a reload.

## 4. The Marketplace (verified mods)

The Marketplace tab lists mods reviewed by the FemDash team. A verified mod ships inside this repo at `femdash/mods/<file>.js` and is listed in `femdash/marketplace.json` with a SHA-256 fingerprint of that exact file. The client downloads the file, recomputes the fingerprint, and refuses to install if it doesn't match.

To add a verified mod (maintainers):

1. Review the mod's code, then add it as `femdash/mods/<name>.js`.
2. Compute its fingerprint: `sha256sum femdash/mods/<name>.js`
3. Add an entry to `femdash/marketplace.json`:

```json
{ "id": "my-first-mod", "name": "My First Mod", "author": "you", "version": "1.0.0",
  "description": "One line.", "file": "mods/<name>.js", "sha256": "<the hash from step 2>" }
```

Changing the file later means a new hash, so update the entry (and bump `version`) in the same commit.
