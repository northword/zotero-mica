/**
 * Bootstrap template from the Zotero 7 plugin docs[1] and the official
 * Make It Red example[2].
 * [1] https://www.zotero.org/support/dev/zotero_7_for_developers
 * [2] https://github.com/zotero/make-it-red
 */

/* eslint-disable unused-imports/no-unused-vars, no-unused-vars */

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;
  /**
   * Global variables for plugin code.
   * The `_globalThis` is the global root variable of the plugin sandbox
   * environment and all child variables assigned to it is globally accessible.
   * See `src/index.ts` for details.
   */
  const ctx = {
    rootURI,
    Zotero,
    Services,
    Components,
    ChromeUtils,
    Cc: Components.classes,
    Ci: Components.interfaces,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(`${rootURI}/content/scripts/__addonRef__.js`, ctx);
  await Zotero.__addonInstance__.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  Zotero.__addonInstance__?.hooks.onShutdown();
}

function uninstall(data, reason) {}
