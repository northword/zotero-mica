import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

/**
 * Register the add-on's preference pane in the Zotero 7+ preference
 * framework. The pane controls use the `preference="..."` binding which
 * Zotero wires up automatically; live application is handled by the
 * global `Services.prefs` observer in MicaManager.
 */

export function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `${rootURI}content/preferences.xhtml`,
    label: getString("prefs-title"),
    stylesheets: [`${rootURI}content/preferences.css`],
    helpURL: addon.data.config.homepage,
  });
}

export function unregisterPrefs() {
  Zotero.PreferencePanes.unregister(addon.data.config.addonID);
}

export function registerPrefsScripts(window: Window) {
  addon.data.prefs = { window };
}

/** Refresh the dynamic bits of the preferences UI. */
export function updatePrefsUI(window: Window) {
  try {
    const doc = window.document;

    // Tint opacity value label
    const tintInput = doc.getElementById(
      "mica-tint-opacity",
    ) as HTMLInputElement | null;
    const tintValue = doc.getElementById("mica-tint-opacity-value");
    const refreshTint = () => {
      if (tintValue) {
        tintValue.textContent = `${getPref("tint-opacity")}%`;
      }
    };
    tintInput?.addEventListener("input", refreshTint);
    refreshTint();

    // Support status
    const status = doc.getElementById("mica-status");
    if (status) {
      const id = !getPref("enabled")
        ? "status-disabled"
        : addon.mica.isFullSupport()
          ? "status-full"
          : "status-fallback";
      status.textContent = getString(id as any);
    }
  }
  catch (e) {
    Zotero.debug(`zotero-mica: updatePrefsUI failed - ${e}`);
  }
}
