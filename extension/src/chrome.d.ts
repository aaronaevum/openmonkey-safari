// Minimal ambient declaration for the Chrome / Safari WebExtension API.
//
// OpenMonkey deliberately does not depend on `@types/chrome`, so the
// extension API surface used by the popup and pages is declared here in
// one place. Call sites must always guard with `typeof chrome !==
// "undefined"` (see `src/pages/storage.ts`) because the same code also
// runs in a plain web page / demo fallback where `chrome` is absent.
//
// The declaration is intentionally `any`-typed: Safari's WebExtension
// API is a subset of Chrome's and its exact promise/callback shapes vary
// by Safari version, so a narrow hand-written type would be a lie.
// Runtime code narrows every value it reads from `chrome` before use.
declare const chrome: any;
