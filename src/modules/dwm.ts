/**
 * js-ctypes bridge to the Windows DWM / user32 APIs that drive the
 * Mica / Acrylic backdrop materials.
 *
 * We deliberately bypass Gecko's built-in `windowsmica` path (which
 * only syncs at window creation time) and drive DWM ourselves so we
 * can apply/change/restore the material at any time.
 *
 * Reference:
 *  - DWMWA_SYSTEMBACKDROP_TYPE = 38 (Windows 11 22H2+)
 *  - https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type
 */

// Abstraction over js-ctypes so the rest of the plugin stays type-safe.
//
// `ctypes` is exported by resource://gre/modules/ctypes.sys.mjs (see
// toolkit/components/ctypes/ctypes.sys.mjs in the gecko source). It is also a
// bare global in chrome-window scopes, but NOT in the sandboxed bootstrap
// scope the plugin bundle runs in — so the ESM import is the reliable path.
type CtypesNS = any;

// DWM_SYSTEMBACKDROP_TYPE
export const Backdrop = {
  AUTO: 0,
  MAINWINDOW: 2, // Mica
  TRANSIENTWINDOW: 3, // Acrylic
  TABBEDWINDOW: 4, // Mica Alt
} as const;

const DWMWA_SYSTEMBACKDROP_TYPE = 38;
const S_OK = 0;

// Win10 acrylic fallback (undocumented, same approach as TranslucentTB)
const WCA_ACCENT_POLICY = 19;
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;
const ACCENT_DISABLED = 0;

let _ctypes: CtypesNS | null = null;
let _libs: Array<{ close: () => void }> = [];
let _dwmSetBackdrop: ((hwnd: any, type: number) => boolean) | null = null;
let _setAccent: ((hwnd: any, abgr: number) => boolean) | null = null;
let _clearAccent: ((hwnd: any) => void) | null = null;
let _buildNumber: number | null = null;

