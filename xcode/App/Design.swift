import SwiftUI
import Combine
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Design tokens for the v0.4.0 redesign (see docs/ui-redesign.md):
/// the same language as the web extension — system grey background,
/// cards with 16pt corners, green switches, brand purple (#6C5CFF)
/// used sparingly, Stay-style script rows (40px rounded-square icon,
/// bold name, one-line description, "● Activated | ⓥ version |
/// Updated date" bottom line, green switch).
///
/// v0.4.0 fixes the v0.3.0 dark-mode failure: cards were
/// `systemBackground` (black in dark mode) on a
/// `systemGroupedBackground` page (#1C1C1E), so they vanished. Cards
/// are now `secondarySystemGroupedBackground` — white on #F2F2F7 in
/// light mode, #2C2C2E on #1C1C1E in dark mode — the semantic pairing
/// iOS itself uses for grouped lists. Every other fill in the app is
/// semantic too (system fills, never fixed black/white); the only
/// fixed colours left are the coloured feature-icon circles, the
/// brand purple, the switch green, and the code editor's own dark/
/// light theme, which is a deliberate paired theme, not app chrome.
enum OMDesign {

    /// Brand purple — icon, primary buttons, sparse emphasis only.
    static let brand = Color(red: 0x6C / 255.0, green: 0x5C / 255.0, blue: 1.0)

    /// Page background (system grouped background on iOS).
    static var pageBackground: Color {
        #if os(iOS)
        return Color(UIColor.systemGroupedBackground)
        #elseif os(macOS)
        return Color(NSColor.windowBackgroundColor)
        #else
        return Color(.gray).opacity(0.12)
        #endif
    }

    /// Card / list-container background.
    ///
    /// iOS: `secondarySystemGroupedBackground`, NOT `systemBackground`.
    /// `systemBackground` is black in dark mode, the same as the page
    /// background is close to, so cards built on it are invisible in
    /// dark mode (the v0.3.0 failure). The grouped pair is white on
    /// #F2F2F7 light, #2C2C2E on #1C1C1E dark — separated in both.
    static var cardBackground: Color {
        #if os(iOS)
        return Color(UIColor.secondarySystemGroupedBackground)
        #elseif os(macOS)
        return Color(NSColor.controlBackgroundColor)
        #else
        return Color.white
        #endif
    }

    /// Fill for small capsules and chips ("View help", the selected
    /// library segment, count badges): a translucent system fill that
    /// reads as light grey in light mode and as a lighter grey on the
    /// dark card in dark mode. Never a fixed `Color.gray.opacity(...)`.
    static var capsuleBackground: Color {
        #if os(iOS)
        return Color(UIColor.secondarySystemFill)
        #elseif os(macOS)
        return Color(NSColor.controlBackgroundColor)
        #else
        return Color(.gray).opacity(0.18)
        #endif
    }

    /// Secondary (grey) text.
    static let secondaryText = Color.secondary

    /// The green used for switches and the "Activated" dot.
    static let switchGreen = Color(red: 0x34 / 255.0, green: 0xC7 / 255.0, blue: 0x59 / 255.0)

    /// The grey used for the "Stopped" dot.
    static let stoppedGrey = Color(red: 0x8E / 255.0, green: 0x8E / 255.0, blue: 0x93 / 255.0)

    /// The floating pill's visual gap (v0.5.1): the pill floats this
    /// far above the bottom edge of the safe area, so it never sits
    /// on the Home Indicator. This is a *visual* gap only — it is
    /// NOT a content clearance. The clearance is structural: the
    /// pill is the bottom child of a `VStack` in `OpenMonkeyApp`,
    /// so the tab content's frame ends above the pill on every
    /// device and no view adds its own bottom padding for it.
    /// (v0.5.0's fixed 116pt / 100pt clearance constants are gone:
    /// 116pt was wrong on every device — the pill is ~64pt tall, so
    /// 64 + 18 + the content's own 16pt ≈ 98pt was needed and 116pt
    /// left a ~34pt band of empty page background below the last
    /// card, while a larger Dynamic Type pill could still overlap
    /// content. A fixed number can never track the real pill
    /// height, so the clearance must come from the layout flow,
    /// never a constant. The first v0.5.1 attempt used
    /// `safeAreaInset`, which only inset the scrollable content's
    /// bottom edge — at scrollTop=0 the pill still covered the
    /// first screenful's lower band on all 5 verified sizes — so
    /// the `VStack` flow is the fix, not the inset. Adding pill
    /// padding back by hand would double-count the reserved strip;
    /// `check-xcode-project.py` fails the build if a fixed
    /// bottom-clearance constant ever returns.)
    static let tabBarFloatGap: CGFloat = 18

    /// Segmented-pill container (the 自动/浅色/深色 and 前置/后置
    /// controls in the sub-pages): a translucent system fill, darker
    /// than the selected pill in dark mode, lighter in light mode.
    static var segmentedContainerBackground: Color {
        #if os(iOS)
        return Color(UIColor.tertiarySystemFill)
        #elseif os(macOS)
        return Color(NSColor.controlBackgroundColor)
        #else
        return Color(.gray).opacity(0.18)
        #endif
    }

    /// The selected segment inside a segmented pill: a more opaque
    /// system fill than the container, so it reads as the active pill
    /// in both modes.
    static var segmentedSelectedBackground: Color {
        #if os(iOS)
        return Color(UIColor.secondarySystemFill)
        #elseif os(macOS)
        return Color(NSColor.selectedControlColor)
        #else
        return Color(.gray).opacity(0.35)
        #endif
    }

    /// The active tab's inner pill in the floating tab bar: the page
    /// background colour itself (near-black in dark mode, white in
    /// light mode), so the active tab reads as a darker pill sitting
    /// inside the translucent bar — the reference look.
    static var pillActiveBackground: Color {
        #if os(iOS)
        return Color(UIColor.secondarySystemBackground)
        #elseif os(macOS)
        return Color(NSColor.windowBackgroundColor)
        #else
        return Color.white
        #endif
    }
}

// MARK: - Localization (v0.4.0)

