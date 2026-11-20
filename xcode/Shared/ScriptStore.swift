import Foundation
#if canImport(Combine)
import Combine
#endif

/// One installed script, as shown in the library list.
public struct StoredScript: Identifiable, Equatable {
    /// Stable identity: the file name on disk (for example `example.user.js`).
    public var id: String { fileName }
    public var fileName: String
    public var name: String
    public var version: String
    public var author: String?
    public var isEnabled: Bool
    /// The URL patterns from the metadata block, for the extension to match.
    public var urlPatterns: [String]

    public init(fileName: String, name: String, version: String,
                author: String? = nil, isEnabled: Bool = true,
                urlPatterns: [String] = []) {
        self.fileName = fileName
        self.name = name
        self.version = version
        self.author = author
        self.isEnabled = isEnabled
        self.urlPatterns = urlPatterns
    }
}

/// Errors from script file operations, surfaced to the user in plain language.
public enum ScriptStoreError: Error, LocalizedError, Equatable {
    case invalidFileName(String)
    case writeFailed(String)
    case readFailed(String)
    case deleteFailed(String)
    case scriptNotFound(String)

    /// Localised through `AppGroup.localized` (Foundation-only, so it
    /// also works in the extension target): Chinese when the app
    /// language resolves to Chinese, otherwise English.
    public var errorDescription: String? {
        switch self {
        case .invalidFileName(let name):
            return AppGroup.localized(
                en: "“\(name)” is not a valid script file name. "
                    + "Use letters, numbers, hyphens and dots, ending in .user.js or .user.css.",
                zh: "“\(name)”不是有效的脚本文件名。请使用字母、数字、连字符和点，并以 .user.js 或 .user.css 结尾。")
        case .writeFailed(let name):
            return AppGroup.localized(
                en: "Could not save “\(name)”. Check storage and try again.",
                zh: "无法保存“\(name)”。请检查存储空间后重试。")
        case .readFailed(let name):
            return AppGroup.localized(
                en: "Could not read “\(name)”.",
                zh: "无法读取“\(name)”。")
        case .deleteFailed(let name):
            return AppGroup.localized(
                en: "Could not delete “\(name)”.",
                zh: "无法删除“\(name)”。")
        case .scriptNotFound(let name):
            return AppGroup.localized(
                en: "Script “\(name)” was not found.",
                zh: "未找到脚本“\(name)”。")
        }
    }
}

/// File storage for installed userscripts, shared by the app and the
/// Safari Web Extension through the App Group container.
///
/// Storage layout (inside the shared container, `AppGroup.identifier`):
/// ```
/// Scripts/
///   example.user.js
///   theme.user.css
/// ```
/// Enabled state is kept separately in the shared `UserDefaults` suite,
/// keyed by file name, so toggling a script never rewrites its source.
/// When no shared container is available (no App Group entitlement yet),
/// the store falls back to the app's own Documents/Scripts directory so
/// the app stays usable during development.
///
/// The class is also the SwiftUI source of truth: views observe
/// `scripts` and call `refresh()` after any change.
public final class ScriptStore: ObservableObject {

    /// The scripts currently on disk, sorted by display name.
    @Published public private(set) var scripts: [StoredScript] = []

    /// The most recent error, if any, for the UI to show.
    @Published public private(set) var lastError: ScriptStoreError?

    /// UserDefaults suite shared with the extension; falls back to
    /// `.standard` when the group suite is unavailable.
    private let defaults: UserDefaults

    /// File names of enabled scripts, persisted in the shared suite.
    private var enabledFileNames: Set<String> {
        get { Set(defaults.stringArray(forKey: Self.enabledScriptsKey) ?? []) }
        set { defaults.set(Array(newValue), forKey: Self.enabledScriptsKey) }
    }

