/**
 * Registers `content/mica.css` as an AGENT_SHEET. Agent sheets apply to
 * every document (chrome and content, current and future), which means
 * dialogs opened later are covered automatically. All our rules are
 * scoped by the `[zotero-mica]` attribute so unrelated documents are
 * unaffected.
 */

const SHEET_URI = `${rootURI}content/mica.css`;

function sss(): any {
  return Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
}

export function isStyleSheetRegistered(): boolean {
  try {
    return sss().sheetRegistered(Services.io.newURI(SHEET_URI), Ci.nsIStyleSheetService.AGENT_SHEET);
  }
  catch {
    return false;
  }
}

export function registerStyleSheet(): void {
  if (isStyleSheetRegistered()) {
    return;
  }
  try {
    sss().loadAndRegisterSheet(Services.io.newURI(SHEET_URI), Ci.nsIStyleSheetService.AGENT_SHEET);
  }
  catch {
    /* ignore */
  }
}

export function unregisterStyleSheet(): void {
  try {
    if (isStyleSheetRegistered()) {
      sss().unregisterSheet(Services.io.newURI(SHEET_URI), Ci.nsIStyleSheetService.AGENT_SHEET);
    }
  }
  catch {
    /* ignore */
  }
}
