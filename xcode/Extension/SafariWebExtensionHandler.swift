import SafariServices
import UniformTypeIdentifiers
import os.log

/// The native side of the Safari Web Extension.
///
/// Contract with the web extension (`extension/src/background/index.ts`,
/// `OM_NATIVE` messages):
///
/// * The JavaScript side sends a message with
///   `browser.runtime.sendNativeMessage(...)`. Safari delivers it here as
///   an `NSExtensionItem` whose first attachment is a property list
///   (type identifier `UTType.propertyList`, i.e. `public.property-list`)
///   containing a dictionary of the form:
///   ```
///   ["type": "getScripts" | "saveScript" | "log" | "getSettings" | "setSettings"
///    | "reportResources",
///    "url": String?,            // getScripts: the page URL to match
///    "name": String?,           // saveScript: display name
///    "source": String?,         // saveScript: full script source
///    "message": String?,        // log: a free-form log line
///    "globalEnabled": Bool?,    // setSettings: new global switch value
///    "language": String?,       // setSettings: new language ("system" | "zh" | "en")
///    "darkMode": String?,       // setSettings: "auto" | "light" | "dark"
///    "darkModeEnabled": Bool?, "adFilterEnabled": Bool?,
///    "customAdRules": [String]?, "tagModeEnabled": Bool?,
///    "smartSearchEnabled": Bool?, "smartSearchTrigger": String?,
///    "smartSearchEngines": [[String: String]]?,
///    "sniffEnabled": Bool?, "showSniffButton": Bool?,
///    "longPressSniff": Bool?, "resourceDetectionEnabled": Bool?,
///    "darkEditor": Bool?, "fileSort": String?,
///    "showPromptPopups": Bool?,
///    "resources": [[String: Any]]?]  // reportResources: detected media
///   ```
/// * This handler replies with an `NSExtensionItem` carrying a property
///   list dictionary of the form:
///   ```
///   ["ok": Bool,
///    "scripts": [[String: Any]]?,  // getScripts, on success
///    "fileName": String?,           // saveScript, on success
///    "globalEnabled": Bool?,        // getSettings, on success
///    "language": String?,           // getSettings, on success ("system" | "zh" | "en")
///    "darkMode": String?, "darkModeEnabled": Bool?,
///    "adFilterEnabled": Bool?, "customAdRules": [String]?,
///    "tagModeEnabled": Bool?, "smartSearchEnabled": Bool?,
///    "smartSearchTrigger": String?,
///    "smartSearchEngines": [[String: String]]?,
///    "sniffEnabled": Bool?, "showSniffButton": Bool?,
///    "longPressSniff": Bool?, "resourceDetectionEnabled": Bool?,
///    "darkEditor": Bool?, "fileSort": String?,
///    "showPromptPopups": Bool?,
///    "error": String?]              // on failure
///   ```
///   Each script dictionary is `["fileName": String, "name": String,
///   "version": String, "source": String]`.
///
/// * `getSettings` / `setSettings` (v0.4.0, extended in v0.5.0) are
///   the settings bridge between the web extension and the host app:
///   both read/write the same App Group suite keys the app's
///   `OMSharedSettings` / `OMLanguageManager` use. `getSettings`
///   answers with the current values, defaulting as documented in
///   `OMSharedSettings` when a key is absent or the suite is
///   unavailable. `setSettings` writes whichever keys are present in
///   the message and no-ops the absent ones; when the suite itself is
///   unavailable it replies `ok: false` with an error string.
///   Neither changes what `getScripts` returns — the web side reads
///   the settings and gates itself. Keys that are not part of the
///   shared contract (syncEnabled, appLockEnabled) are app-local and
///   are never exposed here.
/// * `reportResources` (v0.5.0) is how the extension reports detected
///   page media: `{"type": "reportResources", "resources": [...]}`,
///   where each resource is `{"url": String, "title": String?,
///   "type": String, "pageURL": String?, "detectedAt": Number?}`
///   (`detectedAt` is a Unix timestamp in seconds; the handler
///   converts it to an ISO-8601 string for the JSON the app reads).
///   The handler stores the array as a JSON string under the App
///   Group suite key `openmonkey.resources.v1`, replacing any previous
///   report; the host app only reads that key. A malformed report
///   replies `ok: false` and leaves the stored value untouched.
/// * `context.completeRequest(returningItems:completionHandler:)` is
///   called exactly once per request, on every path, including malformed
///   input. The `completed` flag guards that invariant even if a code
///   path below is later refactored.
///
/// The handler is intentionally small: it reads and writes scripts
/// through `ScriptStore` (shared App Group container) and matches URLs
/// with a deliberately simple glob check (`*` matches any run of
/// characters). Full Tampermonkey `@match` semantics live in the web
/// extension, which re-filters the returned scripts.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let log = Logger(subsystem: "com.openmonkey.safari.app",
                             category: "SafariWebExtensionHandler")

    func beginRequest(with context: NSExtensionContext) {
        // Exactly-once completion: every exit path goes through `finish`.
        var completed = false
        func finish(_ items: [NSExtensionItem]) {
            guard !completed else { return }
            completed = true
            context.completeRequest(returningItems: items, completionHandler: nil)
        }

        guard let item = context.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first else {
            log.error("Native message arrived with no attachment.")
            finish([Self.reply(["ok": false, "error": "No message attachment."])])
            return
        }

        provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { [weak self] data, error in
            guard let self = self else {
                finish([Self.reply(["ok": false, "error": "Handler was released."])])
                return
            }
            if let error = error {
                self.log.error("Failed to load native message: \(error.localizedDescription)")
                finish([Self.reply(["ok": false, "error": "Could not read message."])])
                return
            }
            guard let message = data as? [String: Any] else {
                self.log.error("Native message was not a property-list dictionary.")
                finish([Self.reply(["ok": false, "error": "Message was not a dictionary."])])
                return
            }
            finish([Self.reply(self.handle(message: message))])
        }
    }

    // MARK: - Message dispatch

    /// Handles one decoded native message and returns the reply payload.
    private func handle(message: [String: Any]) -> [String: Any] {
        guard let type = message["type"] as? String else {
            return ["ok": false, "error": "Message has no \"type\"."]
        }
        switch type {
        case "getScripts":
            return handleGetScripts(message: message)
        case "saveScript":
            return handleSaveScript(message: message)
        case "getSettings":
            return handleGetSettings()
        case "setSettings":
            return handleSetSettings(message: message)
        case "reportResources":
            return handleReportResources(message: message)
        case "log":
            if let text = message["message"] as? String {
                log.info("Web extension: \(text, privacy: .public)")
            }
            return ["ok": true]
        default:
            log.error("Unknown native message type: \(type, privacy: .public)")
            return ["ok": false, "error": "Unknown message type “\(type)”."]
        }
    }

    /// Returns the enabled scripts matching `url`, with their sources.
    private func handleGetScripts(message: [String: Any]) -> [String: Any] {
        let urlString = message["url"] as? String ?? ""
        let store = ScriptStore()
        let scripts = store.listScripts().filter { script in
            guard script.isEnabled else { return false }
            return script.urlPatterns.isEmpty
                || script.urlPatterns.contains { Self.matches(pattern: $0, url: urlString) }
        }
        var payload: [[String: Any]] = []
        for script in scripts {
            guard let source = store.loadScript(fileName: script.fileName) else { continue }
            payload.append([
                "fileName": script.fileName,
                "name": script.name,
                "version": script.version,
                "source": source,
            ])
        }
        return ["ok": true, "scripts": payload]
    }

    /// Saves a script sent from the web extension (for example, after the
    /// user taps “Install” on a `.user.js` page in Safari).
    private func handleSaveScript(message: [String: Any]) -> [String: Any] {
        guard let source = message["source"] as? String, !source.isEmpty else {
            return ["ok": false, "error": "saveScript needs a non-empty \"source\"."]
        }
        guard let metadata = MetadataParser.tryParse(source: source) else {
            return ["ok": false, "error": "The script has no valid // ==UserScript== block."]
        }
        let name = (message["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let store = ScriptStore()
        do {
            let fileName = try store.saveScript(
                name: name?.isEmpty == false ? name! : metadata.name, source: source)
            return ["ok": true, "fileName": fileName]
        } catch let error as ScriptStoreError {
            return ["ok": false, "error": error.localizedDescription]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    /// Reads the shared settings for the web extension (v0.5.0: the
    /// full contract, not just the global switch and the language).
    /// Defaults are the `OMSharedSettings` contract defaults when a
    /// key is absent or the suite is unavailable.
    private func handleGetSettings() -> [String: Any] {
        let defaults = UserDefaults(suiteName: AppGroup.identifier)
        func bool(_ key: String, default value: Bool) -> Bool {
            guard let defaults = defaults, defaults.object(forKey: key) != nil else {
                return value
            }
            return defaults.bool(forKey: key)
        }
        func string(_ key: String, allowed: [String], default value: String) -> String {
            let stored = defaults?.string(forKey: key) ?? value
            return allowed.contains(stored) ? stored : value
        }
        let engines: [[String: String]]
        if let json = defaults?.string(forKey: AppGroup.smartSearchEnginesKey),
           let data = json.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            engines = decoded
        } else {
            engines = [
                ["id": "baidu", "name": "Baidu", "trigger": "bd",
                 "url": "https://www.baidu.com/s?wd={q}"],
                ["id": "google", "name": "Google", "trigger": "g",
                 "url": "https://www.google.com/search?q={q}"],
                ["id": "bing", "name": "Bing", "trigger": "bing",
                 "url": "https://www.bing.com/search?q={q}"],
            ]
        }
        return [
            "ok": true,
            "globalEnabled": bool(AppGroup.globalEnabledKey, default: true),
            "language": defaults?.string(forKey: AppGroup.languageKey) ?? "system",
            "darkMode": string(AppGroup.darkModeKey,
                              allowed: ["auto", "light", "dark"], default: "auto"),
            "darkModeEnabled": bool(AppGroup.darkModeEnabledKey, default: false),
            "adFilterEnabled": bool(AppGroup.adFilterEnabledKey, default: false),
            "customAdRules": defaults?.stringArray(forKey: AppGroup.customAdRulesKey) ?? [],
            "tagModeEnabled": bool(AppGroup.tagModeEnabledKey, default: false),
            "smartSearchEnabled": bool(AppGroup.smartSearchEnabledKey, default: false),
            "smartSearchTrigger": string(AppGroup.smartSearchTriggerKey,
                                         allowed: ["prefix", "suffix"], default: "prefix"),
            "smartSearchEngines": engines,
            "sniffEnabled": bool(AppGroup.sniffEnabledKey, default: false),
            "showSniffButton": bool(AppGroup.showSniffButtonKey, default: true),
            "longPressSniff": bool(AppGroup.longPressSniffKey, default: true),
            "resourceDetectionEnabled": bool(AppGroup.resourceDetectionEnabledKey, default: true),
            "darkEditor": bool(AppGroup.darkEditorKey, default: true),
            "fileSort": string(AppGroup.fileSortKey,
                              allowed: ["timeAsc", "timeDesc", "name"], default: "timeAsc"),
            "showPromptPopups": bool(AppGroup.showPromptPopupsKey, default: true),
        ]
    }

    /// Writes whichever settings keys are present in the message into
    /// the App Group suite; absent keys are left untouched. Replies
    /// `ok: false` when the suite itself is unavailable. String values
    /// are validated against their allowed sets; an invalid value is
    /// ignored rather than stored.
    private func handleSetSettings(message: [String: Any]) -> [String: Any] {
        guard let defaults = UserDefaults(suiteName: AppGroup.identifier) else {
            return ["ok": false, "error": "The App Group shared settings are unavailable."]
        }
        func setBool(_ key: String, _ field: String) {
            if let value = message[field] as? Bool {
                defaults.set(value, forKey: key)
            }
        }
        func setString(_ key: String, _ field: String, allowed: [String]) {
            if let value = message[field] as? String, allowed.contains(value) {
                defaults.set(value, forKey: key)
            }
        }
        setBool(AppGroup.globalEnabledKey, "globalEnabled")
        if let language = message["language"] as? String {
            defaults.set(language, forKey: AppGroup.languageKey)
        }
        setString(AppGroup.darkModeKey, "darkMode", allowed: ["auto", "light", "dark"])
        setBool(AppGroup.darkModeEnabledKey, "darkModeEnabled")
        setBool(AppGroup.adFilterEnabledKey, "adFilterEnabled")
        if let rules = message["customAdRules"] as? [String] {
            defaults.set(rules, forKey: AppGroup.customAdRulesKey)
        }
        setBool(AppGroup.tagModeEnabledKey, "tagModeEnabled")
        setBool(AppGroup.smartSearchEnabledKey, "smartSearchEnabled")
        setString(AppGroup.smartSearchTriggerKey, "smartSearchTrigger",
                  allowed: ["prefix", "suffix"])
        if let engines = message["smartSearchEngines"] as? [[String: String]] {
            if let data = try? JSONSerialization.data(withJSONObject: engines),
               let json = String(data: data, encoding: .utf8) {
                defaults.set(json, forKey: AppGroup.smartSearchEnginesKey)
            }
        }
        setBool(AppGroup.sniffEnabledKey, "sniffEnabled")
        setBool(AppGroup.showSniffButtonKey, "showSniffButton")
        setBool(AppGroup.longPressSniffKey, "longPressSniff")
        setBool(AppGroup.resourceDetectionEnabledKey, "resourceDetectionEnabled")
        setBool(AppGroup.darkEditorKey, "darkEditor")
        setString(AppGroup.fileSortKey, "fileSort",
                  allowed: ["timeAsc", "timeDesc", "name"])
        setBool(AppGroup.showPromptPopupsKey, "showPromptPopups")
        return ["ok": true]
    }

    /// Stores a detected-media report from the extension as a JSON
    /// string under `openmonkey.resources.v1`, replacing the previous
    /// report. Entries without a usable `url` string are dropped;
    /// `detectedAt` (a Unix timestamp in seconds) is converted to an
    /// ISO-8601 string, which is what `OMDetectedResource` decodes.
    private func handleReportResources(message: [String: Any]) -> [String: Any] {
        guard let defaults = UserDefaults(suiteName: AppGroup.identifier) else {
            return ["ok": false, "error": "The App Group shared settings are unavailable."]
        }
        guard let raw = message["resources"] as? [[String: Any]] else {
            return ["ok": false, "error": "reportResources needs a \"resources\" array."]
        }
        var cleaned: [[String: Any]] = []
        let formatter = ISO8601DateFormatter()
        for entry in raw {
            guard let url = entry["url"] as? String, !url.isEmpty else { continue }
            var item: [String: Any] = ["url": url]
            item["type"] = (entry["type"] as? String) ?? "other"
            if let title = entry["title"] as? String { item["title"] = title }
            if let pageURL = entry["pageURL"] as? String { item["pageURL"] = pageURL }
            if let timestamp = entry["detectedAt"] as? Double {
                item["detectedAt"] = formatter.string(from: Date(timeIntervalSince1970: timestamp))
            } else if let timestamp = entry["detectedAt"] as? Int {
                item["detectedAt"] = formatter.string(
                    from: Date(timeIntervalSince1970: Double(timestamp)))
            }
            cleaned.append(item)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: cleaned),
              let json = String(data: data, encoding: .utf8) else {
            return ["ok": false, "error": "Could not encode the resources report."]
        }
        defaults.set(json, forKey: AppGroup.resourcesKey)
        return ["ok": true]
    }

    // MARK: - Helpers

    /// Builds the single `NSExtensionItem` reply carrying a property list.
    private static func reply(_ dictionary: [String: Any]) -> NSExtensionItem {
        let item = NSExtensionItem()
        let provider = NSItemProvider(
            item: dictionary as NSDictionary,
            typeIdentifier: UTType.propertyList.identifier)
        item.attachments = [provider]
        return item
    }

    /// Minimal glob match for `@match` / `@include` patterns: `*` matches
    /// any sequence of characters. Patterns without a wildcard must match
    /// the whole URL. This is a first approximation — the web extension
    /// applies the full matching rules as a second pass.
    static func matches(pattern: String, url: String) -> Bool {
        if pattern == "<all_urls>" || pattern == "*://*/*" { return true }
        // Escape everything, then turn each escaped `*` back into `.*`.
        let escaped = NSRegularExpression.escapedPattern(for: pattern)
            .replacingOccurrences(of: "\\*", with: ".*")
        guard let regex = try? NSRegularExpression(
            pattern: "^" + escaped + "$", options: [.caseInsensitive]) else {
            return false
        }
        let range = NSRange(url.startIndex..., in: url)
        return regex.firstMatch(in: url, options: [], range: range) != nil
    }
}