/// One user-visible string in the host app. Every string the user can
/// see goes through this table — no hardcoded UI literals are left in
/// the views — so Chinese mode shows no English and English mode
/// shows no Chinese (script names, URLs, file names and code are user
/// content, not UI strings, and are never translated).
///
/// Implemented as an in-app table rather than `.xcstrings` on purpose:
/// a strings file would need registering in the hand-maintained
/// `project.pbxproj` (file reference + build file + the right target)
/// and the extension target must not pick it up; the table needs no
/// project changes, is auditable in one place, and re-renders instantly
/// because `OMLanguageManager` is an `ObservableObject` every view
/// observes.
enum OMTextKey: String {
    case tabHome
    case tabScripts
    case navHome
    case navScripts
    case navInstall
    case navSettings
    case cardScriptsTitle
    case cardScriptsDesc
    case cardEditorTitle
    case cardEditorDesc
    case cardInstallTitle
    case cardInstallDesc
    case cardSettingsTitle
    case cardSettingsDesc
    case viewHelp
    case appGroupBanner
    case helpScriptsBody
    case helpEditorBody
    case helpInstallBody
    case helpSettingsBody
    case done
    case close
    case ok
    case cancel
    case delete
    case save
    case discard
    case installFromURL
    case fetchAndInstall
    case installURLFootnote
    case installOtherWays
    case importFromFile
    case pasteFromClipboard
    case writeNewScript
    case pastedScriptName
    case installStatusInvalidURL
    case installStatusDownloading
    case installStatusDownloadFailed
    case installStatusDownloadedNothing
    case installStatusClipboardEmpty
    case installStatusFileUnreadable
    case installStatusNotUserscript
    case installStatusFileOpenFailed
    case installStatusInstalled
    case installStatusFailed
    case searchScripts
    case segmentActivated
    case segmentStopped
    case segmentFeatured
    case checkForUpdates
    case newScript
    case installFromAnywhere
    case updateCheckTitle
    case library
    case enabledCount
    case enableAllShown
    case disableAllShown
    case groupUserscripts
    case groupUserstyles
    case emptyActivated
    case emptyStopped
    case emptyFeatured
    case updateNoneDeclare
    case updateAvailable
    case updateAllUpToDate
    case statusActivated
    case statusStopped
    case statusUpdated
    case userstyle
    case permissions
    case runsOn
    case update
    case noUpdateURL
    case checkForUpdate
    case updateTo
    case editScript
    case exportUserscript
    case copySource
    case copied
    case deleteScript
    case deleteScriptTitle
    case deleteScriptMessage
    case author
    case file
    case homepage
    case runAt
    case updateStatusNoURL
    case updateStatusChecking
    case updateStatusCheckFailed
    case updateStatusInvalidRemote
    case updateStatusAvailable
    case updateStatusUpToDate
    case updateStatusUpdated
    case updateStatusSaveFailed
    case editorNewScript
    case discardChanges
    case discardChangesTitle
    case keepEditing
    case discardChangesMessage
    case couldNotSave
    case unsavedChanges
    case allChangesSaved
    case charactersCount
    case sectionScripts
    case sectionEditor
    case sectionStorage
    case sectionEnableInSafari
    case sectionLinks
    case sectionAbout
    case sectionLanguage
    case enableAllScripts
    case checkOnLaunch
    case updateInterval
    case intervalNever
    case intervalDaily
    case intervalWeekly
    case intervalMonthly
    case intervalEveryDays
    case darkEditor
    case editorFootnote
    case scriptsFolder
    case sharedWithSafari
    case appOnly
    case location
    case installedScripts
    case appGroupUnavailable
    case enableStepsIntro
    case enableStep1
    case enableStep2
    case enableStep3
    case enableStep4
    case enableMacOS
    case enableMatchNote
    case linkGitHub
    case linkGreasyFork
    case linksFootnote
    case version
    case versionValue
    case aboutText
    case licenseText
    case language
    case languageSystem
    case languageChinese
    case languageEnglish
    // v0.5.0 — Addons-style Home (7 reference shots), 我的 tab, sub-pages.
    case tabMy
    case navMy
    case cardResourcesTitle
    case cardResourcesDesc
    case cardAdFilterTitle
    case cardAdFilterDesc
    case cardTagModeTitle
    case cardTagModeDesc
    case cardSmartSearchTitle
    case cardSmartSearchDesc
    case cardDarkModeTitle
    case cardDarkModeDesc
    case cardSniffTitle
    case cardSniffDesc
    case helpResourcesBody
    case helpAdFilterBody
    case helpTagModeBody
    case helpSmartSearchBody
    case helpDarkModeBody
    case helpSniffBody
    case sectionBasic
    case sectionSupport
    case myGeneral
    case myTasks
    case mySync
    case myCleanup
    case myFeedback
    case myRate
    case myShare
    case myPrivacy
    case myAbout
    case versionFormat
    case darkModeRow
    case darkAuto
    case darkLight
    case darkDark
    case triggerRow
    case triggerPrefix
    case triggerSuffix
    case appLockRow
    case appLockNote
    case generalCodeEditor
    case fileSortRow
    case sortTimeAsc
    case sortTimeDesc
    case sortName
    case showPromptsRow
    case showSniffButtonRow
    case longPressSniffRow
    case enableSyncRow
    case syncDesc
    case syncNowRow
    case lastSyncNever
    case lastSyncFormat
    case syncDone
    case syncUnavailable
    case cleanTempRow
    case cleanButton
    case cleanDoneFormat
    case cleanNothing
    case cleanFootnote
    case storageSection
    case storageSizeRow
    case adRulesTitle
    case adRulesEmpty
    case adRulesPlaceholder
    case adRulesAdd
    case adRulesFootnote
    case adRulesInvalid
    case smartSearchTitle
    case smartSearchEngines
    case engineTrigger
    case engineURL
    case engineName
    case addEngine
    case resetEngines
    case smartSearchFootnote
    case engineInvalid
    case resourcesEmpty
    case resourcesDetectionOff
    case resourcesSave
    case resourcesCopyLink
    case resourcesCopiedLink
    case resourcesSavedFormat
    case resourcesSaveFailed
    case resourcesTypeVideo
    case resourcesTypeAudio
    case resourcesTypeImage
    case resourcesTypeOther
    case resourcesFrom
    case privacyTitle
    case privacyBody
    case aboutTitle
    case aboutBody
    case shareMessage
    case lockTitle
    case lockBody
    case lockButton
    case lockFailed
    case openInSafari
}

/// The app language. Created once in `OpenMonkeyApp` and passed down
/// as an `@EnvironmentObject`, so changing the language in Settings
/// re-renders every view immediately. The choice is persisted in the
/// App Group suite key `OpenMonkeyLanguage` ("system" | "zh" | "en",
/// default "system") so the Safari extension's native bridge can read
/// the same value; when the suite is unavailable it falls back to
/// `.standard`, so the app never crashes.
final class OMLanguageManager: ObservableObject {

    /// The stored choice: "system", "zh" or "en".
    @Published var selection: String {
        didSet { saveSelection() }
    }

    init() {
        let stored = AppGroup.sharedDefaults.string(forKey: AppGroup.languageKey) ?? "system"
        selection = ["system", "zh", "en"].contains(stored) ? stored : "system"
    }

    /// Re-reads the suite (for example, after the extension changed
    /// the language through the native bridge) and publishes only when
    /// the value actually changed.
    func refresh() {
        let stored = AppGroup.sharedDefaults.string(forKey: AppGroup.languageKey) ?? "system"
        let value = ["system", "zh", "en"].contains(stored) ? stored : "system"
        if selection != value { selection = value }
    }

    /// `true` when Chinese is the effective language: an explicit
    /// "zh" choice, or "system" with a Chinese device language.
    var isChinese: Bool {
        if selection == "zh" { return true }
        if selection == "en" { return false }
        return Locale.preferredLanguages.first?.hasPrefix("zh") == true
    }

    /// The locale applied to the whole app via `.environment(\.locale,)`.
    var locale: Locale {
        Locale(identifier: isChinese ? "zh-Hans" : "en")
    }

    /// The string for `key` in the effective language.
    func text(_ key: OMTextKey) -> String {
        guard let pair = OMTextTable.strings[key] else { return key.rawValue }
        return isChinese ? pair.zh : pair.en
    }

    /// The string for `key`, formatted with `args` (`%@` / `%d` in the
    /// table). Arguments are user content (script names, versions,
    /// counts) and are inserted unchanged.
    func format(_ key: OMTextKey, _ args: CVarArg...) -> String {
        String(format: text(key), locale: locale, arguments: args)
    }

    private func saveSelection() {
        AppGroup.sharedDefaults.set(selection, forKey: AppGroup.languageKey)
    }
}

/// The shared settings that must reach the Safari extension (v0.5.0).
///
/// Every setting reads and writes the App Group suite
/// (`AppGroup.sharedDefaults`, `UserDefaults(suiteName:)` falling back
/// to `.standard` when the suite is unavailable, so an unsigned build
/// never crashes and toggles still work app-locally). Keys are the
/// `OpenMonkey…` constants in `AppGroup` — the same names the native
/// settings bridge (`SafariWebExtensionHandler`) exposes to the web
/// extension, whose `openmonkey.settings.v1` store carries the same
/// keys without the `OpenMonkey` prefix (see the contract in
/// `SafariWebExtensionHandler.swift`).
///
/// Values left in standard defaults by a pre-v0.5.0 `@AppStorage`
/// toggle are migrated into the suite once, the first time the suite
/// has no value (same pattern as v0.4.0's `globalEnabled`).
///
/// `syncEnabled` is the odd one out: it is also app-side only in the
/// sense that the extension never reads it — it controls whether this
/// object mirrors the suite keys into `NSUbiquitousKeyValueStore`
/// (iCloud key-value storage, settings only, never scripts).
final class OMSharedSettings: ObservableObject {

    // MARK: - Published values (defaults are the contract defaults)

    @Published private(set) var globalEnabled: Bool = true
    @Published private(set) var darkEditor: Bool = true
    @Published private(set) var darkMode: String = "auto"
    @Published private(set) var darkModeEnabled: Bool = false
    @Published private(set) var adFilterEnabled: Bool = false
    @Published private(set) var customAdRules: [String] = []
    @Published private(set) var tagModeEnabled: Bool = false
    @Published private(set) var smartSearchEnabled: Bool = false
    @Published private(set) var smartSearchTrigger: String = "prefix"
    @Published private(set) var smartSearchEngines: [OMSearchEngine] = OMSearchEngine.defaults
    @Published private(set) var sniffEnabled: Bool = false
    @Published private(set) var showSniffButton: Bool = true
    @Published private(set) var longPressSniff: Bool = true
    @Published private(set) var resourceDetectionEnabled: Bool = true
    @Published private(set) var fileSort: String = "timeAsc"
    @Published private(set) var showPromptPopups: Bool = true
    @Published private(set) var syncEnabled: Bool = false
    @Published private(set) var appLockEnabled: Bool = false
    @Published private(set) var lastSyncDate: Date?

    private var cloudObserver: NSObjectProtocol?

