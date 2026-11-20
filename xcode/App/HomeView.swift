import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif
import UniformTypeIdentifiers

/// Home: the reference Addons Home, with only the features OpenMonkey
/// really has. Each card is a large rounded card (28pt radius) with a
/// 44pt coloured circle icon, a bold title, ONE grey description line,
/// and a green switch where the card controls a real setting; a grey
/// "View help" capsule sits at the card's bottom-right and opens a
/// short help sheet for that feature.
///
/// Cards, in order: 用户脚本 (global injection switch, opens the
/// library), 资源管理 (media-detection switch, opens detected media),
/// 代码编辑器 (dark-editor switch, opens the editor), 安装脚本 (an
/// action, not a setting — no switch, opens install), 广告过滤
/// (switch + custom-rules editor), 标记模式 (switch), 智能搜索
/// (switch + engine/trigger editor), 暗黑模式 (switch + mode in
/// General Settings), 嗅探模式 (switch).
///
/// Switches appear only where they control a real setting, and every
/// one of them writes the App Group suite through `OMSharedSettings`
/// so the extension sees the same value. Tapping a card's text (not
/// its switch) opens that feature's page or help.
///
/// v0.5.0 fixes vs v0.4.0: the title is centred (inline display
/// mode, like the reference), the description is a single line with
/// `.minimumScaleFactor` so it never truncates mid-word at 375pt.
/// v0.5.1: the floating-pill clearance is no longer a fixed 116pt
/// bottom padding here — the pill strip is reserved in the layout
/// flow (root `VStack` in `OpenMonkeyApp`), so this scroll view's
/// frame ends above the pill on every device, at any scroll
/// position.
struct HomeView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var help: HelpTopic?
    @State private var showingInstall = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 12) {
                    FeatureCard(
                        icon: "scroll.fill",
                        iconColor: OMDesign.brand,
                        title: lang.text(.cardScriptsTitle),
                        description: lang.text(.cardScriptsDesc),
                        helpTopic: .scripts,
                        helpAction: { help = .scripts },
                        toggle: sharedSettings.globalEnabledBinding,
                        destination: AnyView(LibraryView())
                    )

                    FeatureCard(
                        icon: "play.circle.fill",
                        iconColor: Color(red: 0x30 / 255.0, green: 0x9B / 255.0, blue: 0xFF / 255.0),
                        title: lang.text(.cardResourcesTitle),
                        description: lang.text(.cardResourcesDesc),
                        helpTopic: .resources,
                        helpAction: { help = .resources },
                        toggle: sharedSettings.resourceDetectionEnabledBinding,
                        destination: AnyView(ResourcesView())
                    )

                    FeatureCard(
                        icon: "chevron.left.forwardslash.chevron.right",
                        iconColor: Color(red: 0x30 / 255.0, green: 0x9B / 255.0, blue: 0xFF / 255.0),
                        title: lang.text(.cardEditorTitle),
                        description: lang.text(.cardEditorDesc),
                        helpTopic: .editor,
                        helpAction: { help = .editor },
                        toggle: sharedSettings.darkEditorBinding,
                        destination: AnyView(EditorView())
                    )

                    FeatureCard(
                        icon: "square.and.arrow.down.fill",
                        iconColor: Color(red: 0xFF / 255.0, green: 0x9F / 255.0, blue: 0x0A / 255.0),
                        title: lang.text(.cardInstallTitle),
                        description: lang.text(.cardInstallDesc),
                        helpTopic: .install,
                        helpAction: { help = .install },
                        toggle: nil,
                        destination: nil,
                        sheetAction: { showingInstall = true }
                    )

                    FeatureCard(
                        icon: "shield.slash.fill",
                        iconColor: Color(red: 0xFF / 255.0, green: 0x59 / 255.0, blue: 0x48 / 255.0),
                        title: lang.text(.cardAdFilterTitle),
                        description: lang.text(.cardAdFilterDesc),
                        helpTopic: .adFilter,
                        helpAction: { help = .adFilter },
                        toggle: sharedSettings.adFilterEnabledBinding,
                        destination: AnyView(AdRulesView())
                    )

                    FeatureCard(
                        icon: "pin.fill",
                        iconColor: Color(red: 0xFF / 255.0, green: 0xCC / 255.0, blue: 0x00 / 255.0),
                        title: lang.text(.cardTagModeTitle),
                        description: lang.text(.cardTagModeDesc),
                        helpTopic: .tagMode,
                        helpAction: { help = .tagMode },
                        toggle: sharedSettings.tagModeEnabledBinding,
                        destination: nil
                    )

                    FeatureCard(
                        icon: "cloud.fill",
                        iconColor: Color(red: 0x30 / 255.0, green: 0x9B / 255.0, blue: 0xFF / 255.0),
                        title: lang.text(.cardSmartSearchTitle),
                        description: lang.text(.cardSmartSearchDesc),
                        helpTopic: .smartSearch,
                        helpAction: { help = .smartSearch },
                        toggle: sharedSettings.smartSearchEnabledBinding,
                        destination: AnyView(SmartSearchView())
                    )

                    FeatureCard(
                        icon: "moon.fill",
                        iconColor: OMDesign.switchGreen,
                        title: lang.text(.cardDarkModeTitle),
                        description: lang.text(.cardDarkModeDesc),
                        helpTopic: .darkMode,
                        helpAction: { help = .darkMode },
                        toggle: sharedSettings.darkModeEnabledBinding,
                        destination: AnyView(GeneralSettingsView())
                    )

                    FeatureCard(
                        icon: "dot.radiowaves.left.and.right",
                        iconColor: Color(red: 0xAF / 255.0, green: 0x52 / 255.0, blue: 0xDE / 255.0),
                        title: lang.text(.cardSniffTitle),
                        description: lang.text(.cardSniffDesc),
                        helpTopic: .sniff,
                        helpAction: { help = .sniff },
                        toggle: sharedSettings.sniffEnabledBinding,
                        destination: AnyView(TaskSettingsView())
                    )

                    if !store.isUsingSharedContainer {
                        Label(
                            lang.text(.appGroupBanner),
                            systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(OMDesign.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding(16)
            }
            .background(OMDesign.pageBackground)
            .navigationTitle(lang.text(.navHome))
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $help) { topic in
                HelpSheet(topic: topic)
            }
            .sheet(isPresented: $showingInstall) {
                NavigationView { InstallView() }
            }
            .onAppear {
                store.refresh()
                sharedSettings.refresh()
                lang.refresh()
            }
        }
    }
}

