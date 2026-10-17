// ==FemDashMod==
// @id hello-femdash
// @name Hello FemDash
// @version 1.0.0
// @author you
// @description Example mod: a button, a toggle, and a death event.
// ==/FemDashMod==

FemDash.mod(function (api) {
  let cheer = api.storage.get("cheer", true);
  let hearts = api.storage.get("hearts", 0);

  // Entries show up in the client menu (F2) under a section named after your mod.
  api.menu.button({
    label: "Send a heart",
    onClick: () => { hearts++; api.storage.set("hearts", hearts); api.toast("hearts sent: " + hearts + " \u2661"); },
  });
  api.menu.toggle({
    label: "Cheer on death",
    get: () => cheer,
    set: v => { cheer = v; api.storage.set("cheer", v); },
  });

  // Events: 'ready' (game scene exists), 'death' ({percent}), 'complete'
  api.on("death", d => { if (cheer) api.toast("so close at " + d.percent + "%! \u2661"); });
});
