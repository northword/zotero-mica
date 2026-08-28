import { registerPrefs, registerPrefsScripts, updatePrefsUI } from "./modules/preference";
import { registerStyleSheet } from "./modules/style";
import { initLocale } from "./utils/locale";
import { getPref } from "./utils/prefs";

async function onStartup() {
  // Windows-only plugin.
  if (!Zotero.isWin) {
    return;
  }

  // Register the agent sheet BEFORE the main window is constructed. On
  // Windows the widget's TransparencyMode is computed exactly once, when the
  // root frame is built (PresShell::SyncWindowProperties →
  // GetFrameTransparency); a runtime style change cannot switch an
  // already-opaque window to transparent. Zotero opens the main window only
  // after all plugins' `startup` hooks have finished, so registering the
  // sheet here (synchronously) guarantees the translucent root background is
  // in place in time.
  registerStyleSheet();

  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
  initLocale();
  registerPrefs();
  await addon.mica.enable();
}

async function onMainWindowLoad(win: Window) {
  // Fires for EVERY load of zoteroPane.xhtml, including the reload that
  // activates transparency (see MicaManager.maybeReloadMainWindow). Re-apply
  // the material so the attribute + DWM backdrop land on the fresh document.
  if (Zotero.isWin && getPref("enabled")) {
    addon.mica.applyMaterial(win);
  }
}

async function onMainWindowUnload(_win: Window) {
  // noop
}

async function onShutdown() {
  addon.data.alive = false;
  await addon.mica.shutdown();
  delete Zotero[addon.data.config.addonInstance];
}

function onPrefsEvent(type: string, data: { window: Window }) {
  if (type === "load") {
    addon.data.prefs = { window: data.window };
    registerPrefsScripts(data.window);
    updatePrefsUI(data.window);
  }
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onPrefsEvent,
};