/// One help topic, shown as a sheet from a card's "View help" button.
private enum HelpTopic: String, Identifiable {
    case scripts, resources, editor, install, adFilter, tagMode, smartSearch, darkMode, sniff

    var id: String { rawValue }

    var titleKey: OMTextKey {
        switch self {
        case .scripts: return .cardScriptsTitle
        case .resources: return .cardResourcesTitle
        case .editor: return .cardEditorTitle
        case .install: return .cardInstallTitle
        case .adFilter: return .cardAdFilterTitle
        case .tagMode: return .cardTagModeTitle
        case .smartSearch: return .cardSmartSearchTitle
        case .darkMode: return .cardDarkModeTitle
        case .sniff: return .cardSniffTitle
        }
    }

    var bodyKey: OMTextKey {
        switch self {
        case .scripts: return .helpScriptsBody
        case .resources: return .helpResourcesBody
        case .editor: return .helpEditorBody
        case .install: return .helpInstallBody
        case .adFilter: return .helpAdFilterBody
        case .tagMode: return .helpTagModeBody
        case .smartSearch: return .helpSmartSearchBody
        case .darkMode: return .helpDarkModeBody
        case .sniff: return .helpSniffBody
        }
    }
}

private struct HelpSheet: View {
    @EnvironmentObject private var lang: OMLanguageManager

    var topic: HelpTopic
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                Text(lang.text(topic.bodyKey))
                    .font(.body)
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle(lang.text(topic.titleKey))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(lang.text(.done)) { dismiss() }
                }
            }
        }
    }
}

/// One reference-style feature card: 44pt circle icon, bold title,
/// ONE grey description line, an optional green switch, a chevron
/// when the card navigates somewhere, and a "View help" capsule at
/// the bottom-right.
///
/// Layout (the v0.3.0 card broke at 375pt, and v0.4.0 fixed it the
/// same way): the text column has `.layoutPriority(1)`, the trailing
/// controls sit in a compact fixed-size `HStack` that cannot be
/// compressed, and the description is one line with
/// `.minimumScaleFactor(0.85)` so a long description shrinks slightly
/// instead of truncating mid-word. The descriptions are short by
/// contract (Chinese ≤ 8 characters, see the table in Design.swift):
/// v0.5.2 measured Aaron's real-device shot and the column is only
/// ~150pt wide — the Toggle renders wider than its 51pt nominal
/// width — so the v0.5.1 claim that a 12-character description "fits
/// at full 15pt" was wrong, and 10-character descriptions truncated
/// with "…". Do not lengthen a description string without
/// re-measuring the real column. The whole text area is tappable
/// — a `NavigationLink` when the card has a destination, a plain
/// button opening the help sheet otherwise — while the Toggle stays a
/// separate control that never navigates.
private struct FeatureCard: View {
    @EnvironmentObject private var lang: OMLanguageManager

    var icon: String
    var iconColor: Color
    var title: String
    var description: String
    var helpTopic: HelpTopic?
    var helpAction: () -> Void
    var toggle: Binding<Bool>?
    var destination: AnyView?
    var sheetAction: (() -> Void)?

