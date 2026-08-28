import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/releaser/{{updateJson}}`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: [{ in: "src/index.ts", out: pkg.config.addonRef }],
        define: {
          __env__: `"production"`,
        },
        bundle: true,
        format: "esm",
        target: "firefox140",
        outdir: `.scaffold/build/addon/content/scripts/`,
        external: ["Zotero"],
      },
    ],
  },

  server: {
    // Open Zotero's Debug Output window at startup so plugin debug
    // messages (zotero-mica: ...) are visible. `-ZoteroDebug` forces
    // forceDebugLog=2 (window); `-ZoteroDebugText` would dump to console.
    // startArgs: ["-ZoteroDebug"],
  },
});
