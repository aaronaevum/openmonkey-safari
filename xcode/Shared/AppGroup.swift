import Foundation

/// Shared App Group constants and container helpers.
///
/// The app targets and the Safari Web Extension target all read and write
/// userscripts through this group, so the identifier here must match:
///  - the App Groups capability in every target's entitlements file, and
///  - the `group.com.openmonkey.safari` entry in
///    `Extension/OpenMonkeyExtension.entitlements` and the app entitlements.
/// If the group identifier changes, change it in all of those places.
public enum AppGroup {

    /// The App Group identifier shared by the app and its Safari extension.
    public static let identifier = "group.com.openmonkey.safari"

    /// The folder inside the shared container that holds installed scripts.
    public static let scriptsDirectoryName = "Scripts"

    /// Key for the global injection switch, shared by the app and the
    /// extension. `true` means scripts run; absent means `true`.
    public static let globalEnabledKey = "OpenMonkeyGlobalEnabled"

    /// Key for the app language, shared by the app and the extension.
    /// Values are `"system"` (follow the device language), `"zh"` or
    /// `"en"`; absent means `"system"`.
    public static let languageKey = "OpenMonkeyLanguage"

    /// v0.5.0 settings keys (shared contract with the web extension's
    /// `openmonkey.settings.v1` store — same names without the
    /// `OpenMonkey` prefix — and with the native settings bridge in
    /// `SafariWebExtensionHandler`). Defaults are documented in
    /// `OMSharedSettings` (`Design.swift`).
    public static let darkModeKey = "OpenMonkeyDarkMode"
    public static let darkModeEnabledKey = "OpenMonkeyDarkModeEnabled"
    public static let adFilterEnabledKey = "OpenMonkeyAdFilterEnabled"
    public static let customAdRulesKey = "OpenMonkeyCustomAdRules"
    public static let tagModeEnabledKey = "OpenMonkeyTagModeEnabled"
    public static let smartSearchEnabledKey = "OpenMonkeySmartSearchEnabled"
    public static let smartSearchTriggerKey = "OpenMonkeySmartSearchTrigger"
    public static let smartSearchEnginesKey = "OpenMonkeySmartSearchEngines"
    public static let sniffEnabledKey = "OpenMonkeySniffEnabled"
    public static let showSniffButtonKey = "OpenMonkeyShowSniffButton"
    public static let longPressSniffKey = "OpenMonkeyLongPressSniff"
    public static let resourceDetectionEnabledKey = "OpenMonkeyResourceDetectionEnabled"
    public static let darkEditorKey = "OpenMonkeyDarkEditor"
    public static let fileSortKey = "OpenMonkeyFileSort"
    public static let showPromptPopupsKey = "OpenMonkeyShowPromptPopups"
    public static let syncEnabledKey = "OpenMonkeySyncEnabled"
    public static let appLockEnabledKey = "OpenMonkeyAppLockEnabled"

    /// Key for the detected-media list the extension reports
    /// (`openmonkey.resources.v1`, a JSON string of
    /// `OMDetectedResource` objects). The web side writes it through
    /// the native `reportResources` message; the host app only reads.
    public static let resourcesKey = "openmonkey.resources.v1"

    /// The shared `UserDefaults` suite, falling back to `.standard`
    /// when the App Group suite is unavailable (for example, in an
    /// unsigned build without the App Groups entitlement). Callers
    /// must never crash on a missing suite; the fallback keeps the
    /// app usable and the toggle still works app-locally.
    public static var sharedDefaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? UserDefaults.standard
    }

    /// `true` when the resolved app language is Chinese: an explicit
    /// `"zh"` choice, or `"system"` (or an unknown stored value) with
    /// a Chinese preferred language on the device. Used by the
    /// Foundation-only error strings in `ScriptStore` /
    /// `MetadataParser`, which cannot reach the SwiftUI language
    /// manager (Shared/ is also compiled into the extension target).
    public static func resolvedLanguageIsChinese() -> Bool {
        let defaults = sharedDefaults
        if let selection = defaults.string(forKey: languageKey) {
            if selection == "zh" { return true }
            if selection == "en" { return false }
        }
        return Locale.preferredLanguages.first?.hasPrefix("zh") == true
    }

    /// Returns the Chinese string when the resolved language is
    /// Chinese, otherwise the English string. For short user-facing
    /// error messages only; full UI strings live in the app's
    /// `OMTextKey` table (`Design.swift`).
    public static func localized(en: String, zh: String) -> String {
        resolvedLanguageIsChinese() ? zh : en
    }

    /// The shared container URL, or `nil` when the App Group is not
    /// configured (for example, before signing is set up, or when running
    /// without the App Groups entitlement). Callers must handle `nil`
    /// gracefully; see ``scriptsDirectory(createIfNeeded:)``.
    public static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    /// The URL of the shared `Scripts` directory, creating it on demand.
    ///
    /// - Parameter createIfNeeded: When `true` (the default), the directory
    ///   is created if it does not exist yet.
    /// - Returns: The scripts directory URL, or `nil` when no shared
    ///   container is available. In that case callers fall back to the
    ///   app's own Documents directory (see `ScriptStore`).
    public static func scriptsDirectory(createIfNeeded: Bool = true) -> URL? {
        guard let container = containerURL else { return nil }
        let directory = container.appendingPathComponent(scriptsDirectoryName, isDirectory: true)
        guard createIfNeeded else { return directory }
        do {
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true, attributes: nil)
            return directory
        } catch {
            return nil
        }
    }

    /// A per-install fallback scripts directory inside the app sandbox,
    /// used only when the shared container is unavailable.
    public static var fallbackScriptsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(scriptsDirectoryName, isDirectory: true)
    }
}
