import SwiftUI

/// The 我的 sub-pages (v0.5.0), built strictly to the reference
/// shots 4–7: centred title, circle back button top-left, dark
/// grouped cards with hairline-separated rows, segmented pills for
/// the multi-way choices, green toggles.
///
/// Every row is real:
/// * 通用设置 — dark-mode mode (drives the web dark mode via the
///   `darkMode` key and the app's own appearance override), smart
///   search trigger position, language, dark editor, and App Lock
///   (a real LocalAuthentication lock — see `OMAppLock`).
/// * 任务设置 — file sort (actually sorts the library), confirmation
///   popups (gates the delete confirmation and install prompts),
///   sniff button / long-press sniff. 允许使用移动网络 is deliberately
///   omitted: update checks run over whatever network is available
///   and the app has no way to gate them, so the row would be fake.
/// * 同步 — settings sync only (never scripts), via
///   `NSUbiquitousKeyValueStore`; 立即同步 pushes now and shows the
///   last-sync time. It is labelled 同步, not iCloud同步， because the
///   transport is iCloud key-value storage and the scope is settings.
/// * 清理数据 — only 临时数据 has a real deletable backing in the app
///   (tmp + Caches). 导入文件 / 网页数据 / 任务数据 / 图片数据 are
///   deliberately omitted: imports are read directly and never
///   staged, extension web data lives in Safari's profile, GM storage
///   lives in the extension's chrome.storage.local, and no image
///   cache exists on disk — see `OMStorage`. The button deletes the
///   selected categories for real and reports the freed bytes; 空间占用
///   is the measured size of scripts + temp + caches, never hardcoded.
///
/// v0.5.1: the floating-pill clearance is reserved in the layout
/// flow (root `VStack` in `OpenMonkeyApp`) — no page here adds its
/// own bottom padding for the pill (the old fixed 116pt is gone).
/// Every string comes from the localization table.
struct GeneralSettingsView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.darkModeRow)) {
                        OMSegmentedPill(
                            options: [
                                ("auto", lang.text(.darkAuto)),
                                ("light", lang.text(.darkLight)),
                                ("dark", lang.text(.darkDark)),
                            ],
                            selection: sharedSettings.darkModeBinding)
                    }
                    Divider()
                    OMGroupedRow(title: lang.text(.triggerRow)) {
                        OMSegmentedPill(
                            options: [
                                ("prefix", lang.text(.triggerPrefix)),
                                ("suffix", lang.text(.triggerSuffix)),
                            ],
                            selection: sharedSettings.smartSearchTriggerBinding)
                    }
                    Divider()
                    OMGroupedRow(title: lang.text(.language)) {
                        OMSegmentedPill(
                            options: [
                                ("system", lang.text(.languageSystem)),
                                ("zh", lang.text(.languageChinese)),
                                ("en", lang.text(.languageEnglish)),
                            ],
                            selection: $lang.selection)
                    }
                    Divider()
                    OMGroupedRow(title: lang.text(.appLockRow)) {
                        Toggle("", isOn: sharedSettings.appLockEnabledBinding)
                            .labelsHidden()
                    }
                    Divider()
                    OMGroupedRow(title: lang.text(.generalCodeEditor)) {
                        Toggle("", isOn: sharedSettings.darkEditorBinding)
                            .labelsHidden()
                    }
                }
                Text(lang.text(.appLockNote))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
                Text(lang.text(.editorFootnote))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.myGeneral))
        .onAppear {
            sharedSettings.refresh()
            lang.refresh()
        }
    }
}

struct TaskSettingsView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    private func sortLabel(_ sort: String) -> String {
        switch sort {
        case "timeDesc": return lang.text(.sortTimeDesc)
        case "name": return lang.text(.sortName)
        default: return lang.text(.sortTimeAsc)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.fileSortRow)) {
                        Menu {
                            Button(lang.text(.sortTimeAsc)) { sharedSettings.setFileSort("timeAsc") }
                            Button(lang.text(.sortTimeDesc)) { sharedSettings.setFileSort("timeDesc") }
                            Button(lang.text(.sortName)) { sharedSettings.setFileSort("name") }
                        } label: {
                            HStack(spacing: 4) {
                                Text(sortLabel(sharedSettings.fileSort))
                                    .foregroundColor(.secondary)
                                Image(systemName: "chevron.right")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.showPromptsRow)) {
                        Toggle("", isOn: sharedSettings.showPromptPopupsBinding)
                            .labelsHidden()
                    }
                }
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.showSniffButtonRow)) {
                        Toggle("", isOn: sharedSettings.showSniffButtonBinding)
                            .labelsHidden()
                    }
                    Divider()
                    OMGroupedRow(title: lang.text(.longPressSniffRow)) {
                        Toggle("", isOn: sharedSettings.longPressSniffBinding)
                            .labelsHidden()
                    }
                }
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.myTasks))
        .onAppear { sharedSettings.refresh() }
    }
}

