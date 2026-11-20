import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif
import UniformTypeIdentifiers

/// Detail page for one script, reached from the library list: a
/// header card (icon, name, version, author, description, enable
/// switch), a metadata card (@match sites, @grant chips), an update
/// card (checks @updateURL, or @downloadURL as a fallback, and
/// installs a newer version), and Edit / Export / Copy / Delete.
///
/// The metadata comes from `store.metadata(for:)` — the same parser
/// the editor uses — so the detail never disagrees with the file on
/// disk. `@updateURL` is not a named parser field; it is read back
/// from the parser's `other` bucket via `updateURL(of:)`.
///
/// v0.4.0: every string is localized, and the header text column has
/// layout priority over the Toggle (same 375pt fix as the Home cards).
struct ScriptDetailView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings
    @Environment(\.dismiss) private var dismiss

    var script: StoredScript
    @State private var showingEditor = false
    @State private var showingDeleteConfirmation = false
    @State private var showingExporter = false
    @State private var copied = false
    @State private var updateStatus = ""
    @State private var remoteSource: String?
    @State private var remoteVersion: String?

    /// The store's current copy of this script (the passed-in value can
    /// go stale after a toggle, because the store republishes on change).
    private var current: StoredScript {
        store.scripts.first { $0.fileName == script.fileName } ?? script
    }

    private var metadata: UserscriptMetadata? {
        store.metadata(for: script.fileName)
    }

    private var isUserstyle: Bool { script.fileName.hasSuffix(".user.css") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                headerCard
                detailsCard
                if let grants = metadata?.grants, !grants.isEmpty {
                    permissionsCard(grants)
                }
                if !current.urlPatterns.isEmpty {
                    runsOnCard
                }
                updateCard
                actionsCard
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .navigationTitle(current.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingEditor) {
            NavigationView { EditorView(script: current) }
        }
        .fileExporter(
            isPresented: $showingExporter,
            document: ScriptFileDocument(
                source: store.loadScript(fileName: script.fileName) ?? ""),
            contentType: .plainText,
            defaultFilename: script.fileName
        ) { _ in }
        .alert(lang.text(.deleteScriptTitle), isPresented: $showingDeleteConfirmation) {
            Button(lang.text(.delete), role: .destructive) { delete() }
            Button(lang.text(.cancel), role: .cancel) { }
        } message: {
            Text(lang.format(.deleteScriptMessage, current.name))
        }
    }

    // MARK: - Cards

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                ScriptIconView(name: current.name, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(current.name)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text("v\(current.version)"
                        + (current.author.map { " · \($0)" } ?? ""))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if isUserstyle {
                        Text(lang.text(.userstyle))
                            .font(.caption)
                            .fontWeight(.semibold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.12))
                            .foregroundColor(.blue)
                            .clipShape(Capsule())
                    }
                }
                .layoutPriority(1)
                Toggle("", isOn: Binding(
                    get: { current.isEnabled },
                    set: { store.setEnabled($0, for: script.fileName) }
                ))
                .labelsHidden()
                .fixedSize()
            }
            if let description = metadata?.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var detailsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            detailRow(label: lang.text(.author), value: current.author)
            Divider().padding(.leading, 0)
            detailRow(label: lang.text(.file), value: script.fileName)
            if let homepage = metadata?.homepage, !homepage.isEmpty,
               let url = URL(string: homepage) {
                Divider()
                HStack {
                    Text(lang.text(.homepage))
                    Spacer()
                    Link(homepage, destination: url)
                        .font(.subheadline)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .padding(.vertical, 8)
            }
            if let runAt = metadata?.runAt, !runAt.isEmpty {
                Divider()
                detailRow(label: lang.text(.runAt), value: runAt)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func permissionsCard(_ grants: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(lang.text(.permissions))
                .font(.headline)
            FlexibleChips(items: grants)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var runsOnCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(lang.text(.runsOn))
                .font(.headline)
            ForEach(current.urlPatterns, id: \.self) { pattern in
                Text(pattern)
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var updateCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(lang.text(.update))
                .font(.headline)
            if let url = updateURL(of: metadata) {
                Text(url)
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .truncationMode(.tail)
            } else {
                Text(lang.text(.noUpdateURL))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            HStack(spacing: 8) {
                Button(lang.text(.checkForUpdate)) { checkUpdate() }
                    .buttonStyle(.bordered)
                    .disabled(updateURL(of: metadata) == nil)
                if let remoteVersion = remoteVersion {
                    Button(lang.format(.updateTo, remoteVersion)) { applyUpdate() }
                        .buttonStyle(.borderedProminent)
                }
            }
            if !updateStatus.isEmpty {
                Text(updateStatus)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var actionsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(lang.text(.editScript)) { showingEditor = true }
                .padding(.vertical, 10)
            Divider()
            Button(lang.text(.exportUserscript)) { showingExporter = true }
                .padding(.vertical, 10)
            Divider()
            Button(copied ? lang.text(.copied) : lang.text(.copySource)) { copySource() }
                .padding(.vertical, 10)
                .disabled(store.loadScript(fileName: script.fileName) == nil)
            Divider()
            Button(lang.text(.deleteScript), role: .destructive) {
                // The confirmation popup is itself gated by the
                // 显示提示弹窗 setting (Task Settings): when it is off,
                // the delete happens immediately.
                if sharedSettings.showPromptPopups {
                    showingDeleteConfirmation = true
                } else {
                    delete()
                }
            }
            .padding(.vertical, 10)
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Helpers

    private func detailRow(label: String, value: String?) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value ?? "—")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.vertical, 8)
    }

    private func copySource() {
        guard let source = store.loadScript(fileName: script.fileName) else { return }
        #if os(iOS)
        UIPasteboard.general.string = source
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(source, forType: .string)
        #endif
        copied = true
    }

    private func delete() {
        do {
            try store.deleteScript(fileName: script.fileName)
            dismiss()
        } catch {
            // The store records the failure in `lastError`; the detail
            // simply stays open, with the script still present.
        }
    }

    // MARK: - Update check

    /// Fetches the @updateURL source, parses it, and compares versions.
    /// Nothing is installed here — the "Update" button does that.
    private func checkUpdate() {
        guard let urlString = updateURL(of: metadata),
              let url = URL(string: urlString) else {
            updateStatus = lang.text(.updateStatusNoURL)
            return
        }
        updateStatus = lang.text(.updateStatusChecking)
        remoteSource = nil
        remoteVersion = nil
        URLSession.shared.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    updateStatus = lang.format(.updateStatusCheckFailed, error.localizedDescription)
                    return
                }
                guard let data = data,
                      let source = String(data: data, encoding: .utf8),
                      let remote = MetadataParser.tryParse(source: source) else {
                    updateStatus = lang.text(.updateStatusInvalidRemote)
                    return
                }
                if isNewerVersion(remote.version, than: current.version) {
                    remoteSource = source
                    remoteVersion = remote.version
                    updateStatus = lang.format(.updateStatusAvailable, remote.version, current.version)
                } else {
                    updateStatus = lang.format(.updateStatusUpToDate, current.version)
                }
            }
        }.resume()
    }

    /// Replaces the installed file with the newer source found by
    /// `checkUpdate()`. The store refreshes the library afterwards.
    private func applyUpdate() {
        guard let source = remoteSource,
              let remote = MetadataParser.tryParse(source: source) else { return }
        do {
            try store.saveScript(
                name: remote.name, source: source, fileName: script.fileName)
            updateStatus = lang.format(.updateStatusUpdated, remote.version)
            remoteSource = nil
            remoteVersion = nil
        } catch {
            updateStatus = lang.format(.updateStatusSaveFailed, error.localizedDescription)
        }
    }
}

/// Wrapping chips (permissions) that flow onto multiple lines.
private struct FlexibleChips: View {
    var items: [String]

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 90), spacing: 6, alignment: .leading)],
            alignment: .leading, spacing: 6
        ) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(OMDesign.brand.opacity(0.12))
                    .foregroundColor(OMDesign.brand)
                    .clipShape(Capsule())
            }
        }
    }
}

/// A plain-text file document for the "Export .user.js" action.
private struct ScriptFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText] }

    var source: String

    init(source: String) {
        self.source = source
    }

    init(configuration: ReadConfiguration) throws {
        source = ""
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(source.utf8))
    }
}

#if DEBUG
struct ScriptDetailView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            ScriptDetailView(script: StoredScript(
                fileName: "Example.user.js", name: "Example", version: "1.0.0",
                author: "Someone", isEnabled: true,
                urlPatterns: ["*://example.com/*"]))
        }
        .environmentObject(ScriptStore())
        .environmentObject(OMLanguageManager())
        .environmentObject(OMSharedSettings())
    }
}
#endif
