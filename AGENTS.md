# Repository Guidelines

This guide helps contributors work consistently in the `zotero-mica` repository, a Windows-only Zotero 10+ addon that applies Mica or Acrylic backdrop materials to Zotero windows.

## Project Structure & Module Organization

- `src/`: TypeScript source for the addon entry point, hooks, and modules such as `mica`, `dwm`, `preference`, and `style`.
- `src/utils/`: small helpers for preferences, logging, and locale resolution.
- `addon/`: runtime addon assets, including `bootstrap.js`, `manifest.json`, `content/`, and `locale/`.
- `typings/`: global and preference type declarations.
- `test/`: test files executed by `zotero-plugin test` inside a Zotero instance.
- `.scaffold/`: generated build output managed by `zotero-plugin-scaffold`; do not edit directly.
- Root config files: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `zotero-plugin.config.ts`, and `.env.example`.

## Architecture Overview

- Transparency and material are decoupled: `addon/content/mica.css` (registered as an agent sheet) makes `:root[zotero-mica]` translucent; `src/modules/dwm.ts` sets the native backdrop via js-ctypes.
- Use direct `DwmSetWindowAttribute` calls rather than the `windowsmica` attribute or `widget.windows.mica` pref to avoid timing coupling.
- `src/modules/mica.ts` orchestrates sheet registration, window enumeration, pref observation, and cleanup. All apply/restore operations should be idempotent and fully reversible on disable or uninstall.

## Build, Test, and Development Commands

Use `pnpm`; the project pins `pnpm@11.18.0`.

```bash
pnpm install          # install dependencies
pnpm start            # start Zotero, serve the addon, and watch for changes
pnpm build            # bundle the addon and type-check with tsc --noEmit
pnpm test             # run tests in a Zotero instance via zotero-plugin test
pnpm lint:check       # run ESLint and autocorrect checks
pnpm lint:fix         # auto-fix lint and formatting issues
pnpm release          # create a release build
```

`pnpm build` writes output to `.scaffold/build` as configured in `zotero-plugin.config.ts`.

## Zotero Launch & Environment

- Always start Zotero through `pnpm start`; never launch `zotero.exe` directly.
- `.env` is local and gitignored. If it is missing, copy `.env.example` to `.env`.
- `.env` contains Zotero binary, profile, and source paths. Keep all paths absolute. `ZOTERO_SRC_PATH` points to the Zotero source checkout.

## Coding Style & Naming Conventions

- ESLint uses `@antfu/eslint-config` with double quotes and semicolons.
- TypeScript follows the `zotero-types` sandbox typing; keep source in `src/` and shared declarations in `typings/`.
- Use descriptive camelCase names for modules and utilities, and keep files small and single-purpose.
- `autocorrect` enforces formatting and text consistency; run `pnpm lint:fix` before committing.

## Testing Guidelines

- Place tests in `test/` and run them with `pnpm test`; `zotero-plugin test` loads them inside a running Zotero instance.
- For one-shot execution use `pnpm test --no-watch`.
- Also manually verify material switching, preferences, dialogs, and the Windows 10 fallback with `pnpm start`.
- CI currently runs `pnpm build` on pushes and pull requests to `main`.

## Commit & Pull Request Guidelines

- Use Conventional Commits, matching recent history: `feat`, `fix`, `refactor`, `chore`, `docs`, and `ci`.
- Scope commits when useful, such as `feat(reader): ...` or `fix(preference): ...`.
- Keep changes focused and link related issues in the pull request description.
- Include reproduction steps or screenshots when changing appearance or preferences.
- Ensure `pnpm build`, `pnpm lint:check`, and `pnpm test` pass before requesting review.