    init() {
        refresh()
        lastSyncDate = UserDefaults.standard.object(
            forKey: Self.lastSyncDateKey) as? Date
        cloudObserver = NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default,
            queue: .main
        ) { [weak self] _ in
            guard let self = self, self.syncEnabled else { return }
            self.pullFromCloud()
        }
    }

    deinit {
        if let observer = cloudObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Reading

    /// Re-reads every suite value (called on appear, so toggles always
    /// reflect what the extension last wrote). When sync is on, the
    /// cloud copy is pulled first.
    func refresh() {
        if syncEnabled { pullFromCloud() }
        let defaults = AppGroup.sharedDefaults
        globalEnabled = readBool(defaults, key: AppGroup.globalEnabledKey, default: true)
        darkEditor = readBoolMigrated(defaults, key: AppGroup.darkEditorKey, default: true)
        darkMode = readString(defaults, key: AppGroup.darkModeKey,
                              allowed: ["auto", "light", "dark"], default: "auto")
        darkModeEnabled = readBool(defaults, key: AppGroup.darkModeEnabledKey, default: false)
        adFilterEnabled = readBool(defaults, key: AppGroup.adFilterEnabledKey, default: false)
        customAdRules = defaults.stringArray(forKey: AppGroup.customAdRulesKey) ?? []
        tagModeEnabled = readBool(defaults, key: AppGroup.tagModeEnabledKey, default: false)
        smartSearchEnabled = readBool(defaults, key: AppGroup.smartSearchEnabledKey, default: false)
        smartSearchTrigger = readString(defaults, key: AppGroup.smartSearchTriggerKey,
                                        allowed: ["prefix", "suffix"], default: "prefix")
        smartSearchEngines = readEngines(defaults)
        sniffEnabled = readBool(defaults, key: AppGroup.sniffEnabledKey, default: false)
        showSniffButton = readBool(defaults, key: AppGroup.showSniffButtonKey, default: true)
        longPressSniff = readBool(defaults, key: AppGroup.longPressSniffKey, default: true)
        resourceDetectionEnabled = readBool(
            defaults, key: AppGroup.resourceDetectionEnabledKey, default: true)
        fileSort = readString(defaults, key: AppGroup.fileSortKey,
                              allowed: ["timeAsc", "timeDesc", "name"], default: "timeAsc")
        showPromptPopups = readBool(defaults, key: AppGroup.showPromptPopupsKey, default: true)
        syncEnabled = readBool(defaults, key: AppGroup.syncEnabledKey, default: false)
        appLockEnabled = readBool(defaults, key: AppGroup.appLockEnabledKey, default: false)
    }

    private func readBool(_ defaults: UserDefaults, key: String, default value: Bool) -> Bool {
        guard defaults.object(forKey: key) != nil else { return value }
        return defaults.bool(forKey: key)
    }

    private func readString(
        _ defaults: UserDefaults, key: String, allowed: [String], default value: String
    ) -> String {
        let stored = defaults.string(forKey: key) ?? value
        return allowed.contains(stored) ? stored : value
    }

    /// Like `readBool`, but a value left in standard defaults by an old
    /// `@AppStorage` toggle is migrated into the suite once.
    private func readBoolMigrated(_ defaults: UserDefaults, key: String, default value: Bool) -> Bool {
        if defaults.object(forKey: key) != nil { return defaults.bool(forKey: key) }
        if let migrated = UserDefaults.standard.object(forKey: key) as? Bool {
            defaults.set(migrated, forKey: key)
            return migrated
        }
        return value
    }

    private func readEngines(_ defaults: UserDefaults) -> [OMSearchEngine] {
        guard let json = defaults.string(forKey: AppGroup.smartSearchEnginesKey),
              let data = json.data(using: .utf8),
              let engines = try? JSONDecoder().decode([OMSearchEngine].self, from: data),
              !engines.isEmpty else {
            return OMSearchEngine.defaults
        }
        return engines
    }

    // MARK: - Writing (each setter persists, publishes, and — when
    // sync is on — pushes the whole settings set to iCloud)

    private func writeBool(_ value: Bool, key: String) {
        AppGroup.sharedDefaults.set(value, forKey: key)
        pushToCloudIfEnabled()
    }

    private func writeString(_ value: String, key: String) {
        AppGroup.sharedDefaults.set(value, forKey: key)
        pushToCloudIfEnabled()
    }

    func setGlobalEnabled(_ value: Bool) {
        globalEnabled = value
        writeBool(value, key: AppGroup.globalEnabledKey)
    }

    func setDarkEditor(_ value: Bool) {
        darkEditor = value
        writeBool(value, key: AppGroup.darkEditorKey)
    }

    func setDarkMode(_ value: String) {
        guard ["auto", "light", "dark"].contains(value) else { return }
        darkMode = value
        writeString(value, key: AppGroup.darkModeKey)
    }

    func setDarkModeEnabled(_ value: Bool) {
        darkModeEnabled = value
        writeBool(value, key: AppGroup.darkModeEnabledKey)
    }

    func setAdFilterEnabled(_ value: Bool) {
        adFilterEnabled = value
        writeBool(value, key: AppGroup.adFilterEnabledKey)
    }

    func setCustomAdRules(_ value: [String]) {
        customAdRules = value
        AppGroup.sharedDefaults.set(value, forKey: AppGroup.customAdRulesKey)
        pushToCloudIfEnabled()
    }

    func setTagModeEnabled(_ value: Bool) {
        tagModeEnabled = value
        writeBool(value, key: AppGroup.tagModeEnabledKey)
    }

    func setSmartSearchEnabled(_ value: Bool) {
        smartSearchEnabled = value
        writeBool(value, key: AppGroup.smartSearchEnabledKey)
    }

    func setSmartSearchTrigger(_ value: String) {
        guard ["prefix", "suffix"].contains(value) else { return }
        smartSearchTrigger = value
        writeString(value, key: AppGroup.smartSearchTriggerKey)
    }

    func setSmartSearchEngines(_ value: [OMSearchEngine]) {
        smartSearchEngines = value.isEmpty ? OMSearchEngine.defaults : value
        let data = (try? JSONEncoder().encode(smartSearchEngines)) ?? Data()
        AppGroup.sharedDefaults.set(
            String(data: data, encoding: .utf8) ?? "", forKey: AppGroup.smartSearchEnginesKey)
        pushToCloudIfEnabled()
    }

    func setSniffEnabled(_ value: Bool) {
        sniffEnabled = value
        writeBool(value, key: AppGroup.sniffEnabledKey)
    }

    func setShowSniffButton(_ value: Bool) {
        showSniffButton = value
        writeBool(value, key: AppGroup.showSniffButtonKey)
    }

    func setLongPressSniff(_ value: Bool) {
        longPressSniff = value
        writeBool(value, key: AppGroup.longPressSniffKey)
    }

    func setResourceDetectionEnabled(_ value: Bool) {
        resourceDetectionEnabled = value
        writeBool(value, key: AppGroup.resourceDetectionEnabledKey)
    }

    func setFileSort(_ value: String) {
        guard ["timeAsc", "timeDesc", "name"].contains(value) else { return }
        fileSort = value
        writeString(value, key: AppGroup.fileSortKey)
    }

    func setShowPromptPopups(_ value: Bool) {
        showPromptPopups = value
        writeBool(value, key: AppGroup.showPromptPopupsKey)
    }

    func setSyncEnabled(_ value: Bool) {
        syncEnabled = value
        AppGroup.sharedDefaults.set(value, forKey: AppGroup.syncEnabledKey)
        if value { pushToCloudIfEnabled() }
    }

    func setAppLockEnabled(_ value: Bool) {
        appLockEnabled = value
        AppGroup.sharedDefaults.set(value, forKey: AppGroup.appLockEnabledKey)
    }

    // MARK: - Bindings

    private func boolBinding(
        get: @escaping () -> Bool, set: @escaping (Bool) -> Void
    ) -> Binding<Bool> {
        Binding(get: get, set: set)
    }

    private func stringBinding(
        get: @escaping () -> String, set: @escaping (String) -> Void
    ) -> Binding<String> {
        Binding(get: get, set: set)
    }

    var globalEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.globalEnabled }, set: { self.setGlobalEnabled($0) })
    }

    var darkEditorBinding: Binding<Bool> {
        boolBinding(get: { self.darkEditor }, set: { self.setDarkEditor($0) })
    }

    var darkModeEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.darkModeEnabled }, set: { self.setDarkModeEnabled($0) })
    }

    var darkModeBinding: Binding<String> {
        stringBinding(get: { self.darkMode }, set: { self.setDarkMode($0) })
    }

    var adFilterEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.adFilterEnabled }, set: { self.setAdFilterEnabled($0) })
    }

    var tagModeEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.tagModeEnabled }, set: { self.setTagModeEnabled($0) })
    }

    var smartSearchEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.smartSearchEnabled }, set: { self.setSmartSearchEnabled($0) })
    }

    var smartSearchTriggerBinding: Binding<String> {
        stringBinding(get: { self.smartSearchTrigger }, set: { self.setSmartSearchTrigger($0) })
    }

    var sniffEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.sniffEnabled }, set: { self.setSniffEnabled($0) })
    }

    var showSniffButtonBinding: Binding<Bool> {
        boolBinding(get: { self.showSniffButton }, set: { self.setShowSniffButton($0) })
    }

    var longPressSniffBinding: Binding<Bool> {
        boolBinding(get: { self.longPressSniff }, set: { self.setLongPressSniff($0) })
    }

    var resourceDetectionEnabledBinding: Binding<Bool> {
        boolBinding(
            get: { self.resourceDetectionEnabled },
            set: { self.setResourceDetectionEnabled($0) })
    }

    var fileSortBinding: Binding<String> {
        stringBinding(get: { self.fileSort }, set: { self.setFileSort($0) })
    }

    var showPromptPopupsBinding: Binding<Bool> {
        boolBinding(get: { self.showPromptPopups }, set: { self.setShowPromptPopups($0) })
    }

    var syncEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.syncEnabled }, set: { self.setSyncEnabled($0) })
    }

    var appLockEnabledBinding: Binding<Bool> {
        boolBinding(get: { self.appLockEnabled }, set: { self.setAppLockEnabled($0) })
    }

    /// The app's own appearance override, driven by the Home Dark Mode
    /// toggle plus the mode chosen in General Settings: `nil` (follow
    /// the system) when dark mode is off or set to Auto.
    var appColorScheme: ColorScheme? {
        guard darkModeEnabled else { return nil }
        switch darkMode {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }

    // MARK: - iCloud key-value sync (settings only, never scripts)

    private static let lastSyncDateKey = "OpenMonkeyLastSyncDate"

    private func pushToCloudIfEnabled() {
        guard syncEnabled else { return }
        pushToCloud()
    }

    /// Writes the current settings into `NSUbiquitousKeyValueStore`
    /// now and records the time. Returns `false` when the store
    /// refused the write (`synchronize()` failing means iCloud
    /// key-value storage is unavailable — not signed in, or iCloud
    /// Drive off — not a crash).
    @discardableResult
    func pushToCloud() -> Bool {
        let store = NSUbiquitousKeyValueStore.default
        let defaults = AppGroup.sharedDefaults
        store.set(globalEnabled, forKey: AppGroup.globalEnabledKey)
        store.set(darkEditor, forKey: AppGroup.darkEditorKey)
        store.set(darkMode, forKey: AppGroup.darkModeKey)
        store.set(darkModeEnabled, forKey: AppGroup.darkModeEnabledKey)
        store.set(adFilterEnabled, forKey: AppGroup.adFilterEnabledKey)
        store.set(customAdRules, forKey: AppGroup.customAdRulesKey)
        store.set(tagModeEnabled, forKey: AppGroup.tagModeEnabledKey)
        store.set(smartSearchEnabled, forKey: AppGroup.smartSearchEnabledKey)
        store.set(smartSearchTrigger, forKey: AppGroup.smartSearchTriggerKey)
        let enginesData = (try? JSONEncoder().encode(smartSearchEngines)) ?? Data()
        store.set(String(data: enginesData, encoding: .utf8) ?? "",
                  forKey: AppGroup.smartSearchEnginesKey)
        store.set(sniffEnabled, forKey: AppGroup.sniffEnabledKey)
        store.set(showSniffButton, forKey: AppGroup.showSniffButtonKey)
        store.set(longPressSniff, forKey: AppGroup.longPressSniffKey)
        store.set(resourceDetectionEnabled, forKey: AppGroup.resourceDetectionEnabledKey)
        store.set(fileSort, forKey: AppGroup.fileSortKey)
        store.set(showPromptPopups, forKey: AppGroup.showPromptPopupsKey)
        store.set(defaults.string(forKey: AppGroup.languageKey) ?? "system",
                  forKey: AppGroup.languageKey)
        let ok = store.synchronize()
        if ok {
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: Self.lastSyncDateKey)
        }
        return ok
    }

    /// Reads the cloud copy back into the suite and republishes.
    /// Keys absent from the cloud are left alone.
    func pullFromCloud() {
        let store = NSUbiquitousKeyValueStore.default
        let defaults = AppGroup.sharedDefaults
        func pullBool(_ key: String) {
            if store.object(forKey: key) != nil {
                defaults.set(store.bool(forKey: key), forKey: key)
            }
        }
        func pullString(_ key: String) {
            if let value = store.string(forKey: key) {
                defaults.set(value, forKey: key)
            }
        }
        pullBool(AppGroup.globalEnabledKey)
        pullBool(AppGroup.darkEditorKey)
        pullString(AppGroup.darkModeKey)
        pullBool(AppGroup.darkModeEnabledKey)
        pullBool(AppGroup.adFilterEnabledKey)
        if let rules = store.array(forKey: AppGroup.customAdRulesKey) as? [String] {
            defaults.set(rules, forKey: AppGroup.customAdRulesKey)
        }
        pullBool(AppGroup.tagModeEnabledKey)
        pullBool(AppGroup.smartSearchEnabledKey)
        pullString(AppGroup.smartSearchTriggerKey)
        pullString(AppGroup.smartSearchEnginesKey)
        pullBool(AppGroup.sniffEnabledKey)
        pullBool(AppGroup.showSniffButtonKey)
        pullBool(AppGroup.longPressSniffKey)
        pullBool(AppGroup.resourceDetectionEnabledKey)
        pullString(AppGroup.fileSortKey)
        pullBool(AppGroup.showPromptPopupsKey)
        pullString(AppGroup.languageKey)
        refreshWithoutCloud()
    }

    /// Re-reads the suite without pulling from the cloud (used at the
    /// end of `pullFromCloud` so the published values update).
    private func refreshWithoutCloud() {
        let defaults = AppGroup.sharedDefaults
        globalEnabled = readBool(defaults, key: AppGroup.globalEnabledKey, default: true)
        darkEditor = readBool(defaults, key: AppGroup.darkEditorKey, default: true)
        darkMode = readString(defaults, key: AppGroup.darkModeKey,
                              allowed: ["auto", "light", "dark"], default: "auto")
        darkModeEnabled = readBool(defaults, key: AppGroup.darkModeEnabledKey, default: false)
        adFilterEnabled = readBool(defaults, key: AppGroup.adFilterEnabledKey, default: false)
        customAdRules = defaults.stringArray(forKey: AppGroup.customAdRulesKey) ?? []
        tagModeEnabled = readBool(defaults, key: AppGroup.tagModeEnabledKey, default: false)
        smartSearchEnabled = readBool(defaults, key: AppGroup.smartSearchEnabledKey, default: false)
        smartSearchTrigger = readString(defaults, key: AppGroup.smartSearchTriggerKey,
                                        allowed: ["prefix", "suffix"], default: "prefix")
        smartSearchEngines = readEngines(defaults)
        sniffEnabled = readBool(defaults, key: AppGroup.sniffEnabledKey, default: false)
        showSniffButton = readBool(defaults, key: AppGroup.showSniffButtonKey, default: true)
        longPressSniff = readBool(defaults, key: AppGroup.longPressSniffKey, default: true)
        resourceDetectionEnabled = readBool(
            defaults, key: AppGroup.resourceDetectionEnabledKey, default: true)
        fileSort = readString(defaults, key: AppGroup.fileSortKey,
                              allowed: ["timeAsc", "timeDesc", "name"], default: "timeAsc")
        showPromptPopups = readBool(defaults, key: AppGroup.showPromptPopupsKey, default: true)
        appLockEnabled = readBool(defaults, key: AppGroup.appLockEnabledKey, default: false)
    }
}

