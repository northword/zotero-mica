import { config } from "../package.json";
import Addon from "./addon";

// The plugin sandbox exposes `Zotero` as a global (injected by
// addon/bootstrap.js via the `ctx` object passed to loadSubScript). We
// only attach the addon instance once per process.
if (!Zotero[config.addonInstance]) {
  _globalThis.addon = new Addon();
  Zotero[config.addonInstance] = addon;
}
