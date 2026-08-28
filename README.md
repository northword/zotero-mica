# Mica for Zotero

Apply Windows **Mica / Mica Alt / Acrylic** backdrop materials to Zotero windows.

> Windows-only · Zotero 10+ (Firefox ESR 140 baseline)

## Features

- Three selectable materials: Mica, Mica Alt, Acrylic.
- Real-time switching and background-tint control (no restart).
- Applied to the main window and dialog windows.
- Windows 11 22H2+ uses the native DWM system backdrop (`DwmSetWindowAttribute` / `DWMWA_SYSTEMBACKDROP_TYPE`).
- Windows 10 fallback uses the Acrylic blur (`SetWindowCompositionAttribute`, the same approach as TranslucentTB).

## How it works

- A small CSS agent sheet makes the Zotero `:root` background translucent (alpha < 255), which makes Gecko enter `TransparencyMode::Transparent` (`nsLayoutUtils::GetFrameTransparency`). Gecko then calls `DwmExtendFrameIntoClientArea(-1)`, letting the DWM backdrop show through every translucent pixel.
- js-ctypes drives the material behind each window directly.

## Development

```bash
pnpm install
pnpm start     # serve to a running Zotero instance
pnpm build
pnpm lint:check
```

## License

[AGPL-3.0-or-later](./LICENSE)