/// The English/Chinese table. Descriptions are kept short on purpose
/// and must fit ONE line: the Home text column measures only ~150pt
/// on a real device (the Toggle renders wider than its 51pt nominal
/// width, and the icon + spacings take the rest), and the strings
/// must still fit at larger Dynamic Type sizes. So every Chinese
/// card description is at most 8 characters (v0.5.2 — Aaron's 19:11
/// shot showed 10-character descriptions truncating with "…"), and
/// English ones stay short too. Do not lengthen a description
/// without re-measuring the real column.
private enum OMTextTable {
    static let strings: [OMTextKey: (en: String, zh: String)] = [
        .tabHome: ("Home", "首页"),
        .tabScripts: ("Scripts", "脚本"),
        .navHome: ("Home", "首页"),
        .navScripts: ("Scripts", "脚本"),
        .navInstall: ("Install", "安装"),
        .navSettings: ("Settings", "设置"),
        .cardScriptsTitle: ("Userscripts", "用户脚本"),
        .cardScriptsDesc: ("Manage userscripts", "管理用户脚本"),
        .cardEditorTitle: ("Code Editor", "代码编辑器"),
        .cardEditorDesc: ("Edit script source", "编辑脚本源码"),
        .cardInstallTitle: ("Install", "安装"),
        .cardInstallDesc: ("URL, file, clipboard", "多种方式安装"),
        .cardSettingsTitle: ("Settings", "设置"),
        .cardSettingsDesc: ("Injection, updates & storage", "注入、更新与存储"),
        .viewHelp: ("View help", "查看帮助"),
        .appGroupBanner: ("Scripts are stored in this app only. Set up App Groups signing to share them with Safari.", "脚本仅保存在本 App 内。配置 App Groups 签名后可与 Safari 共享。"),
        .helpScriptsBody: ("Scripts are userscripts (.user.js) and userstyles (.user.css) that run in Safari. Turn the switch off to pause injection on every site; per-script switches live in the Scripts tab. Tap a script to see its details, edit it, or check for updates.", "脚本是指在 Safari 中运行的用户脚本（.user.js）和用户样式（.user.css）。关闭开关可在所有网站暂停注入；每个脚本的开关在「脚本」页。点按脚本可查看详情、编辑或检查更新。"),
        .helpEditorBody: ("Write a new script or edit an installed one. The editor checks the // ==UserScript== header as you type and only saves when it parses. The switch on this card turns the dark editor theme on and off.", "编写新脚本或编辑已安装的脚本。编辑器会在输入时检查 // ==UserScript== 头部，解析通过后才能保存。本卡片上的开关用于切换深色编辑器主题。"),
        .helpInstallBody: ("Install a script from a .user.js URL, from a file on this device, or by pasting its source from the clipboard. Before installing, OpenMonkey shows the script's source and the permissions it asks for.", "通过 .user.js 链接、本设备上的文件或粘贴剪贴板中的源代码来安装脚本。安装前，OpenMonkey 会显示脚本源代码及其请求的权限。"),
        .helpSettingsBody: ("Global injection, update checks, storage, how to enable the extension in Safari Settings, and links to the project and to Greasy Fork.", "全局注入、更新检查、存储、在 Safari 设置中启用扩展的方法，以及项目和 Greasy Fork 的链接。"),
        .done: ("Done", "完成"),
        .close: ("Close", "关闭"),
        .ok: ("OK", "好"),
        .cancel: ("Cancel", "取消"),
        .delete: ("Delete", "删除"),
        .save: ("Save", "保存"),
        .discard: ("Discard", "放弃"),
        .installFromURL: ("Install from URL", "通过链接安装"),
        .fetchAndInstall: ("Fetch and Install", "获取并安装"),
        .installURLFootnote: ("The script's source and requested permissions are shown before anything is saved — the install happens after you confirm in the detail view.", "保存前会先显示脚本源代码和请求的权限，确认后才安装。"),
        .installOtherWays: ("Other ways to install", "其他安装方式"),
        .importFromFile: ("Import from File", "从文件导入"),
        .pasteFromClipboard: ("Paste from Clipboard", "从剪贴板粘贴"),
        .writeNewScript: ("Write a New Script", "编写新脚本"),
        .pastedScriptName: ("Pasted script", "粘贴的脚本"),
        .installStatusInvalidURL: ("That URL does not look valid.", "该链接格式不正确。"),
        .installStatusDownloading: ("Downloading…", "正在下载…"),
        .installStatusDownloadFailed: ("Download failed: %@", "下载失败：%@"),
        .installStatusDownloadedNothing: ("Downloaded nothing — the URL did not return text.", "未下载到内容——该链接没有返回文本。"),
        .installStatusClipboardEmpty: ("The clipboard is empty.", "剪贴板为空。"),
        .installStatusFileUnreadable: ("Could not read that file as text.", "无法将该文件作为文本读取。"),
        .installStatusNotUserscript: ("That is not a valid userscript: no // ==UserScript== block was found.", "这不是有效的用户脚本：未找到 // ==UserScript== 代码块。"),
        .installStatusFileOpenFailed: ("Could not open that file: %@", "无法打开该文件：%@"),
        .installStatusInstalled: ("Installed “%@” (%@). Find it in the Scripts tab.", "已安装“%@”（%@），可在「脚本」页查看。"),
        .installStatusFailed: ("Could not install: %@", "安装失败：%@"),
        .searchScripts: ("Search scripts…", "搜索脚本…"),
        .segmentActivated: ("Activated", "已启用"),
        .segmentStopped: ("Stopped", "已停用"),
        .segmentFeatured: ("Featured", "精选"),
        .checkForUpdates: ("Check for updates", "检查更新"),
        .newScript: ("New script", "新建脚本"),
        .installFromAnywhere: ("Install from URL, file, or clipboard", "通过链接、文件或剪贴板安装"),
        .updateCheckTitle: ("Update check", "检查更新"),
        .library: ("Library", "脚本库"),
        .enabledCount: ("%d/%d enabled", "已启用 %d/%d"),
        .enableAllShown: ("Enable all shown", "全部启用"),
        .disableAllShown: ("Disable all shown", "全部停用"),
        .groupUserscripts: ("Userscripts", "用户脚本"),
        .groupUserstyles: ("Userstyles", "用户样式"),
        .emptyActivated: ("No activated scripts.", "没有已启用的脚本。"),
        .emptyStopped: ("No stopped scripts.", "没有已停用的脚本。"),
        .emptyFeatured: ("No scripts declare an update URL.", "没有脚本声明更新链接。"),
        .updateNoneDeclare: ("None of the shown scripts declare an update URL.", "当前显示的脚本均未声明更新链接。"),
        .updateAvailable: ("“%@” has an update: %@.", "“%@”有更新：%@。"),
        .updateAllUpToDate: ("All checked scripts are up to date.", "所有已检查的脚本均为最新。"),
        .statusActivated: ("Activated", "已启用"),
        .statusStopped: ("Stopped", "已停用"),
        .statusUpdated: ("Updated %@", "更新于 %@"),
        .userstyle: ("Userstyle", "用户样式"),
        .permissions: ("Permissions", "权限"),
        .runsOn: ("Runs on", "运行于"),
        .update: ("Update", "更新"),
        .noUpdateURL: ("No update URL", "无更新链接"),
        .checkForUpdate: ("Check for update", "检查更新"),
        .updateTo: ("Update to %@", "更新至 %@"),
        .editScript: ("Edit Script", "编辑脚本"),
        .exportUserscript: ("Export .user.js", "导出 .user.js"),
        .copySource: ("Copy Source", "复制源代码"),
        .copied: ("Copied!", "已复制！"),
        .deleteScript: ("Delete Script", "删除脚本"),
        .deleteScriptTitle: ("Delete Script?", "删除脚本？"),
        .deleteScriptMessage: ("“%@” will be removed from Safari as well as from the library.", "“%@”将同时从 Safari 和脚本库中删除。"),
        .author: ("Author", "作者"),
        .file: ("File", "文件"),
        .homepage: ("Homepage", "主页"),
        .runAt: ("Run at", "运行时机"),
        .updateStatusNoURL: ("No update URL.", "无更新链接。"),
        .updateStatusChecking: ("Checking…", "正在检查…"),
        .updateStatusCheckFailed: ("Check failed: %@", "检查失败：%@"),
        .updateStatusInvalidRemote: ("The update URL did not return a valid script.", "更新链接没有返回有效的脚本。"),
        .updateStatusAvailable: ("Update available: %@ (installed: %@).", "有可用更新：%@（已安装：%@）。"),
        .updateStatusUpToDate: ("Up to date (%@).", "已是最新（%@）。"),
        .updateStatusUpdated: ("Updated to %@.", "已更新至 %@。"),
        .updateStatusSaveFailed: ("Could not save the update: %@", "无法保存更新：%@"),
        .editorNewScript: ("New Script", "新建脚本"),
        .discardChanges: ("Discard Changes", "放弃更改"),
        .discardChangesTitle: ("Discard changes?", "放弃更改？"),
        .keepEditing: ("Keep Editing", "继续编辑"),
        .discardChangesMessage: ("Your unsaved edits to this script will be lost.", "未保存的编辑将会丢失。"),
        .couldNotSave: ("Could Not Save", "无法保存"),
        .unsavedChanges: ("Unsaved changes", "有未保存的更改"),
        .allChangesSaved: ("All changes saved", "已保存全部更改"),
        .charactersCount: ("%d characters", "%d 个字符"),
        .sectionScripts: ("Scripts", "脚本"),
        .sectionEditor: ("Editor", "编辑器"),
        .sectionStorage: ("Storage", "存储"),
        .sectionEnableInSafari: ("Enable in Safari", "在 Safari 中启用"),
        .sectionLinks: ("Links", "链接"),
        .sectionAbout: ("About", "关于"),
        .sectionLanguage: ("Language", "语言"),
        .enableAllScripts: ("Enable all scripts", "启用全部脚本"),
        .checkOnLaunch: ("Check for updates on launch", "启动时检查更新"),
        .updateInterval: ("Update check interval", "更新检查间隔"),
        .intervalNever: ("Never", "从不"),
        .intervalDaily: ("Daily", "每天"),
        .intervalWeekly: ("Weekly", "每周"),
        .intervalMonthly: ("Monthly", "每月"),
        .intervalEveryDays: ("Every %d days", "每 %d 天"),
        .darkEditor: ("Dark editor", "深色编辑器"),
        .editorFootnote: ("The code editor uses a dark theme with line numbers and syntax highlighting. Turn it off for a light editor.", "代码编辑器使用深色主题，带行号和语法高亮。关闭后使用浅色编辑器。"),
        .scriptsFolder: ("Scripts folder", "脚本文件夹"),
        .sharedWithSafari: ("Shared with Safari", "与 Safari 共享"),
        .appOnly: ("App only", "仅本 App"),
        .location: ("Location", "位置"),
        .installedScripts: ("Installed scripts", "已安装脚本"),
        .appGroupUnavailable: ("The App Group container is not available. Scripts saved here will not appear in Safari until the project is signed with the App Groups capability (group.com.openmonkey.safari).", "App Group 容器不可用。在项目使用 App Groups 功能（group.com.openmonkey.safari）签名之前，此处保存的脚本不会出现在 Safari 中。"),
        .enableStepsIntro: ("After installing the app, enable OpenMonkey in Safari:", "安装 App 后，在 Safari 中启用 OpenMonkey："),
        .enableStep1: ("Open the Settings app, then Safari.", "打开「设置」App，然后进入 Safari。"),
        .enableStep2: ("Tap Extensions.", "点按「扩展」。"),
        .enableStep3: ("Turn on OpenMonkey.", "打开 OpenMonkey。"),
        .enableStep4: ("Choose the websites it may access, or “All Websites”.", "选择它可以访问的网站，或选择「所有网站」。"),
        .enableMacOS: ("On macOS: Safari → Settings → Extensions, then tick OpenMonkey.", "在 macOS 上：Safari → 设置 → 扩展，然后勾选 OpenMonkey。"),
        .enableMatchNote: ("Scripts only run on pages whose URLs match their @match / @include rules, and only while the extension is enabled here.", "脚本仅在网址符合其 @match / @include 规则的页面上运行，且仅在扩展已启用的情况下运行。"),
        .linkGitHub: ("OpenMonkey on GitHub", "GitHub 上的 OpenMonkey"),
        .linkGreasyFork: ("Greasy Fork — find userscripts", "Greasy Fork — 查找用户脚本"),
        .linksFootnote: ("Scripts from Greasy Fork and other sources are installed by opening their .user.js file in Safari and choosing OpenMonkey, or by pasting the source into the Editor tab.", "来自 Greasy Fork 及其他来源的脚本，可在 Safari 中打开其 .user.js 文件并选择 OpenMonkey 来安装，或将源代码粘贴到编辑器中。"),
        .version: ("Version", "版本"),
        .versionValue: ("0.5.3 (Developer Preview)", "0.5.3（开发者预览版）"),
        .aboutText: ("OpenMonkey is a free, open-source userscript manager for Safari. It is not on the App Store; install it from source with Xcode.", "OpenMonkey 是一款免费开源的 Safari 用户脚本管理器，尚未上架 App Store；请使用 Xcode 从源码安装。"),
        .licenseText: ("Licensed under the Mozilla Public License 2.0 (MPL-2.0).", "基于 Mozilla 公共许可证 2.0（MPL-2.0）授权。"),
        .language: ("Language", "语言"),
        .languageSystem: ("Follow System", "跟随系统"),
        .languageChinese: ("Chinese", "中文"),
        .languageEnglish: ("English", "English"),
        .tabMy: ("My", "我的"),
        .navMy: ("My", "我的"),
        .cardResourcesTitle: ("Resources", "资源管理"),
        .cardResourcesDesc: ("Save page media", "查看保存媒体"),
        .cardAdFilterTitle: ("Ad Filter", "广告过滤"),
        .cardAdFilterDesc: ("Custom filter rules", "自定义过滤规则"),
        .cardTagModeTitle: ("Tag Mode", "标记模式"),
        .cardTagModeDesc: ("Tap to tag page ads", "标记去除网页广告"),
        .cardSmartSearchTitle: ("Smart Search", "智能搜索"),
        .cardSmartSearchDesc: ("Trigger word search", "触发词快速切换"),
        .cardDarkModeTitle: ("Dark Mode", "暗黑模式"),
        .cardDarkModeDesc: ("Dark web pages", "网页暗黑护眼"),
        .cardSniffTitle: ("Sniff Mode", "嗅探模式"),
        .cardSniffDesc: ("Sniff page media", "嗅探网页音视频"),
        .helpResourcesBody: ("Pages you visit in Safari report the video, audio and images they load. Open this card to see the detected media and save a file to this device or copy its link. The switch on this card turns media detection on and off in the extension.", "在 Safari 中浏览的网页会报告其加载的视频、音频和图片。点按本卡片可查看检测到的媒体，保存到本机或复制链接。本卡片上的开关用于在扩展中开启或关闭媒体检测。"),
        .helpAdFilterBody: ("When Ad Filter is on, the extension hides page elements that match your custom CSS selectors. Tap this card to add, view or delete rules. A rule is a CSS selector such as .ad-banner.", "开启广告过滤后，扩展会隐藏与自定义 CSS 选择器匹配的页面元素。点按本卡片可添加、查看或删除规则。规则是一条 CSS 选择器，例如 .ad-banner。"),
        .helpTagModeBody: ("When Tag Mode is on, you can tap an element on a web page to mark it, and the extension hides matching elements on later visits. Turn it off here to stop marking.", "开启标记模式后，可以点按网页上的元素进行标记，扩展会在以后访问时隐藏相同元素。在此关闭即可停止标记。"),
        .helpSmartSearchBody: ("Smart Search lets you switch search engines with a trigger word: type the trigger word followed by your query, for example bd weather. Tap this card to manage engines and their trigger words, and choose whether the trigger goes before or after the query.", "智能搜索支持用触发词切换搜索引擎：输入触发词加搜索词即可，例如 bd 天气。点按本卡片可管理搜索引擎及其触发词，并选择触发词在前还是在后。"),
        .helpDarkModeBody: ("Dark Mode dims web pages for comfortable reading at night. The switch turns it on and off; the exact mode — Auto, Light or Dark — is chosen in General Settings.", "暗黑模式可调暗网页，夜间阅读更护眼。本卡片上的开关用于开启或关闭；具体模式（自动、浅色、深色）在通用设置中选择。"),
        .helpSniffBody: ("When Sniff Mode is on, the extension watches pages for video and audio and shows a floating button you can tap to see what was found. The button and long-press behaviour are set in Task Settings.", "开启嗅探模式后，扩展会监听网页中的视频与音频，并显示一个悬浮按钮，点按即可查看发现的媒体。按钮与长按行为在任务设置中配置。"),
        .sectionBasic: ("Basic Settings", "基础设置"),
        .sectionSupport: ("Support & Help", "支持与帮助"),
        .myGeneral: ("General Settings", "通用设置"),
        .myTasks: ("Task Settings", "任务设置"),
        .mySync: ("Settings Sync", "同步"),
        .myCleanup: ("Clear Data", "清理数据"),
        .myFeedback: ("Feedback", "意见反馈"),
        .myRate: ("Rate & Encourage", "好评鼓励"),
        .myShare: ("Share with Friends", "分享给朋友"),
        .myPrivacy: ("Privacy Policy", "隐私协议"),
        .myAbout: ("About Us", "关于我们"),
        .versionFormat: ("Version %@", "版本 %@"),
        .darkModeRow: ("Dark Mode", "暗黑模式"),
        .darkAuto: ("Auto", "自动"),
        .darkLight: ("Light", "浅色"),
        .darkDark: ("Dark", "深色"),
        .triggerRow: ("Smart search trigger word", "智能搜索触发词"),
        .triggerPrefix: ("Prefix", "前置"),
        .triggerSuffix: ("Suffix", "后置"),
        .appLockRow: ("App Lock", "应用锁"),
        .appLockNote: ("Unlock with Face ID, Touch ID or your device passcode the next time the app opens.", "下次打开 App 时，需用面容 ID、触控 ID 或设备密码解锁。"),
        .generalCodeEditor: ("Code Editor", "代码编辑器"),
        .fileSortRow: ("File Sort", "文件排序"),
        .sortTimeAsc: ("Oldest first", "时间升序"),
        .sortTimeDesc: ("Newest first", "时间降序"),
        .sortName: ("Name", "名称"),
        .showPromptsRow: ("Show confirmation popups", "显示提示弹窗"),
        .showSniffButtonRow: ("Show sniff button", "显示嗅探按钮"),
        .longPressSniffRow: ("Long-press to sniff", "开启长按嗅探"),
        .enableSyncRow: ("Enable Sync", "启用同步"),
        .syncDesc: ("Syncs settings only — never scripts. When on, settings sync across your devices through iCloud; when off, they stay on this device.", "仅同步设置，不含脚本。开启后通过 iCloud 在设备间同步设置；关闭则仅保存在本机。"),
        .syncNowRow: ("Sync Now", "立即同步"),
        .lastSyncNever: ("Never synced", "从未同步"),
        .lastSyncFormat: ("Last synced: %@", "上次同步：%@"),
        .syncDone: ("Sync complete.", "同步完成。"),
        .syncUnavailable: ("iCloud sync is unavailable (not signed in to iCloud, or iCloud Drive is off).", "iCloud 同步不可用（未登录 iCloud，或未开启 iCloud 云盘）。"),
        .cleanTempRow: ("Temporary Data", "临时数据"),
        .cleanButton: ("Clear Data", "清理数据"),
        .cleanDoneFormat: ("Freed %@.", "已清理 %@。"),
        .cleanNothing: ("Nothing to clear.", "没有可清理的数据。"),
        .cleanFootnote: ("Only temporary caches are cleared. Installed scripts are never deleted.", "仅清理临时缓存，不会删除已安装的脚本。"),
        .storageSection: ("Storage Used", "空间占用"),
        .storageSizeRow: ("Storage used", "空间占用大小"),
        .adRulesTitle: ("Custom Ad Rules", "自定义广告过滤规则"),
        .adRulesEmpty: ("No custom rules yet.", "还没有自定义规则。"),
        .adRulesPlaceholder: ("CSS selector, e.g. .ad-banner", "输入 CSS 选择器，如 .ad-banner"),
        .adRulesAdd: ("Add", "添加"),
        .adRulesFootnote: ("Rules sync to the extension and hide matching elements on pages.", "规则会同步到扩展，在匹配的页面上隐藏相应元素。"),
        .adRulesInvalid: ("Enter a valid selector.", "请输入有效的选择器。"),
        .smartSearchTitle: ("Smart Search", "智能搜索"),
        .smartSearchEngines: ("Search engines", "搜索引擎"),
        .engineTrigger: ("Trigger", "触发词"),
        .engineURL: ("URL", "链接"),
        .engineName: ("Name", "名称"),
        .addEngine: ("Add Engine", "添加搜索引擎"),
        .resetEngines: ("Restore Defaults", "恢复默认"),
        .smartSearchFootnote: ("Type “trigger word + query” to switch engines, e.g. bd weather. The trigger goes before or after the query, as set in General Settings.", "输入“触发词 + 搜索词”即可切换搜索引擎，如 bd 天气。触发词在前还是在后，在通用设置中选择。"),
        .engineInvalid: ("Fill in a name, a trigger word and a URL containing {q}.", "请填写名称、触发词和包含 {q} 的链接。"),
        .resourcesEmpty: ("No media detected yet. Turn on Sniff Mode, then browse in Safari to discover video & audio.", "还没有检测到媒体。打开嗅探模式后，在 Safari 中浏览网页即可发现视频与音频。"),
        .resourcesDetectionOff: ("Media detection is off. Turn on Resources on the Home tab to start detecting.", "媒体检测已关闭。在首页打开资源管理即可开始检测。"),
        .resourcesSave: ("Save", "保存"),
        .resourcesCopyLink: ("Copy Link", "复制链接"),
        .resourcesCopiedLink: ("Link copied.", "已复制链接。"),
        .resourcesSavedFormat: ("Saved “%@”.", "已保存“%@”。"),
        .resourcesSaveFailed: ("Could not save: %@", "保存失败：%@"),
        .resourcesTypeVideo: ("Video", "视频"),
        .resourcesTypeAudio: ("Audio", "音频"),
        .resourcesTypeImage: ("Image", "图片"),
        .resourcesTypeOther: ("Other", "其他"),
        .resourcesFrom: ("From", "来自"),
        .privacyTitle: ("Privacy Policy", "隐私协议"),
        .privacyBody: ("OpenMonkey keeps all of your data on this device: your scripts, settings and custom rules never leave the device, except for settings sync when you turn it on — those settings are stored in your own iCloud account, and only you can read them. OpenMonkey has no account, no analytics, no tracking and no ads. Scripts run only on the pages you install them for, and only while the extension is enabled in Safari. If you choose to share a script file yourself, that file goes only where you send it.", "OpenMonkey 的所有数据都保存在本机：脚本、设置和自定义规则不会离开本设备；开启同步后，仅设置会保存在您自己的 iCloud 帐户中，只有您可以读取。OpenMonkey 没有帐户、没有统计、没有追踪、没有广告。脚本仅在您安装它的页面上运行，且仅在 Safari 中启用扩展时运行。如果您自行分享脚本文件，该文件只会发送到您指定的地方。"),
        .aboutTitle: ("About Us", "关于我们"),
        .aboutBody: ("OpenMonkey is a free, open-source userscript manager for Safari. It is not on the App Store; install it from source with Xcode.", "OpenMonkey 是一款免费开源的 Safari 用户脚本管理器，尚未上架 App Store；请使用 Xcode 从源码安装。"),
        .shareMessage: ("OpenMonkey for Safari — a free, open-source userscript manager: ", "OpenMonkey for Safari — 免费开源的用户脚本管理器："),
        .lockTitle: ("Locked", "已锁定"),
        .lockBody: ("Authenticate to open OpenMonkey.", "请验证以打开 OpenMonkey。"),
        .lockButton: ("Unlock", "验证"),
        .lockFailed: ("Authentication failed. Please try again.", "验证失败，请重试。"),
        .openInSafari: ("Open in Safari", "在 Safari 中打开"),
    ]
}

