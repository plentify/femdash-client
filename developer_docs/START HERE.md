# Mod API Docs

All .js mod files need to start with

```js
// ==FemDashMod==
// @id my-first-mod          (required: lowercase letters, numbers, - and _)
// @name My First Mod
// @version 1.0.0
// @author you
// @description What it does, in one line.
// ==/FemDashMod==

FemDash.mod(function (api) {
  // your code
});
```

This is mostly to show its a mod and for author. Its not that hard to understand. Your mod's code is ran before the game loads. If anything needs with game scenes, use the function `api.on("ready", ...)`, as always use femdash/examples/hello.js as a proper example. You can dm me if you need help, but always check if im Available in my bio.

## Api Objects

| | |
|---|---|
| `api.menu.toggle({label, get, set})` | On/off switch in the F2 menu. `get()` returns a boolean, `set(v)` receives the new one. |
| `api.menu.button({label, onClick})` | A button row. |
| `api.menu.slider({label, min, max, step, get, set})` | A slider. |
| `api.on(event, fn)` | `"ready"` (game scene exists, gets the scene), `"death"` (`{percent, deaths}`), `"complete"` (`{completions}`). |
| `api.onFrame(fn)` | Runs every frame once the game is ready (`fn(scene)`).|
| `api.scene()` | The Phaser game scene, or `null` before `"ready"`. |
| `api.classes` | `GameScene` and `PlayerObject`, the game's own classes. |
| `api.wrap(obj, "method", (orig, ...args) => {...})` | Wrap a method. Call `orig()` to run the original. If your wrapper throws, the original still runs. |
| `api.storage.get/set/remove` | Saved data private to your mod (JSON values). |
| `api.toast(text, ms)` | Pink pop-up message at the top of the screen. |
| `api.log(...)` | `console.log` with your mod id. |

## Warning, Stay Safe

Take this as a BIG WARNING, always check what your mods do, even if you dont understand it, ask someone else before adding it. Mods run with **full access to the page**. Use ?nomods to make every mod you have turn off, this is mostly a security measure (https://plentify.github.io/femdash-client/?nomods).

# The Marketplace

All mods from here are verified by me and any future dev of FemDash. You can see the file in femdash/mods and is listed in femdash/marketplace.json with a SHA-256 fingerprint of that exact file. FemDash Client downloads the JS and if it doesnt have the same fingerprint it blows it up (metaphor for refusal to install it).

To add a verified mod (maintainers):

1. Review the mod's code, then add it as `femdash/mods/<name>.js`.
2. Compute its fingerprint: `sha256sum femdash/mods/<name>.js`
3. Add an entry to `femdash/marketplace.json`:

```json
{ "id": "my-first-mod", "name": "My First Mod", "author": "you", "version": "1.0.0",
  "description": "One line.", "file": "mods/<name>.js", "sha256": "<the hash from step 2>" }
```

Changing the file later means a new hash, so update the entry (and bump `version`) in the same commit.