struct SyncSettingsView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var statusMessage = ""

    private var lastSyncText: String {
        guard let date = sharedSettings.lastSyncDate else {
            return lang.text(.lastSyncNever)
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return lang.format(.lastSyncFormat, formatter.string(from: date))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(lang.text(.enableSyncRow))
                                .font(.body)
                                .layoutPriority(1)
                            Spacer()
                            Toggle("", isOn: sharedSettings.syncEnabledBinding)
                                .labelsHidden()
                                .fixedSize()
                        }
                        Text(lang.text(.syncDesc))
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                OMGroupedCard {
                    Button { syncNow() } label: {
                        HStack {
                            Text(lang.text(.syncNowRow))
                                .font(.body)
                                .foregroundColor(.primary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                }
                if !statusMessage.isEmpty {
                    Text(statusMessage)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                }
                Text(lastSyncText)
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.mySync))
        .onAppear { sharedSettings.refresh() }
    }

    /// Pushes the current settings to iCloud key-value storage now
    /// and reports the result, including the new last-sync time.
    /// Works even when the sync toggle is off (a one-off push).
    private func syncNow() {
        let ok = sharedSettings.pushToCloud()
        if ok {
            statusMessage = lang.text(.syncDone)
        } else {
            statusMessage = lang.text(.syncUnavailable)
        }
    }
}

struct CleanupView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var store: ScriptStore

    @State private var includeTemp = true
    @State private var usedBytes: Int64 = 0
    @State private var resultMessage = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.cleanTempRow)) {
                        Toggle("", isOn: $includeTemp)
                            .labelsHidden()
                    }
                }
                OMGroupedCard {
                    Button { clearData() } label: {
                        Text(lang.text(.cleanButton))
                            .font(.body)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                }
                if !resultMessage.isEmpty {
                    Text(resultMessage)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                }
                Text(lang.text(.cleanFootnote))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
                OMSectionHeader(title: lang.text(.storageSection))
                OMGroupedCard {
                    HStack {
                        Text(lang.text(.storageSizeRow))
                            .font(.body)
                            .layoutPriority(1)
                        Spacer()
                        Text(OMStorage.formatted(usedBytes))
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.myCleanup))
        .onAppear { measure() }
    }

    private func measure() {
        usedBytes = OMStorage.usedBytes(scriptsDirectory: store.scriptsDirectory)
    }

    /// Deletes the selected categories for real and reports the freed
    /// bytes. Only temporary data is selectable (see `OMStorage` for
    /// why the other reference rows are omitted).
    private func clearData() {
        guard includeTemp else {
            resultMessage = lang.text(.cleanNothing)
            return
        }
        let freed = OMStorage.clearTemporaryData()
        if freed > 0 {
            resultMessage = lang.format(.cleanDoneFormat, OMStorage.formatted(freed))
        } else {
            resultMessage = lang.text(.cleanNothing)
        }
        measure()
    }
}

struct PrivacyView: View {

    @EnvironmentObject private var lang: OMLanguageManager

    var body: some View {
        ScrollView {
            Text(lang.text(.privacyBody))
                .font(.body)
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.myPrivacy))
    }
}

struct AboutView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    HStack {
                        Text(lang.text(.version))
                            .font(.body)
                        Spacer()
                        Text(lang.format(.versionFormat, "0.5.1"))
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                OMGroupedCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(lang.text(.aboutBody))
                            .font(.body)
                        Text(lang.text(.licenseText))
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                OMGroupedCard {
                    VStack(alignment: .leading, spacing: 0) {
                        Link(lang.text(.linkGitHub),
                             destination: URL(string: "https://github.com/aaronaevum/openmonkey-safari")!)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                        Divider()
                        Link(lang.text(.linkGreasyFork),
                             destination: URL(string: "https://greasyfork.org/")!)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                    }
                }
                OMGroupedCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(lang.text(.enableStepsIntro))
                            .font(.body)
                        VStack(alignment: .leading, spacing: 6) {
                            step(number: 1, text: lang.text(.enableStep1))
                            step(number: 2, text: lang.text(.enableStep2))
                            step(number: 3, text: lang.text(.enableStep3))
                            step(number: 4, text: lang.text(.enableStep4))
                        }
                        .font(.footnote)
                        Text(lang.text(.enableMacOS))
                            .font(.footnote)
                            .foregroundColor(.secondary)
                        Text(lang.text(.enableMatchNote))
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                OMGroupedCard {
                    HStack {
                        Text(lang.text(.scriptsFolder))
                            .font(.body)
                        Spacer()
                        Text(store.isUsingSharedContainer
                             ? lang.text(.sharedWithSafari) : lang.text(.appOnly))
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    Divider()
                    HStack {
                        Text(lang.text(.installedScripts))
                            .font(.body)
                        Spacer()
                        Text("\(store.scripts.count)")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.myAbout))
        .onAppear {
            store.refresh()
            sharedSettings.refresh()
        }
    }

    private func step(number: Int, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(number).")
                .fontWeight(.semibold)
            Text(text)
        }
    }
}

#if DEBUG
struct SettingsPages_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            GeneralSettingsView()
        }
        .environmentObject(ScriptStore())
        .environmentObject(OMLanguageManager())
        .environmentObject(OMSharedSettings())
    }
}
#endif