/// Deterministic avatar colour from a script name (same hash in
/// every view, so the colour matches across screens).
func avatarHue(for name: String) -> Double {
    var hue = 0
    for scalar in name.unicodeScalars {
        hue = (hue * 31 + Int(scalar.value)) % 360
    }
    return Double(hue) / 360.0
}

/// A script's rounded-square icon: first letter on a deterministic
/// colour, 40pt by default (the Stay row size).
struct ScriptIconView: View {
    var name: String
    var size: CGFloat = 40

    var body: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.system(size: size * 0.45, weight: .bold))
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(Color(hue: avatarHue(for: name), saturation: 0.65, brightness: 0.75))
            .clipShape(RoundedRectangle(cornerRadius: size * 0.25))
    }
}

/// A feature card's 44pt circle icon (the Addons Home size).
struct FeatureIconView: View {
    var systemImage: String
    var color: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 20, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 44, height: 44)
            .background(color)
            .clipShape(Circle())
    }
}

/// The bottom status line of a script row:
/// "● Activated | ⓥ 1.2.3 | Updated 2026-02-10".
struct ScriptStatusLine: View {
    @EnvironmentObject private var lang: OMLanguageManager

    var isEnabled: Bool
    var version: String
    var updated: Date?

    private var dateText: String {
        guard let updated = updated else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: updated)
    }

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(isEnabled ? OMDesign.switchGreen : OMDesign.stoppedGrey)
                .frame(width: 7, height: 7)
            Text(isEnabled ? lang.text(.statusActivated) : lang.text(.statusStopped))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(isEnabled ? .green : .secondary)
            Text("|")
                .font(.caption)
                .foregroundColor(.secondary)
            if !version.isEmpty {
                Text("ⓥ \(version)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if !dateText.isEmpty {
                Text(lang.format(.statusUpdated, dateText))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

/// Compare two dotted version strings ("1.2.3" vs "1.2.10"):
/// `true` when `remote` is newer than `local`. Non-numeric parts
/// compare as strings, so "1.0-beta" sorts below "1.0".
func isNewerVersion(_ remote: String, than local: String) -> Bool {
    let remoteParts = remote.split(separator: ".").map(String.init)
    let localParts = local.split(separator: ".").map(String.init)
    for index in 0..<max(remoteParts.count, localParts.count) {
        let remotePart = index < remoteParts.count ? remoteParts[index] : "0"
        let localPart = index < localParts.count ? localParts[index] : "0"
        if let remoteNumber = Int(remotePart), let localNumber = Int(localPart) {
            if remoteNumber != localNumber { return remoteNumber > localNumber }
        } else if remotePart != localPart {
            return remotePart > localPart
        }
    }
    return false
}

/// The `@updateURL` of a script's metadata, or the `@downloadURL`
/// as a fallback. `@updateURL` is not a named parser field; it is
/// read back from the parser's `other` bucket, where unknown keys
/// are preserved.
func updateURL(of metadata: UserscriptMetadata?) -> String? {
    guard let metadata = metadata else { return nil }
    let keys = metadata.other.filter { $0.key.lowercased() == "updateurl" }
    if let value = keys.first?.value, !value.isEmpty { return value }
    let downloads = metadata.other.filter { $0.key.lowercased() == "downloadurl" }
    if let value = downloads.first?.value, !value.isEmpty { return value }
    return nil
}

/// The file modification date of an installed script, for the
/// "Updated date" in the list. Returns nil when the file is gone.
func fileUpdatedDate(fileName: String, in directory: URL) -> Date? {
    let url = directory.appendingPathComponent(fileName)
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else {
        return nil
    }
    return attributes[.modificationDate] as? Date
}

// MARK: - v0.5.0 shared models and helpers

/// One smart-search engine: a display name, a trigger word, and a
/// search URL template where `{q}` is the URL-encoded query. Stored
/// as JSON in the App Group suite key
/// `OpenMonkeySmartSearchEngines`; the web side carries the same
/// objects in `openmonkey.settings.v1` under `smartSearchEngines`.
struct OMSearchEngine: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var trigger: String
    var url: String

    static var defaults: [OMSearchEngine] {
        [
            OMSearchEngine(
                id: "baidu", name: "Baidu", trigger: "bd",
                url: "https://www.baidu.com/s?wd={q}"),
            OMSearchEngine(
                id: "google", name: "Google", trigger: "g",
                url: "https://www.google.com/search?q={q}"),
            OMSearchEngine(
                id: "bing", name: "Bing", trigger: "bing",
                url: "https://www.bing.com/search?q={q}"),
        ]
    }
}

/// One media item detected on a web page by the extension.
///
/// The web side reports detections to the native host (message type
/// `reportResources`, see `SafariWebExtensionHandler`), which stores
/// the JSON array as a string under the App Group suite key
/// `openmonkey.resources.v1` — the exact key the host app reads here.
/// The app never invents resources: when the key is absent or empty
/// the Resources page shows an honest empty state.
struct OMDetectedResource: Codable, Identifiable {
    var id: String { url }
    var url: String
    var title: String?
    var type: String
    var pageURL: String?
    var detectedAt: Date?

    enum CodingKeys: String, CodingKey {
        case url
        case title
        case type
        case pageURL
        case detectedAt
    }
}

enum OMResourceStore {

    /// Reads the detected-media list written by the extension.
    /// Returns `[]` when nothing was ever reported. The handler
    /// stores `detectedAt` as an ISO-8601 string, so the decoder is
    /// configured for that format.
    static func load() -> [OMDetectedResource] {
        let defaults = AppGroup.sharedDefaults
        guard let json = defaults.string(forKey: AppGroup.resourcesKey),
              let data = json.data(using: .utf8) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let resources = try? decoder.decode(
            [OMDetectedResource].self, from: data) else {
            return []
        }
        return resources
    }
}

/// App Lock (v0.5.0): when `OMSharedSettings.appLockEnabled` is on,
/// the app shows a lock screen on launch and whenever it returns to
/// the foreground, until the user authenticates with Face ID, Touch
/// ID, or the device passcode (`.deviceOwnerAuthentication`, which
/// falls back to the passcode automatically). Nothing is stored: the
/// toggle itself is the only state, in the App Group suite key
/// `OpenMonkeyAppLockEnabled`. Requires the
/// `NSFaceIDUsageDescription` Info.plist key (set in the project as
/// `INFOPLIST_KEY_NSFaceIDUsageDescription` on the app targets).
final class OMAppLock: ObservableObject {

    @Published var locked = false

    /// Re-evaluates the lock state: locked when the setting is on.
    /// Called on launch and on foregrounding. Never unlocks on its
    /// own — only a successful `authenticate` does that.
    func refresh(settings: OMSharedSettings) {
        if settings.appLockEnabled { locked = true }
    }

    /// Prompts for Face ID / Touch ID / passcode. Calls `completion`
    /// on the main thread; `false` also covers "no biometry enrolled"
    /// (the passcode fallback is offered by the system sheet itself,
    /// and `canEvaluatePolicy` failing means even that is unavailable).
    func authenticate(completion: @escaping (Bool) -> Void) {
        #if canImport(LocalAuthentication)
        let context = LAContext()
        var error: NSError?
        let reason = AppGroup.localized(
            en: "Unlock OpenMonkey.",
            zh: "解锁 OpenMonkey。")
        guard context.canEvaluatePolicy(
            .deviceOwnerAuthentication, error: &error) else {
            completion(false)
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) {
            [weak self] success, _ in
            DispatchQueue.main.async {
                if success { self?.locked = false }
                completion(success)
            }
        }
        #else
        completion(false)
        #endif
    }
}

/// Real storage measurement and temporary-data cleanup (v0.5.0).
///
/// Only two categories are measurable and deletable from the host
/// app, and only those are offered in the UI:
/// * temporary data — the app's `tmp/` directory plus `Caches/`;
/// * installed scripts — the shared `Scripts/` directory, measured
///   for the "Storage used" row but never deleted by cleanup.
///
/// Deliberately NOT offered (no real backing in the app): imported
/// files (the app reads imports directly and never stages them),
/// web data (the extension's web data lives in Safari's profile, not
/// in any container the host app can reach), per-script GM storage
/// (it lives in the extension's `chrome.storage.local`, unreachable
/// from the app), and cached images (script icons are generated
/// on the fly; no image cache exists on disk).
enum OMStorage {

    /// The recursive size of a directory, in bytes (0 when missing).
    static func directorySize(_ url: URL) -> Int64 {
        let manager = FileManager.default
        guard let enumerator = manager.enumerator(
            at: url, includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]) else {
            return 0
        }
        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                total += Int64(size)
            }
        }
        return total
    }

    /// Scripts + temporary data + caches: the number shown as
    /// "Storage used". The scripts directory is the store's current
    /// directory (shared container when available, otherwise the
    /// app-local fallback).
    static func usedBytes(scriptsDirectory: URL) -> Int64 {
        let manager = FileManager.default
        let caches = manager.urls(for: .cachesDirectory, in: .userDomainMask).first
        var total = directorySize(scriptsDirectory)
        total += directorySize(manager.temporaryDirectory)
        if let caches = caches { total += directorySize(caches) }
        return total
    }

    /// The bytes currently held as temporary data (tmp + caches).
    static func temporaryBytes() -> Int64 {
        let manager = FileManager.default
        let caches = manager.urls(for: .cachesDirectory, in: .userDomainMask).first
        var total = directorySize(manager.temporaryDirectory)
        if let caches = caches { total += directorySize(caches) }
        return total
    }

    /// Deletes the contents of `tmp/` and `Caches/` and returns the
    /// bytes freed. Script files are never touched.
    static func clearTemporaryData() -> Int64 {
        let manager = FileManager.default
        let freed = temporaryBytes()
        let directories = [manager.temporaryDirectory]
            + [manager.urls(for: .cachesDirectory, in: .userDomainMask).first].compactMap { $0 }
        for directory in directories {
            guard let contents = try? manager.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: nil) else {
                continue
            }
            for item in contents {
                try? manager.removeItem(at: item)
            }
        }
        return freed
    }

    /// Human-readable byte count in the current locale ("256 bytes",
    /// "1.2 MB", ...). Used for the storage row and the cleanup
    /// result; never a hardcoded number.
    static func formatted(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}

