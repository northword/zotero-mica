/**
 * Log helper: writes to Zotero's debug log, the browser console, stdout, and
 * (buffered, flushed atomically) to <profile>/zotero-mica.log so the host
 * process can read it even when the runner swallows Zotero's stdout.
 */

/* eslint-disable no-console */
const _lines: string[] = [];
let _flushing = false;

function flush(): void {
  if (_flushing || _lines.length === 0) {
    return;
  }
  _flushing = true;
  try {
    const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
    f.append("zotero-mica.log");
    const stream = Cc["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Ci.nsIFileOutputStream);
    // PR_WRONLY | PR_CREATE_FILE | PR_APPEND
    stream.init(f, 0x02 | 0x08 | 0x20, 0o644, 0);
    const text = `${_lines.join("\n")}\n`;
    const bytes = stream.write(text, text.length);
    stream.close();
    if (bytes > 0) {
      _lines.length = 0;
    }
  }
  catch {
    /* ignore */
  }
  _flushing = false;
}

setInterval(flush, 5000);

export function micalog(...args: unknown[]): void {
  const msg = args
    .map(a => (typeof a === "string" ? a : String(a)))
    .join(" ");
  _lines.push(msg);
  try {
    Zotero.debug(msg);
  }
  catch {
    /* ignore */
  }
  try {
    console.log("[zotero-mica]", msg);
  }
  catch {
    /* ignore */
  }
  try {
    const dumpFn = (globalThis as any).dump;
    if (typeof dumpFn === "function") {
      dumpFn(`[zotero-mica] ${msg}\n`);
    }
  }
  catch {
    /* ignore */
  }
}
