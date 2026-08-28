import { micalog } from "../utils/log";
import { getPref } from "../utils/prefs";
import {
  Backdrop,
  clearAcrylicFallback,
  clearBackdrop,
  closeLibraries,
  getHwnd,
  isWin1122H2OrLater,
  setAcrylicFallback,
  setBackdrop,
  toCtypesHwnd,
} from "./dwm";
import { registerStyleSheet, unregisterStyleSheet } from "./style";

type Material = "mica" | "mica-alt" | "acrylic";

const BackdropForMaterial: Record<Material, number> = {
  "mica": Backdrop.MAINWINDOW,
  "mica-alt": Backdrop.TABBEDWINDOW,
  "acrylic": Backdrop.TRANSIENTWINDOW,
};

export class MicaManager {
  private wwObserver: any = null;
  private prefsObserver: any = null;
  private docObserver: any = null;
  private enabledWindows = new Set<any>();

  /* ---------------------------------------------------------------- */
  /* Public API                                                       */
  /* ---------------------------------------------------------------- */

  async enable(): Promise<void> {
    try {
      registerStyleSheet();
      this.registerWwObserver();
      this.registerDocObserver();
      this.registerPrefsObserver();
      this.applyToAllWindows();
    }
    catch (e) {
      micalog(`zotero-mica: enable failed - ${e}`);
    }
  }

  disable(): void {
    unregisterStyleSheet();
    this.unregisterWwObserver();
    this.unregisterPrefsObserver();
    this.unregisterDocObserver();
    this.restoreToAllWindows();
  }

  reapply(): void {
    if (getPref("enabled")) {
      this.applyToAllWindows();
    }
    else {
      this.disable();
    }
  }

  async shutdown(): Promise<void> {
    this.disable();
    closeLibraries();
  }

  /** True when DWM system backdrop is available (Win11 22H2+). */
  isFullSupport(): boolean {
    return isWin1122H2OrLater();
  }

  /* ---------------------------------------------------------------- */
  /* Per-window application                                          */
  /* ---------------------------------------------------------------- */

  private isApplyable(win: any): boolean {
    const docEl = win?.document?.documentElement;
    if (!docEl) {
      return false;
    }
    // Skip the early blank window
    if (docEl.getAttribute("windowtype") === "navigator:blank") {
      return false;
    }
    // The reader is a primary content window (not a dialog): it always gets
    // the material, independent of the "apply to dialogs" preference.
    if (docEl.getAttribute("windowtype") === "zotero:reader") {
      return true;
    }
    // When dialogs are disabled, restrict to the main Zotero windows only.
    if (!getPref("apply-dialogs") && !Zotero.getMainWindows().includes(win)) {
      return false;
    }
    return true;
  }