// MARK: - v0.5.0 shared chrome (Home, 我的, and every sub-page)

/// The circle back button from the reference sub-pages: a 36pt
/// circle with a chevron, top-left, with the title centred.
struct OMCircleBackButton: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button { dismiss() } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.primary)
                .frame(width: 36, height: 36)
                .background(OMDesign.capsuleBackground)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

/// A sub-page's navigation chrome: centred inline title plus the
/// circle back button, exactly like the reference shots. Applied to
/// every pushed page (General / Task / Sync / Cleanup / Privacy /
/// About / Ad Rules / Smart Search / Resources / Library). The
/// floating-pill clearance needs no work from the caller: the pill
/// is the bottom child of a `VStack` in `OpenMonkeyApp`, so every
/// scroll view's frame ends above it (v0.5.1 — the old fixed 116pt
/// bottom padding is gone and must not come back).
struct OMSubPageModifier: ViewModifier {
    var title: String

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    OMCircleBackButton()
                }
            }
    }
}

extension View {
    /// Centred title + circle back button, like the reference
    /// sub-pages.
    func omSubPage(title: String) -> some View {
        modifier(OMSubPageModifier(title: title))
    }
}

/// A section header like the reference 我的 tab: small grey text,
/// left-aligned, above a grouped card.
struct OMSectionHeader: View {
    var title: String

