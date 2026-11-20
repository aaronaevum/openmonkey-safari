import Foundation

/// A parsed `// ==UserScript==` metadata block.
///
/// This parser is intentionally dependency-free and JavaScript-free: it
/// reads only the comment block at the top of a userscript source file.
/// It understands the common Greasemonkey / Tampermonkey keys; unknown
/// keys are preserved in `other` so nothing is silently dropped.
public struct UserscriptMetadata: Equatable {
    public var name: String
    public var version: String
    public var description: String?
    public var author: String?
    public var namespace: String?
    public var homepage: String?
    public var icon: String?
    public var runAt: String?
    public var matches: [String]
    public var includes: [String]
    public var excludes: [String]
    public var grants: [String]
    public var requires: [String]
    /// Any other `// @key value` lines, in source order.
    public var other: [(key: String, value: String)]

    public init(
        name: String, version: String, description: String? = nil,
        author: String? = nil, namespace: String? = nil,
        homepage: String? = nil, icon: String? = nil, runAt: String? = nil,
        matches: [String] = [], includes: [String] = [],
        excludes: [String] = [], grants: [String] = [],
        requires: [String] = [], other: [(key: String, value: String)] = []
    ) {
        self.name = name
        self.version = version
        self.description = description
        self.author = author
        self.namespace = namespace
        self.homepage = homepage
        self.icon = icon
        self.runAt = runAt
        self.matches = matches
        self.includes = includes
        self.excludes = excludes
        self.grants = grants
        self.requires = requires
        self.other = other
    }

    public static func == (lhs: UserscriptMetadata, rhs: UserscriptMetadata) -> Bool {
        lhs.name == rhs.name && lhs.version == rhs.version
            && lhs.description == rhs.description && lhs.author == rhs.author
            && lhs.namespace == rhs.namespace && lhs.homepage == rhs.homepage
            && lhs.icon == rhs.icon && lhs.runAt == rhs.runAt
            && lhs.matches == rhs.matches && lhs.includes == rhs.includes
            && lhs.excludes == rhs.excludes && lhs.grants == rhs.grants
            && lhs.requires == rhs.requires
            && lhs.other.map { "\($0.key)=\($0.value)" }
                == rhs.other.map { "\($0.key)=\($0.value)" }
    }

    /// All URL patterns this script applies to (`@match` plus `@include`).
    public var urlPatterns: [String] { matches + includes }
}

/// Errors reported when a userscript metadata block is missing or malformed.
///
/// The editor surfaces `errorDescription` inline, next to the source,
/// so a script author can fix the header without leaving the app.
public enum MetadataParseError: Error, LocalizedError, Equatable {
    /// No `// ==UserScript==` block was found at all.
    case missingBlock
    /// The opening marker was found but the closing `// ==/UserScript==` was not.
    case unterminatedBlock
    /// The block exists but has no usable `@name` line.
    case missingName
    /// A specific line inside the block could not be understood.
    case malformedLine(line: Int, text: String)

    /// Localised through `AppGroup.localized` (Foundation-only, so it
    /// also works in the extension target): Chinese when the app
    /// language resolves to Chinese, otherwise English.
    public var errorDescription: String? {
        switch self {
        case .missingBlock:
            return AppGroup.localized(
                en: "No // ==UserScript== metadata block found. "
                    + "Add one at the top of the file, starting with "
                    + "// ==UserScript== and ending with // ==/UserScript==.",
                zh: "未找到 // ==UserScript== 元数据块。请在文件顶部添加一个，"
                    + "以 // ==UserScript== 开头，以 // ==/UserScript== 结尾。")
        case .unterminatedBlock:
            return AppGroup.localized(
                en: "The // ==UserScript== block is not closed. "
                    + "Add a // ==/UserScript== line after the @-tags.",
                zh: "// ==UserScript== 代码块未闭合。请在 @ 标签后添加一行 // ==/UserScript==。")
        case .missingName:
            return AppGroup.localized(
                en: "The metadata block has no @name. Add a line such as "
                    + "// @name My Script.",
                zh: "元数据块缺少 @name。请添加一行，例如 // @name My Script。")
        case .malformedLine(let line, let text):
            return AppGroup.localized(
                en: "Line \(line) in the metadata block is malformed: “\(text)”. "
                    + "Each line should look like // @key value.",
                zh: "元数据块中的第 \(line) 行格式错误：“\(text)”。每行应形如 // @key value。")
        }
    }
}

