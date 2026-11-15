// Cross-browser namespace shim.
//
// Firefox exposes both `browser` (promise-based) and `chrome` (callback-based).
// Chrome/Chromium expose only `chrome`, but from Chrome 121 every async
// extension API returns a promise when no callback is passed, so aliasing the
// namespace lets the `browser.*` code run unchanged on both browsers.
//
// On Firefox this module is a no-op. Import it before any module that touches
// extension APIs at evaluation time.

if (typeof globalThis.browser === 'undefined') {
  globalThis.browser = globalThis.chrome;
}
