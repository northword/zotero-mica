pref("version", "__buildVersion__");

// Whether the mica/acrylic material is applied
pref("enabled", true);

// Material type: "mica" | "mica-alt" | "acrylic"
pref("material", "mica-alt");

// Tint opacity of the root background, 0-100
pref("tint-opacity", 50);

// Whether dialogs should also get the material
pref("apply-dialogs", true);

// Whether to use the Win10 acrylic fallback when DWM_SYSTEMBACKDROP is unavailable
pref("fallback-win10", true);

// Whether to apply the material to the PDF page background (the area
// behind the pages inside the reader), instead of leaving it opaque.
pref("pdf-background", false);