function ctypes(): CtypesNS {
  if (!_ctypes) {
    // Prefer the documented ESM import; fall back to the bare global for
    // scopes that expose it directly (e.g. a chrome window's global).
    try {
      _ctypes = (globalThis as any).ctypes;
    }
    catch {
      /* ignore */
    }
    if (!_ctypes) {
      _ctypes = (ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs") as any).ctypes;
    }
  }
  // Graceful degradation: if neither path yields ctypes (shouldn't happen in
  // a system-privileged scope), all DWM calls below throw and fall back to no-ops.
  if (!_ctypes) {
    throw new Error("ctypes unavailable");
  }
  return _ctypes;
}

function ensureDwm() {
  if (_dwmSetBackdrop) {
    return _dwmSetBackdrop;
  }
  try {
    const c = ctypes();
    const dwmapi = c.open("dwmapi.dll") as any;
    _libs.push(dwmapi);
    const fn = dwmapi.declare(
      "DwmSetWindowAttribute",
      c.winapi_abi,
      c.int32_t, // HRESULT
      c.voidptr_t, // HWND
      c.uint32_t, // DWORD dwAttribute
      c.voidptr_t, // LPCVOID pvAttribute
      c.uint32_t, // DWORD cbAttribute
    );
    const UInt32 = c.uint32_t;
    _dwmSetBackdrop = (hwnd: any, type: number): boolean => {
      const value = new UInt32(type);
      const hres = Number(fn(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, value.address(), 4));
      return hres === S_OK;
    };
    return _dwmSetBackdrop;
  }
  catch {
    _dwmSetBackdrop = () => false;
    return _dwmSetBackdrop;
  }
}

function ensureAccent() {
  if (_setAccent && _clearAccent) {
    return { set: _setAccent, clear: _clearAccent };
  }
  try {
    const c = ctypes();
    const user32 = c.open("user32.dll") as any;
    _libs.push(user32);

    const ACCENT_POLICY = new c.StructType("ACCENT_POLICY", [
      { AccentState: c.int32_t },
      { AccentFlags: c.int32_t },
      { GradientColor: c.uint32_t },
      { AnimationId: c.int32_t },
    ]);
    const WINCOMPATTRDATA = new c.StructType("WINCOMPATTRDATA", [
      { Attribute: c.int32_t },
      { pData: c.voidptr_t },
      { dataSize: c.uintptr_t },
    ]);

    const fn = user32.declare(
      "SetWindowCompositionAttribute",
      c.winapi_abi,
      c.int32_t, // BOOL
      c.voidptr_t, // HWND
      c.voidptr_t, // WINCOMPATTRDATA*
    );

    const apply = (hwnd: any, accentState: number, abgr: number): void => {
      const accent = new ACCENT_POLICY();
      accent.AccentState = accentState;
      accent.AccentFlags = 2;
      accent.GradientColor = abgr >>> 0;
      accent.AnimationId = 0;
      const data = new WINCOMPATTRDATA();
      data.Attribute = WCA_ACCENT_POLICY;
      data.pData = accent.address();
      data.dataSize = ACCENT_POLICY.size;
      fn(hwnd, data.address());
    };

    _setAccent = (hwnd: any, abgr: number): boolean => {
      try {
        apply(hwnd, ACCENT_ENABLE_ACRYLICBLURBEHIND, abgr);
        return true;
      }
      catch {
        return false;
      }
    };
    _clearAccent = (hwnd: any): void => {
      try {
        apply(hwnd, ACCENT_DISABLED, 0);
      }
      catch {
        /* ignore */
      }
    };
  }
  catch {
    _setAccent = () => false;
    _clearAccent = () => {};
  }
  return { set: _setAccent, clear: _clearAccent };
}

/**
 * Get the OS build number via RtlGetVersion (avoids the GetVersionEx
 * manifest-compat layering).
 */
export function getOsBuild(): number {
  if (_buildNumber != null) {
    return _buildNumber;
  }
  try {
    const c = ctypes();
    const ntdll = c.open("ntdll.dll") as any;
    _libs.push(ntdll);
    const RTL_OSVERSIONINFOW = new c.StructType("RTL_OSVERSIONINFOW", [
      { dwOSVersionInfoSize: c.uint32_t },
      { dwMajorVersion: c.uint32_t },
      { dwMinorVersion: c.uint32_t },
      { dwBuildNumber: c.uint32_t },
      { dwPlatformId: c.uint32_t },
      { szCSDVersion: c.ArrayType(c.char16_t, 128) },
    ]);
    const RtlGetVersion = ntdll.declare(
      "RtlGetVersion",
      c.winapi_abi,
      c.int32_t,
      c.voidptr_t,
    );
    const info = new RTL_OSVERSIONINFOW();
    info.dwOSVersionInfoSize = RTL_OSVERSIONINFOW.size;
    RtlGetVersion(info.address());
    _buildNumber = Number(info.dwBuildNumber);
  }
  catch {
    _buildNumber = 0;
  }
  return _buildNumber;
}

/** Windows 11 22H2 (build 22621) or later supports DWMWA_SYSTEMBACKDROP_TYPE. */
export function isWin1122H2OrLater(): boolean {
  return getOsBuild() >= 22621;
}

/** Convert the `nsIBaseWindow.nativeHandle` hex string into a ctypes HWND. */
export function toCtypesHwnd(handle: string): any {
  const c = ctypes();
  const asUInt = c.UInt64(handle);
  return c.voidptr_t(asUInt);
}

/**
 * Extract the window handle (hex `0x...`) from a chrome window.
 * Returns null when unavailable (e.g. window already destroyed).
 */
export function getHwnd(win: any): string | null {
  try {
    const baseWindow = win?.docShell?.treeOwner?.QueryInterface(Ci.nsIBaseWindow);
    const h = baseWindow?.nativeHandle;
    return typeof h === "string" && h ? h : null;
  }
  catch {
    return null;
  }
}

/** Set the DWM system backdrop type on a window. Returns true on success. */
export function setBackdrop(hwnd: any, type: number): boolean {
  return ensureDwm()(hwnd, type);
}

/** Restore the system default backdrop (DWM decides, usually none). */
export function clearBackdrop(hwnd: any): void {
  ensureDwm()(hwnd, Backdrop.AUTO);
}

/** Win10 fallback: enable the acrylic blur behind the window. */
export function setAcrylicFallback(hwnd: any, abgrTint: number): boolean {
  return ensureAccent().set(hwnd, abgrTint);
}

/** Win10 fallback: remove the accent policy. */
export function clearAcrylicFallback(hwnd: any): void {
  ensureAccent().clear(hwnd);
}

/** Close all opened system libraries (called on plugin shutdown). */
export function closeLibraries(): void {
  for (const lib of _libs) {
    try {
      lib.close();
    }
    catch {
      /* ignore */
    }
  }
  _libs = [];
  _ctypes = null;
  _dwmSetBackdrop = null;
  _setAccent = null;
  _clearAccent = null;
  _buildNumber = null;
}