    private static let enabledScriptsKey = "OpenMonkeyEnabledScripts"
    private static let bookmarkKey = "OpenMonkeyScriptsFolderBookmark"

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults
            ?? UserDefaults(suiteName: AppGroup.identifier)
            ?? UserDefaults.standard
        refresh()
    }

    // MARK: - Directory resolution

    /// The directory scripts are read from and written to right now.
    public var scriptsDirectory: URL {
        if let shared = AppGroup.scriptsDirectory() { return shared }
        let fallback = AppGroup.fallbackScriptsDirectory
        try? FileManager.default.createDirectory(
            at: fallback, withIntermediateDirectories: true, attributes: nil)
        return fallback
    }

    /// `true` when scripts live in the shared App Group container and the
    /// Safari extension can therefore see them too.
    public var isUsingSharedContainer: Bool {
        AppGroup.containerURL != nil
    }

    // MARK: - Listing and loading

    /// Re-reads the scripts directory and republishes `scripts`.
    public func refresh() {
        scripts = listScripts()
    }

    /// Reads `*.user.js` and `*.user.css` files from the scripts directory.
    /// Files that fail to parse still appear in the list, using the file
    /// name as the display name, so a broken script can be opened and fixed.
    public func listScripts() -> [StoredScript] {
        let directory = scriptsDirectory
        let fileNames: [String]
        do {
            fileNames = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        } catch {
            lastError = nil
            return []
        }
        let enabled = enabledFileNames
        var result: [StoredScript] = []
        for fileName in fileNames.sorted() where isScriptFileName(fileName) {
            let url = directory.appendingPathComponent(fileName)
            let source = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            if let metadata = MetadataParser.tryParse(source: source) {
                result.append(StoredScript(
                    fileName: fileName, name: metadata.name,
                    version: metadata.version, author: metadata.author,
                    isEnabled: enabled.contains(fileName) || !defaultsHasEnabledList,
                    urlPatterns: metadata.urlPatterns))
            } else {
                result.append(StoredScript(
                    fileName: fileName,
                    name: fileName.replacingOccurrences(of: ".user.js", with: "")
                        .replacingOccurrences(of: ".user.css", with: ""),
                    version: "—", author: nil,
                    isEnabled: enabled.contains(fileName) || !defaultsHasEnabledList,
                    urlPatterns: []))
            }
        }
        // A script is enabled by default when no enabled-list has ever been
        // written; once the user toggles anything, the list is authoritative.
        return result.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// `true` once an enabled-scripts list has been persisted at least once.
    private var defaultsHasEnabledList: Bool {
        defaults.object(forKey: Self.enabledScriptsKey) != nil
    }

    /// The source text of one script, or `nil` when it cannot be read.
    public func loadScript(fileName: String) -> String? {
        let url = scriptsDirectory.appendingPathComponent(fileName)
        do {
            return try String(contentsOf: url, encoding: .utf8)
        } catch {
            lastError = .readFailed(fileName)
            return nil
        }
    }

    /// The metadata of one script, or `nil` when it cannot be parsed.
    public func metadata(for fileName: String) -> UserscriptMetadata? {
        guard let source = loadScript(fileName: fileName) else { return nil }
        return MetadataParser.tryParse(source: source)
    }

    // MARK: - Saving and deleting

    /// Saves a script, deriving a safe file name from its metadata when
    /// no explicit file name is given, then refreshes the library.
    ///
    /// - Parameters:
    ///   - name: Display name, used to derive the file name when
    ///     `fileName` is `nil`. The derived name is sanitised and gets a
    ///     `.user.js` suffix.
    ///   - source: The full script source, including its metadata block.
    ///   - fileName: An existing file name to overwrite, or `nil` to create
    ///     a new file.
    /// - Returns: The file name the script was saved under.
    /// - Throws: ``ScriptStoreError`` when the name is invalid or the
    ///   write fails.
    @discardableResult
    public func saveScript(name: String, source: String, fileName existingFileName: String? = nil) throws -> String {
        let resolvedName: String
        if let existingFileName, !existingFileName.isEmpty {
            guard isScriptFileName(existingFileName) else {
                throw ScriptStoreError.invalidFileName(existingFileName)
            }
            resolvedName = existingFileName
        } else {
            resolvedName = fileName(for: name)
        }
        let url = scriptsDirectory.appendingPathComponent(resolvedName)
        do {
            try source.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            lastError = .writeFailed(resolvedName)
            throw ScriptStoreError.writeFailed(resolvedName)
        }
        // New scripts start enabled. Seed the list from the current
        // library first, so saving the first script does not disable
        // every other script that was enabled by default.
        var enabled = enabledFileNames
        if !defaultsHasEnabledList {
            enabled = Set(scripts.map { $0.fileName })
        }
        enabled.insert(resolvedName)
        enabledFileNames = enabled
        lastError = nil
        refresh()
        return resolvedName
    }

    /// Deletes one script file and removes it from the enabled list.
    public func deleteScript(fileName: String) throws {
        let url = scriptsDirectory.appendingPathComponent(fileName)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ScriptStoreError.scriptNotFound(fileName)
        }
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            lastError = .deleteFailed(fileName)
            throw ScriptStoreError.deleteFailed(fileName)
        }
        var enabled = enabledFileNames
        enabled.remove(fileName)
        enabledFileNames = enabled
        lastError = nil
        refresh()
    }

    /// Enables or disables a script without touching its source file.
    public func setEnabled(_ enabled: Bool, for fileName: String) {
        var set = enabledFileNames
        // First toggle ever: seed the list with the current on-disk state
        // so toggling one script does not disable all the others.
        if !defaultsHasEnabledList {
            set = Set(scripts.map { $0.fileName })
        }
        if enabled { set.insert(fileName) } else { set.remove(fileName) }
        enabledFileNames = set
        refresh()
    }

    // MARK: - File names

    public func isScriptFileName(_ fileName: String) -> Bool {
        fileName.hasSuffix(".user.js") || fileName.hasSuffix(".user.css")
    }

    /// Turns a display name such as `My Cool Script!` into a safe file
    /// name such as `My-Cool-Script.user.js`.
    public func fileName(for displayName: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        let sanitised = displayName
            .components(separatedBy: allowed.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let base = sanitised.isEmpty ? "Untitled" : sanitised
        return base + ".user.js"
    }

    // MARK: - User-chosen folder (security-scoped bookmark)

    /// Saves a security-scoped bookmark for a folder the user picked
    /// (for example in a document picker), so the app can keep reading
    /// it across launches. Returns `false` when the bookmark cannot be
    /// created; the shared container remains the default in that case.
    @discardableResult
    public func saveFolderBookmark(for folderURL: URL) -> Bool {
        do {
            // Security-scoped bookmarks are macOS-only; on iOS a plain
            // bookmark is stored instead (document-picker access is
            // handled by startAccessingBookmarkedFolder).
            #if os(macOS)
            let options: URL.BookmarkCreationOptions = [.withSecurityScope]
            #else
            let options: URL.BookmarkCreationOptions = []
            #endif
            let data = try folderURL.bookmarkData(
                options: options,
                includingResourceValuesForKeys: nil, relativeTo: nil)
            defaults.set(data, forKey: Self.bookmarkKey)
            return true
        } catch {
            return false
        }
    }

    /// Resolves the saved folder bookmark, if any. The caller must pair
    /// this with ``stopAccessingBookmarkedFolder(_:)`` when done.
    public func resolveBookmarkedFolder() -> URL? {
        guard let data = defaults.data(forKey: Self.bookmarkKey) else { return nil }
        var isStale = false
        do {
            #if os(macOS)
            let options: URL.BookmarkResolutionOptions = [.withSecurityScope]
            #else
            let options: URL.BookmarkResolutionOptions = []
            #endif
            let url = try URL(resolvingBookmarkData: data,
                              options: options,
                              relativeTo: nil, bookmarkDataIsStale: &isStale)
            if isStale { _ = saveFolderBookmark(for: url) }
            return url
        } catch {
            return nil
        }
    }

    /// Begins security-scoped access to a bookmarked folder URL.
    /// Returns `true` when access was granted and must be balanced by a
    /// matching ``stopAccessingBookmarkedFolder(_:)`` call.
    @discardableResult
    public func startAccessingBookmarkedFolder(_ url: URL) -> Bool {
        url.startAccessingSecurityScopedResource()
    }

    /// Ends security-scoped access previously started with
    /// ``startAccessingBookmarkedFolder(_:)``.
    public func stopAccessingBookmarkedFolder(_ url: URL) {
        url.stopAccessingSecurityScopedResource()
    }

    /// Clears the saved folder bookmark. The shared container is unaffected.
    public func clearFolderBookmark() {
        defaults.removeObject(forKey: Self.bookmarkKey)
    }
}