    init(
        icon: String, iconColor: Color, title: String, description: String,
        helpTopic: HelpTopic? = nil, helpAction: @escaping () -> Void,
        toggle: Binding<Bool>? = nil, destination: AnyView? = nil,
        sheetAction: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.iconColor = iconColor
        self.title = title
        self.description = description
        self.helpTopic = helpTopic
        self.helpAction = helpAction
        self.toggle = toggle
        self.destination = destination
        self.sheetAction = sheetAction
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                cardText
                HStack(spacing: 8) {
                    if let toggle = toggle {
                        Toggle("", isOn: toggle)
                            .labelsHidden()
                    }
                    if destination != nil || sheetAction != nil {
                        Image(systemName: "chevron.right")
                            .foregroundColor(.secondary)
                    }
                }
                .fixedSize()
            }
            if helpTopic != nil {
                HStack {
                    Spacer()
                    Button(lang.text(.viewHelp), action: helpAction)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(OMDesign.capsuleBackground)
                        .clipShape(Capsule())
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 28))
        .shadow(color: Color.black.opacity(0.06), radius: 2, x: 0, y: 1)
    }

    /// The tappable text area: a NavigationLink to the feature's page
    /// when there is one, a button opening the install sheet for the
    /// Install card, otherwise a button opening the help sheet.
    @ViewBuilder
    private var cardText: some View {
        let content = HStack(spacing: 12) {
            FeatureIconView(systemImage: icon, color: iconColor)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .layoutPriority(1)
        }
        if let destination = destination {
            NavigationLink(destination: destination) { content }
                .buttonStyle(.plain)
        } else if let sheetAction = sheetAction {
            Button(action: sheetAction) { content }
                .buttonStyle(.plain)
        } else {
            Button(action: helpAction) { content }
                .buttonStyle(.plain)
        }
    }
}

/// Install a script: from a .user.js URL, from a file, or from the
/// clipboard — plus a shortcut to write a new script in the editor.
struct InstallView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @Environment(\.dismiss) private var dismiss

    @State private var urlText = ""
    @State private var statusMessage = ""
    @State private var showingFileImporter = false
    @State private var showingNewScriptEditor = false

    var body: some View {
        Form {
            Section {
                TextField("https://example.com/script.user.js", text: $urlText)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                Button(lang.text(.fetchAndInstall)) { installFromURL() }
                    .disabled(urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } header: {
                Text(lang.text(.installFromURL))
            } footer: {
                Text(lang.text(.installURLFootnote))
            }

            Section(lang.text(.installOtherWays)) {
                Button(lang.text(.importFromFile)) { showingFileImporter = true }
                Button(lang.text(.pasteFromClipboard)) { installFromClipboard() }
                Button(lang.text(.writeNewScript)) { showingNewScriptEditor = true }
            }

            if !statusMessage.isEmpty {
                Section {
                    Text(statusMessage)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle(lang.text(.navInstall))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(lang.text(.close)) { dismiss() }
            }
        }
        .fileImporter(
            isPresented: $showingFileImporter,
            allowedContentTypes: [.plainText],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                installFromFile(url: url)
            case .failure(let error):
                statusMessage = lang.format(.installStatusFileOpenFailed, error.localizedDescription)
            }
        }
        .sheet(isPresented: $showingNewScriptEditor) {
            NavigationView { EditorView() }
        }
    }

    // MARK: - Install paths

    private func installFromURL() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed) else {
            statusMessage = lang.text(.installStatusInvalidURL)
            return
        }
        statusMessage = lang.text(.installStatusDownloading)
        URLSession.shared.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    statusMessage = lang.format(.installStatusDownloadFailed, error.localizedDescription)
                    return
                }
                guard let data = data, let source = String(data: data, encoding: .utf8),
                      !source.isEmpty else {
                    statusMessage = lang.text(.installStatusDownloadedNothing)
                    return
                }
                save(source: source, name: url.lastPathComponent)
            }
        }.resume()
    }

    private func installFromClipboard() {
        #if os(iOS)
        guard let text = UIPasteboard.general.string, !text.isEmpty else {
            statusMessage = lang.text(.installStatusClipboardEmpty)
            return
        }
        save(source: text, name: lang.text(.pastedScriptName))
        #elseif os(macOS)
        guard let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else {
            statusMessage = lang.text(.installStatusClipboardEmpty)
            return
        }
        save(source: text, name: lang.text(.pastedScriptName))
        #endif
    }

    private func installFromFile(url: URL) {
        let needsAccess = url.startAccessingSecurityScopedResource()
        defer { if needsAccess { url.stopAccessingSecurityScopedResource() } }
        guard let source = try? String(contentsOf: url, encoding: .utf8), !source.isEmpty else {
            statusMessage = lang.text(.installStatusFileUnreadable)
            return
        }
        save(source: source, name: url.lastPathComponent)
    }

    /// Parses the source, saves it through the store, and reports the
    /// result. A script without a valid metadata block is refused
    /// with the parser's own message.
    private func save(source: String, name: String) {
        guard let metadata = MetadataParser.tryParse(source: source) else {
            statusMessage = lang.text(.installStatusNotUserscript)
            return
        }
        do {
            let fileName = try store.saveScript(name: metadata.name, source: source)
            statusMessage = lang.format(.installStatusInstalled, metadata.name, fileName)
            urlText = ""
        } catch {
            statusMessage = lang.format(.installStatusFailed, error.localizedDescription)
        }
    }
}

#if DEBUG
struct HomeView_Previews: PreviewProvider {
    static var previews: some View {
        HomeView()
            .environmentObject(ScriptStore())
            .environmentObject(OMLanguageManager())
            .environmentObject(OMSharedSettings())
    }
}
#endif
