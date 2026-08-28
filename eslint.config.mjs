// @ts-check

import antfu from "@antfu/eslint-config";

export default antfu(
  {
    stylistic: {
      semi: true,
      quotes: "double",
    },
    formatters: true,
    javascript: { },
    typescript: {
      overrides: {
        "e18e/prefer-static-regex": "off",
      },
    },
    ignores: [
      "addon/lib/**",
      ".scaffold",
      "node_modules",
      "PLAN.md",
      "README.md",
      "zotero-plugin.config.ts",
    ],
  },
  {
    // Bootstrap / preference files run in the privileged Zotero sandbox.
    files: ["addon/**/*.js"],
    languageOptions: {
      globals: {
        Services: "readonly",
        Zotero: "readonly",
        Components: "readonly",
        ChromeUtils: "readonly",
        Cc: "readonly",
        Ci: "readonly",
        pref: "readonly",
        APP_SHUTDOWN: "readonly",
        install: "readonly",
        startup: "readonly",
        shutdown: "readonly",
        uninstall: "readonly",
        onMainWindowLoad: "readonly",
        onMainWindowUnload: "readonly",
      },
    },
  },
);