/// Parses the `// ==UserScript==` block of a userscript source file.
///
/// - Parameter source: The full source text of the script.
/// - Returns: The parsed metadata. `@version` defaults to `"0.1"` when
///   absent, because a version is useful everywhere (library list,
///   update checks) but is not required to run a script.
/// - Throws: ``MetadataParseError`` when the block is missing,
///   unterminated, or has no `@name`.
public enum MetadataParser {

    public static func parse(source: String) throws -> UserscriptMetadata {
        let lines = source.components(separatedBy: .newlines)
        guard let startIndex = lines.firstIndex(where: {
            $0.trimmingCharacters(in: .whitespaces) == "// ==UserScript=="
        }) else {
            throw MetadataParseError.missingBlock
        }
        guard let endIndex = lines[(startIndex + 1)...].firstIndex(where: {
            $0.trimmingCharacters(in: .whitespaces) == "// ==/UserScript=="
        }) else {
            throw MetadataParseError.unterminatedBlock
        }

        var name: String?
        var version = "0.1"
        var description: String?
        var author: String?
        var namespace: String?
        var homepage: String?
        var icon: String?
        var runAt: String?
        var matches: [String] = []
        var includes: [String] = []
        var excludes: [String] = []
        var grants: [String] = []
        var requires: [String] = []
        var other: [(key: String, value: String)] = []

        for index in (startIndex + 1)..<endIndex {
            let rawLine = lines[index]
            let trimmed = rawLine.trimmingCharacters(in: .whitespaces)
            // Blank lines and plain comment lines inside the block are allowed.
            guard trimmed.hasPrefix("//") else {
                throw MetadataParseError.malformedLine(line: index + 1, text: rawLine)
            }
            let afterSlashes = trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)
            guard afterSlashes.hasPrefix("@") else { continue }
            let withoutAt = afterSlashes.dropFirst()
            let parts = withoutAt.split(maxSplits: 1, whereSeparator: { $0.isWhitespace })
            guard let keyPart = parts.first, !keyPart.isEmpty else {
                throw MetadataParseError.malformedLine(line: index + 1, text: rawLine)
            }
            let key = String(keyPart)
            let value = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : ""
            switch key {
            case "name": name = value
            case "version": if !value.isEmpty { version = value }
            case "description": description = value.isEmpty ? nil : value
            case "author": author = value.isEmpty ? nil : value
            case "namespace": namespace = value.isEmpty ? nil : value
            case "homepage", "homepageURL": homepage = value.isEmpty ? nil : value
            case "icon", "iconURL": icon = value.isEmpty ? nil : value
            case "run-at": runAt = value.isEmpty ? nil : value
            case "match": if !value.isEmpty { matches.append(value) }
            case "include": if !value.isEmpty { includes.append(value) }
            case "exclude": if !value.isEmpty { excludes.append(value) }
            case "grant": grants.append(value)
            case "require": if !value.isEmpty { requires.append(value) }
            default: other.append((key: key, value: value))
            }
        }

        guard let scriptName = name, !scriptName.isEmpty else {
            throw MetadataParseError.missingName
        }
        return UserscriptMetadata(
            name: scriptName, version: version, description: description,
            author: author, namespace: namespace, homepage: homepage,
            icon: icon, runAt: runAt, matches: matches, includes: includes,
            excludes: excludes, grants: grants, requires: requires, other: other)
    }

    /// Best-effort parse used for list display: returns `nil` instead of
    /// throwing, so one broken script never hides the whole library.
    public static func tryParse(source: String) -> UserscriptMetadata? {
        try? parse(source: source)
    }

    /// A minimal metadata block for a brand-new script, ready to edit.
    public static func template(name: String = "New Script") -> String {
        """
        // ==UserScript==
        // @name         \(name)
        // @namespace    com.openmonkey.safari
        // @version      0.1
        // @description  Describe what this script does.
        // @author       You
        // @match        https://example.com/*
        // @grant        none
        // ==/UserScript==

        (function () {
            'use strict';
            // Your code here.
        })();

        """
    }
}