  private computeAcrylicTint(win: any, intensity: number): number {
    const dark
      = win?.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const alpha = Math.round(255 * (intensity * 0.8 + 0.1));
    const rgb = dark ? [30, 30, 30] : [249, 249, 249];
    // ABGR
    return ((alpha << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
  }

  /** Apply the material to a single window (idempotent). */
  applyMaterial(win: any): void {
    const docEl = win?.document?.documentElement;
    if (!this.isApplyable(win) || !docEl) {
      micalog(
        `zotero-mica: skipped ${win?.location?.href ?? "window"} `
        + `(docEl=${!!docEl} windowtype=${docEl?.getAttribute("windowtype")})`,
      );
      return;
    }

    if (!getPref("enabled")) {
      this.restoreMaterial(win);
      return;
    }

    const material = getPref("material") as Material;
    const intensity = Math.round(getPref("tint-opacity")) / 100;

    // 1. CSS: make the window translucent + tint it (triggers Gecko's
    //    TransparencyMode::Transparent via the alpha < 255 root bg). Keep
    //    track immediately so a restore can always clean this window.
    docEl.setAttribute("zotero-mica", material);
    docEl.style.setProperty("--mica-intensity", String(intensity));
    this.enabledWindows.add(win);
    this.applyInnerDocuments(docEl, material, intensity, false);

    // 2. DWM: set the actual backdrop material behind the window.
    let handle: string | null = null;
    let hwnd: any = null;
    try {
      handle = getHwnd(win);
      if (handle) {
        hwnd = toCtypesHwnd(handle);
      }
    }
    catch (e) {
      micalog(
        `zotero-mica: HWND/ctypes failure for ${win.location?.href ?? "window"} - ${e}`,
      );
    }
    if (!handle || !hwnd) {
      micalog(
        `zotero-mica: no HWND for ${win.location?.href ?? "window"}`,
      );
      return;
    }

    let ok: boolean;
    try {
      if (isWin1122H2OrLater()) {
        ok = setBackdrop(hwnd, BackdropForMaterial[material]);
        // Make sure any leftover Win10 accent is cleared.
        clearAcrylicFallback(hwnd);
      }
      else if (getPref("fallback-win10")) {
        ok = setAcrylicFallback(hwnd, this.computeAcrylicTint(win, intensity));
        // Restore DWM default just in case.
        clearBackdrop(hwnd);
      }
      else {
        ok = false;
        clearBackdrop(hwnd);
      }
    }
    catch (e) {
      micalog(
        `zotero-mica: DWM call failed for ${win.location?.href ?? "window"} - ${e}`,
      );
      ok = false;
    }
    micalog(
      `zotero-mica: applied ${material} (${BackdropForMaterial[material]}) `
      + `to ${win.location?.href ?? "window"} ok=${ok}`,
    );
  }

  private restoreMaterial(win: any): void {
    const docEl = win?.document?.documentElement;
    if (docEl) {
      this.applyInnerDocuments(docEl, null, 0, true);
      docEl.removeAttribute("zotero-mica");
      docEl.style.removeProperty("--mica-intensity");
    }

    const handle = getHwnd(win);
    if (handle) {
      try {
        const hwnd = toCtypesHwnd(handle);
        clearBackdrop(hwnd);
        clearAcrylicFallback(hwnd);
      }
      catch (e) {
        micalog(
          `zotero-mica: restore failed for ${win.location?.href ?? "window"} - ${e}`,
        );
      }
    }
    this.enabledWindows.delete(win);
  }

  /**
   * Propagate the attribute to inner documents so viewers that host content
   * pages (e.g. the basicViewer window's <browser> with about:addons) get the
   * material too. The agent sheet already applies to those documents; they
   * just don't carry the `zotero-mica` attribute by themselves.
   *
   * The viewer starts loading its URI synchronously from its own window-load
   * handler, so the content is usually NOT ready when we first look. Instead
   * of a fragile one-shot load listener (which an earlier about:blank load
   * can consume), we poll briefly until the target document appears.
   */
  private applyInnerDocuments(
    docEl: Element,
    material: string | null,
    intensity: number,
    remove: boolean,
  ): void {
    if (remove) {
      this.clearInnerDocTimer(docEl);
      this.paintInnerDocs(docEl, material, intensity, true);
      return;
    }
    if (this.paintInnerDocs(docEl, material, intensity, false)) {
      this.scheduleInnerDocRetry(docEl, material, intensity);
    }
  }

  private innerDocTimers = new WeakMap<Element, any>();
  private lastInnerUrls = new WeakMap<any, string>();

  /**
   * Apply/remove the attribute on inner documents. Returns true when a retry
   * could still help (a frame is still showing about:blank / loading — it will
   * be replaced by the real document later) and nothing has been applied yet.
   */
  private paintInnerDocs(
    docEl: Element,
    material: string | null,
    intensity: number,
    remove: boolean,
  ): boolean {
    let handled = false;
    let pending = false;
    const frames = Array.from(
      docEl.querySelectorAll("browser, iframe"),
    ) as any[];

    micalog(
      `zotero-mica: inner scan ${docEl.ownerGlobal?.location?.href ?? ""} `
      + `frames=${frames.length}`,
    );
    for (const frame of frames) {
      try {
        const contentDoc = (frame as any).contentDocument;
        const innerURL = contentDoc?.location?.href ?? "";
        const innerRoot = contentDoc?.documentElement;
        // Log only when the frame's URL changes, to keep the console quiet.
        if (innerURL !== this.lastInnerUrls.get(frame)) {
          this.lastInnerUrls.set(frame, innerURL);
          micalog(
            `zotero-mica: frame ${frame.localName} url=${innerURL || "(none)"} `
            + `ready=${contentDoc?.readyState ?? "?"}`,
          );
        }
        // The frame may be about to swap its about:blank document for the
        // real one — keep polling in that case.
        if (innerURL === "about:blank" || contentDoc?.readyState !== "complete") {
          if (!remove) {
            pending = true;
          }
          continue;
        }
        // Zotero reader: the reader.html document (toolbar, annotation /
        // outline sidebar, split-view background) plus the pdf viewer
        // iframes it hosts (the grey area behind the pages). The reader can
        // live in its own window (reader.xhtml's `browser#reader`) or as a
        // tab inside the main window (`browser.reader`), so we detect it by
        // URL rather than by which chrome window contains it.
        if (this.isReaderFrame(frame, innerURL)) {
          if (this.applyReaderFrame(frame, material, intensity, remove)) {
            pending = true;
          }
          else {
            handled = true;
          }
          continue;
        }
        // Only touch the viewer's in-content pages (about:addons etc.), not
        // e.g. the PDF reader inside the main window.
        if (!innerRoot || !innerURL.startsWith("chrome://mozapps")) {
          continue;
        }
        if (remove) {
          innerRoot.removeAttribute("zotero-mica");
          innerRoot.style.removeProperty("--mica-intensity");
          micalog(`zotero-mica: cleared inner doc ${innerURL}`);
        }
        else {
          innerRoot.setAttribute("zotero-mica", material ?? "mica");
          innerRoot.style.setProperty("--mica-intensity", String(intensity));
          this.ensureInnerStyle(innerRoot, intensity);
          micalog(`zotero-mica: applied to inner doc ${innerURL}`);
        }
        handled = true;
      }
      catch (e) {
        // Remote or cross-origin frames: nothing to do.
        micalog(`zotero-mica: inner frame skipped - ${e}`);
      }
    }
    return !handled && pending;
  }

  /* ---------------------------------------------------------------- */
  /* Reader support (reader.html + pdf viewer iframes)                */
  /* ---------------------------------------------------------------- */

  /* The reader is served from this resource URL, regardless of whether it
   * is shown in its own window or as a tab in the main window. Match on the
   * path suffix so build variations don't break detection. */
  private isReaderFrame(frame: any, innerURL: string): boolean {
    return (
      innerURL.endsWith("/reader/reader.html")
      || innerURL === "resource://zotero/reader/reader.html"
      || frame?.id === "reader"
      || frame?.classList?.contains?.("reader")
    );
  }

  /**
   * Apply the material to a reader frame's chain: the reader.html document
   * (reader chrome surfaces) and every pdf viewer iframe it hosts (PDF page
   * background, opt-in). Returns true when a retry could still help (the
   * reader doc, or the opt-in viewer iframe, is still loading).
   *
   * A single `zotero-mica` attribute on the reader's <html> turns the
   * toolbar / annotation & outline sidebar / split-view background
   * translucent via the agent sheet's `--color-*` overrides (same process,
   * so the agent sheet reaches these documents). The viewer page background
   * is opt-in behind the `pdf-background` pref via `zotero-mica-pdf`.
   */
  private applyReaderFrame(
    frame: any,
    material: string | null,
    intensity: number,
    remove: boolean,
  ): boolean {
    let pending = false;
    let sawViewer = false;
    try {
      const doc = (frame as any).contentDocument as Document | null;
      const root = doc?.documentElement as any;
      if (!doc || !root) {
        if (!remove) {
          pending = true;
        }
        return pending;
      }
      if (remove) {
        root.removeAttribute("zotero-mica");
        root.style.removeProperty("--mica-intensity");
      }
      else {
        root.setAttribute("zotero-mica", material ?? "mica");
        root.style.setProperty("--mica-intensity", String(intensity));
        micalog("zotero-mica: applied to reader doc");
      }
      // The pdf viewer iframes inside reader.html are created by React,
      // so they appear asynchronously after reader.html loads.
      for (const vframe of Array.from(root.querySelectorAll("iframe")) as any[]) {
        try {
          const vdoc = (vframe as any).contentDocument as Document | null;
          const vRoot = vdoc?.documentElement as any;
          const vURL = vdoc?.location?.href ?? "";
          if (!vdoc || !vRoot || vURL === "about:blank" || vdoc?.readyState !== "complete") {
            if (!remove) {
              pending = true;
            }
            continue;
          }
          // Only the Zotero pdf viewer page sits behind the pages (its path
          // differs between platform builds, so match on the filename).
          if (!vURL.endsWith("viewer.html")) {
            continue;
          }
          sawViewer = true;
          this.applyViewerDoc(vdoc, vRoot, intensity, remove);
        }
        catch (e) {
          micalog(`zotero-mica: reader viewer frame skipped - ${e}`);
        }
      }
      // If the page background is opted in but the viewer iframe has not
      // been created yet, keep polling briefly (React may still be
      // rendering the view).
      if (!remove && getPref("pdf-background") && !sawViewer) {
        pending = true;
      }
    }
    catch (e) {
      micalog(`zotero-mica: reader frame skipped - ${e}`);
    }
    return pending;
  }

  /**
   * Apply/remove the translucent PDF page background. Opt-in behind the
   * `pdf-background` pref; leaves the page canvases untouched.
   *
   * Two mechanisms, belt-and-braces:
   *  1. an inline `<style>` injected into viewer.html with author-`!important`
   *     rules — works even if the global agent sheet does not reach the
   *     viewer document (e.g. process-isolated iframes), and applies to the
   *     `#viewerContainer`/`body` however late they appear;
   *  2. the `zotero-mica-pdf` attribute so the agent sheet's own rules apply
   *     too when it does reach this document.
   */
  private applyViewerDoc(
    doc: Document,
    vRoot: any,
    intensity: number,
    remove: boolean,
  ): void {
    try {
      let style = doc.querySelector("style[data-zotero-mica-pdf]") as any;
      if (remove || !getPref("pdf-background")) {
        style?.remove();
        vRoot?.removeAttribute?.("zotero-mica-pdf");
        vRoot?.style?.removeProperty?.("--mica-intensity");
        return;
      }
      vRoot?.setAttribute?.("zotero-mica-pdf", "");
      vRoot?.style?.setProperty?.("--mica-intensity", String(intensity));
      if (!style) {
        style = (() => {
          const s = doc.createElement("style");
          s.setAttribute("data-zotero-mica-pdf", "");
          ((doc.head ?? doc.documentElement) as any).appendChild(s);
          return s;
        })();
      }
      style.textContent = `
        :root { --mica-tint: 249 249 249; }
        @media (prefers-color-scheme: dark) { :root { --mica-tint: 30 30 30; } }
        body, #viewerContainer {
          background-color: rgb(var(--mica-tint) / calc(0.45 + var(--mica-intensity, 0.5) * 0.25)) !important;
        }
      `;
      micalog("zotero-mica: pdf page background enabled on viewer");
    }
    catch (e) {
      micalog(`zotero-mica: viewer style inject failed - ${e}`);
    }
  }

  private scheduleInnerDocRetry(
    docEl: Element,
    material: string | null,
    intensity: number,
  ): void {
    if (this.innerDocTimers.has(docEl)) {
      return;
    }
    let tries = 0;
    const timerId = setTimeout(() => {
      this.innerDocTimers.delete(docEl);
      if (tries++ > 40) {
        return; // ~10s, enough for any local chrome page
      }
      if (this.paintInnerDocs(docEl, material, intensity, false)) {
        this.scheduleInnerDocRetry(docEl, material, intensity);
      }
    }, 250);
    this.innerDocTimers.set(docEl, timerId);
  }

  /**
   * Insert an explicit inline stylesheet into the inner document. Author-origin
   * `!important` rules win over everything except engine-internal UA rules, so
   * this forces the page background translucent even if the global agent sheet
   * does not reach this document.
   */
  private ensureInnerStyle(innerRoot: Element, intensity: number): void {
    try {
      const doc = innerRoot.ownerDocument as Document;
      if (doc.querySelector("style[data-zotero-mica]")) {
        return;
      }
      const dark = innerRoot.ownerGlobal?.matchMedia?.(
        "(prefers-color-scheme: dark)",
      )?.matches;
      const tint = dark ? "40 40 40" : "249 249 249";
      const alpha = 0.06 + intensity * 0.5;
      const style = doc.createElement("style");
      style.setAttribute("data-zotero-mica", "");
      style.textContent = `
        :root {
          --in-content-page-background: rgb(${tint} / ${alpha}) !important;
          --background-color-canvas: rgb(${tint} / ${alpha}) !important;
          background-color: transparent !important;
        }
        body {
          background-color: rgb(${tint} / ${alpha}) !important;
        }
      `;
      const head = doc.head as HTMLElement | null;
      (head ?? doc.documentElement as HTMLElement).appendChild(style);
    }
    catch (e) {
      micalog(`zotero-mica: inner style inject failed - ${e}`);
    }
  }

  private clearInnerDocTimer(docEl: Element): void {
    const timerId = this.innerDocTimers.get(docEl);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.innerDocTimers.delete(docEl);
    }
  }

  private applyToAllWindows() {
    // Existing windows (main + dialogs).
    for (const win of Services.wm.getEnumerator(null)) {
      this.applyMaterial(win);
    }
  }

  private restoreToAllWindows() {
    for (const win of this.enabledWindows) {
      this.restoreMaterial(win);
    }
    this.enabledWindows.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Observers                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Apply the material to a (possibly still-loading) top-level window.
   * `toplevel-window-ready` fires BEFORE the new document has started loading
   * (see nsWindowWatcher), so the window's initial about:blank document must
   * NOT be mistaken for the real one (it can already report readyState
   * "complete"). Only apply immediately when the document is genuinely the
   * loaded chrome document; otherwise wait for the window's `load` event.
   */
  private micaWindowWhenReady(win: any): void {
    try {
      const doc = win.document;
      const docURL = doc?.location?.href ?? "";
      const isRealDoc = docURL.startsWith("chrome://")
        && doc?.readyState === "complete"
        && doc?.documentElement;
      if (isRealDoc) {
        this.applyMaterial(win);
        return;
      }
      win.addEventListener("load", () => this.applyMaterial(win), {
        once: true,
      });
    }
    catch (e) {
      micalog(`zotero-mica: window-ready apply failed - ${e}`);
    }
  }

  private registerWwObserver() {
    if (this.wwObserver) {
      return;
    }
    this.wwObserver = {
      observe: (subject: any, topic: string) => {
        if (topic !== "toplevel-window-ready") {
          return;
        }
        const win: any = subject?.QueryInterface?.(Ci.nsIDOMWindow) || subject;
        if (!win) {
          return;
        }
        const doc = win.document;
        micalog(
          `zotero-mica: window-ready ${win.location?.href ?? ""} `
          + `docURL=${doc?.location?.href ?? ""} readyState=${doc?.readyState}`,
        );
        this.micaWindowWhenReady(win);
      },
    };
    // "toplevel-window-ready" is dispatched via the OBSERVER SERVICE (see
    // nsIWindowWatcher.openWindow docs), NOT via ww.registerNotification
    // (whose observers only get domwindowopened/domwindowclosed).
    Services.obs.addObserver(this.wwObserver, "toplevel-window-ready");
  }

  private unregisterWwObserver() {
    if (!this.wwObserver) {
      return;
    }
    try {
      Services.obs.removeObserver(this.wwObserver, "toplevel-window-ready");
    }
    catch {
      /* ignore */
    }
    this.wwObserver = null;
  }

  /* ---------------------------------------------------------------- */
  /* Reader document observer                                        */
  /* ---------------------------------------------------------------- */

  /**
   * React to reader documents as soon as they are created. The reader can
   * run in its own window (reader.xhtml) or as a tab in the main window; in
   * the latter case the `<browser class="reader">` is appended to the main
   * window's tab container AFTER the main window has already been processed,
   * so nothing re-scans it until a preference change. Observing
   * `document-element-inserted` lets us re-apply the material the instant a
   * reader.html (or its pdf viewer.html) document appears, in either mode.
   *
   * The subject is the new Document and `data` is its URL; we locate the
   * embedding chrome window through the browser's docShell and re-run
   * applyMaterial() on it (idempotent) so the whole reader chain — window
   * DWM backdrop, reader surfaces, opt-in pdf page background — is applied
   * without waiting for a later preference change.
   */
  private registerDocObserver() {
    if (this.docObserver) {
      return;
    }
    this.docObserver = {
      observe: (subject: any, topic: string, data: string) => {
        if (topic !== "document-element-inserted" || !getPref("enabled")) {
          return;
        }
        const url = data || (subject?.documentURI ?? "");
        if (typeof url !== "string") {
          return;
        }
        if (!url.endsWith("reader.html") && !url.endsWith("viewer.html")) {
          return;
        }
        try {
          const win = (subject as Document)?.defaultView;
          const chromeWin = win?.docShell?.chromeEventHandler?.ownerGlobal;
          if (chromeWin) {
            micalog(`zotero-mica: reader doc inserted ${url} -> ${chromeWin.location?.href ?? "?"}`);
            this.applyMaterial(chromeWin);
          }
        }
        catch (e) {
          micalog(`zotero-mica: reader doc observer failed - ${e}`);
        }
      },
    };
    Services.obs.addObserver(this.docObserver, "document-element-inserted");
  }

  private unregisterDocObserver() {
    if (!this.docObserver) {
      return;
    }
    try {
      Services.obs.removeObserver(this.docObserver, "document-element-inserted");
    }
    catch {
      /* ignore */
    }
    this.docObserver = null;
  }

  private registerPrefsObserver() {
    if (this.prefsObserver) {
      return;
    }
    this.prefsObserver = {
      observe: (_subject: any, topic: string, _data: string) => {
        if (topic === "nsPref:changed") {
          this.reapply();
        }
      },
    };
    Services.prefs.addObserver(
      addon.data.config.prefsPrefix,
      this.prefsObserver,
    );
  }

  private unregisterPrefsObserver() {
    if (!this.prefsObserver) {
      return;
    }
    try {
      Services.prefs.removeObserver(
        addon.data.config.prefsPrefix,
        this.prefsObserver,
      );
    }
    catch {
      /* ignore */
    }
    this.prefsObserver = null;
  }
}