    var body: some View {
        Text(title)
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }
}

/// A grouped dark card holding hairline-separated rows, like the
/// reference sub-pages. Corner radius 20pt; rows are separated by
/// dividers that span the card's full width (the reference dividers
/// run edge to edge inside the card).
struct OMGroupedCard<Content: View>: View {
    var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

/// One row inside a grouped card: label on the left, the control on
/// the right, 52pt-ish tall via vertical padding, no fixed heights
/// so wrapped labels can grow.
struct OMGroupedRow<Control: View>: View {
    var title: String
    @ViewBuilder var control: () -> Control

    var body: some View {
        HStack {
            Text(title)
                .font(.body)
                .lineLimit(2)
                .layoutPriority(1)
            Spacer()
            control()
                .fixedSize()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// The coloured rounded-square icon of a 我的 row (30pt, SF Symbol
/// glyph in white), drawn by the app — not copied artwork.
struct OMRowIconView: View {
    var systemImage: String
    var color: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 30, height: 30)
            .background(color)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// The segmented pill from the reference sub-pages (自动/浅色/深色,
/// 前置/后置): a capsule container with one lighter pill for the
/// selected option. Every option is a real button, not a Picker, so
/// the control works identically in both modes and at 375pt.
struct OMSegmentedPill<Selection: Hashable>: View {
    var options: [(Selection, String)]
    var selection: Binding<Selection>

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options.indices, id: \.self) { index in
                let option = options[index]
                Button {
                    selection.wrappedValue = option.0
                } label: {
                    Text(option.1)
                        .font(.subheadline)
                        .fontWeight(selection.wrappedValue == option.0 ? .semibold : .regular)
                        .foregroundColor(
                            selection.wrappedValue == option.0 ? .primary : .secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            selection.wrappedValue == option.0
                                ? OMDesign.segmentedSelectedBackground : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(OMDesign.segmentedContainerBackground)
        .clipShape(Capsule())
    }
}
