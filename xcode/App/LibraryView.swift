import SwiftUI

/// Scripts list: the Stay Userscripts screen — header with the app
/// icon and title plus refresh and "+" capsule buttons, a rounded
/// search field, an "Activated / Stopped / Featured" capsule
/// segment (selected = grey capsule, black text), and the scripts in
/// a white rounded container. Each row has a 40pt rounded-square
/// icon, a bold name, a one-line description, a bottom line of
/// "● Activated | ⓥ version | Updated date", and a green switch.
/// Tapping a row opens its detail page.
///
/// "Featured" means the script declares an @updateURL — it can be
/// checked for updates (see docs/ui-redesign.md).
///
/// v0.5.0: this view is a pushed page inside the 首页 tab (it is no
/// longer a tab of its own and no longer wraps itself in a
/// `NavigationView` — the parent's navigation bar provides the
/// centred title and the circle back button). The list order follows
/// the 文件排序 setting from Task Settings (time ascending by
/// default). v0.5.1: the pill strip is reserved in the layout flow
/// (root `VStack` in `OpenMonkeyApp`), so this view adds no bottom
/// padding for it.
struct LibraryView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var searchText = ""
    @State private var segment: Segment = .activated
    @State private var showingNewScriptEditor = false
    @State private var showingInstall = false
    @State private var updateSummary = ""
    @State private var showingUpdateSummary = false

    private enum Segment: String, CaseIterable {
        case activated
        case stopped
        case featured
    }

    private func segmentTitle(_ segment: Segment) -> String {
        switch segment {
        case .activated: return lang.text(.segmentActivated)
        case .stopped: return lang.text(.segmentStopped)
        case .featured: return lang.text(.segmentFeatured)
        }
    }

    private var filteredScripts: [StoredScript] {
        let all = store.scripts
        let bySegment: [StoredScript]
        switch segment {
        case .activated:
            bySegment = all.filter { $0.isEnabled }
        case .stopped:
            bySegment = all.filter { !$0.isEnabled }
        case .featured:
            bySegment = all.filter { updateURL(of: store.metadata(for: $0.fileName)) != nil }
        }
        guard !searchText.isEmpty else { return sortedScripts(bySegment) }
        let query = searchText.lowercased()
        return sortedScripts(bySegment.filter { script in
            script.name.lowercased().contains(query)
                || script.fileName.lowercased().contains(query)
                || (script.author?.lowercased().contains(query) ?? false)
        })
    }

    /// Applies the 文件排序 setting (Task Settings) to a filtered
    /// list: file modification date ascending (the default), date
    /// descending, or display name. Scripts without a readable file
    /// date sort as the oldest.
    private func sortedScripts(_ scripts: [StoredScript]) -> [StoredScript] {
        switch sharedSettings.fileSort {
        case "timeDesc":
            return scripts.sorted {
                date(of: $0) ?? Date.distantPast > date(of: $1) ?? Date.distantPast
            }
        case "name":
            return scripts.sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        default:
            return scripts.sorted {
                date(of: $0) ?? Date.distantPast < date(of: $1) ?? Date.distantPast
            }
        }
    }

    private func date(of script: StoredScript) -> Date? {
        fileUpdatedDate(fileName: script.fileName, in: store.scriptsDirectory)
    }

    private var enabledCount: Int { store.scripts.filter { $0.isEnabled }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                searchField
                segmentControl
                actionRow
                libraryHeader
                scriptContainer
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.navScripts))
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 8) {
                    Button(action: { store.refresh() }) {
                        Image(systemName: "arrow.clockwise")
                            .font(.subheadline)
                            .foregroundColor(.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(OMDesign.cardBackground)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    Menu {
                        Button(lang.text(.newScript)) { showingNewScriptEditor = true }
                        Button(lang.text(.installFromAnywhere)) { showingInstall = true }
                    } label: {
                        Image(systemName: "plus")
                            .font(.subheadline)
                            .foregroundColor(.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(OMDesign.cardBackground)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(isPresented: $showingNewScriptEditor) {
            NavigationView { EditorView() }
        }
        .sheet(isPresented: $showingInstall) {
            NavigationView { InstallView() }
        }
        .alert(lang.text(.updateCheckTitle), isPresented: $showingUpdateSummary) {
            Button(lang.text(.ok), role: .cancel) { }
        } message: {
            Text(updateSummary)
        }
        .onAppear {
            store.refresh()
            sharedSettings.refresh()
        }
    }

    // MARK: - Sections

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            TextField(lang.text(.searchScripts), text: $searchText)
                .autocapitalization(.none)
                .disableAutocorrection(true)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var segmentControl: some View {
        HStack(spacing: 4) {
            ForEach(Segment.allCases, id: \.self) { item in
                Button { segment = item } label: {
                    Text(segmentTitle(item))
                        .font(.subheadline)
                        .fontWeight(segment == item ? .semibold : .regular)
                        .foregroundColor(segment == item ? .primary : .secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(segment == item ? OMDesign.capsuleBackground : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            Button(lang.text(.checkForUpdates)) { checkAllForUpdates() }
                .buttonStyle(.bordered)
            Button(lang.text(.newScript)) { showingNewScriptEditor = true }
                .buttonStyle(.borderedProminent)
            Button(lang.text(.navInstall)) { showingInstall = true }
                .buttonStyle(.bordered)
        }
        .font(.subheadline)
    }

    private var libraryHeader: some View {
        HStack {
            Text(lang.text(.library))
                .font(.headline)
            Text(lang.format(.enabledCount, enabledCount, store.scripts.count))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(OMDesign.brand)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(OMDesign.brand.opacity(0.12))
                .clipShape(Capsule())
            Spacer()
            Button(lang.text(.enableAllShown)) { setShownEnabled(true) }
                .font(.subheadline)
            Button(lang.text(.disableAllShown)) { setShownEnabled(false) }
                .font(.subheadline)
        }
    }

    private var scriptContainer: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(groupedScripts, id: \.title) { group in
                if !group.scripts.isEmpty {
                    sectionLabel(group.title, count: group.scripts.count)
                    ForEach(group.scripts, id: \.fileName) { script in
                        ScriptRow(script: script)
                        if script.fileName != group.scripts.last?.fileName {
                            Divider().padding(.leading, 52)
                        }
                    }
                }
            }
            if filteredScripts.isEmpty {
                Text(emptyMessage)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(OMDesign.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var groupedScripts: [(title: String, scripts: [StoredScript])] {
        [
            (lang.text(.groupUserscripts), filteredScripts.filter { !isUserstyle($0) }),
            (lang.text(.groupUserstyles), filteredScripts.filter { isUserstyle($0) }),
        ]
    }

    private func isUserstyle(_ script: StoredScript) -> Bool {
        script.fileName.hasSuffix(".user.css")
    }

    private var emptyMessage: String {
        switch segment {
        case .activated: return lang.text(.emptyActivated)
        case .stopped: return lang.text(.emptyStopped)
        case .featured: return lang.text(.emptyFeatured)
        }
    }

    private func sectionLabel(_ title: String, count: Int) -> some View {
        HStack(spacing: 6) {
            Text(title.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
            Text("\(count)")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(OMDesign.brand)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(OMDesign.brand.opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    // MARK: - Actions

    private func setShownEnabled(_ enabled: Bool) {
        for script in filteredScripts where script.isEnabled != enabled {
            store.setEnabled(enabled, for: script.fileName)
        }
    }

    /// Checks every shown script that declares an update URL, then
    /// reports the results in one alert. The check only reads; nothing
    /// is installed from here — updating happens in the detail page.
    private func checkAllForUpdates() {
        let candidates = filteredScripts.filter {
            updateURL(of: store.metadata(for: $0.fileName)) != nil
        }
        guard !candidates.isEmpty else {
            updateSummary = lang.text(.updateNoneDeclare)
            showingUpdateSummary = true
            return
        }
        var results: [String] = []
        var pending = candidates.count
        for script in candidates {
            guard let metadata = store.metadata(for: script.fileName),
                  let urlString = updateURL(of: metadata),
                  let url = URL(string: urlString) else {
                pending -= 1
                continue
            }
            URLSession.shared.dataTask(with: url) { data, _, _ in
                DispatchQueue.main.async {
                    if let data = data,
                       let source = String(data: data, encoding: .utf8),
                       let remote = MetadataParser.tryParse(source: source),
                       isNewerVersion(remote.version, than: metadata.version) {
                        results.append(lang.format(.updateAvailable, script.name, remote.version))
                    }
                    pending -= 1
                    if pending == 0 {
                        updateSummary = results.isEmpty
                            ? lang.text(.updateAllUpToDate)
                            : results.joined(separator: "\n")
                        showingUpdateSummary = true
                    }
                }
            }.resume()
        }
        if pending == 0 {
            updateSummary = lang.text(.updateAllUpToDate)
            showingUpdateSummary = true
        }
    }
}

/// One script row: icon, bold name, one-line description, the
/// status bottom line, and a green switch. Tapping anywhere except
/// the switch opens the detail page.
///
/// v0.4.0: the text column has `.layoutPriority(1)` and the Toggle is
/// fixed-size, so the Toggle can never squeeze the text; the name and
/// description are each one line with tail truncation, so a long
/// unbroken description is cut once with an ellipsis instead of
/// wrapping mid-word.
private struct ScriptRow: View {

    @EnvironmentObject private var store: ScriptStore
    var script: StoredScript

    var body: some View {
        NavigationLink(destination: ScriptDetailView(script: script)) {
            HStack(spacing: 12) {
                ScriptIconView(name: script.name)
                VStack(alignment: .leading, spacing: 3) {
                    Text(script.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    ScriptStatusLine(
                        isEnabled: script.isEnabled,
                        version: metadata?.version ?? script.version,
                        updated: fileUpdatedDate(
                            fileName: script.fileName, in: store.scriptsDirectory)
                    )
                }
                .layoutPriority(1)
                Toggle("", isOn: Binding(
                    get: { script.isEnabled },
                    set: { store.setEnabled($0, for: script.fileName) }
                ))
                .labelsHidden()
                .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }

    private var metadata: UserscriptMetadata? {
        store.metadata(for: script.fileName)
    }

    private var description: String {
        if let description = metadata?.description, !description.isEmpty {
            return description
        }
        return script.fileName
    }
}

#if DEBUG
struct LibraryView_Previews: PreviewProvider {
    static var previews: some View {
        LibraryView()
            .environmentObject(ScriptStore())
            .environmentObject(OMLanguageManager())
            .environmentObject(OMSharedSettings())
    }
}
#endif