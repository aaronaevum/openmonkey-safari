import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// The feature pages reached from the Home cards (v0.5.0): the
/// custom ad-rules editor, the smart-search engine/trigger editor,
/// and the detected-media list. All three read and write the shared
/// App Group suite through `OMSharedSettings` / `OMResourceStore`,
/// so the extension sees the same values; all carry the reference
/// sub-page chrome (centred title, circle back button). v0.5.1: the
/// pill strip is reserved in the layout flow (root `VStack` in
/// `OpenMonkeyApp`), so no page here adds its own bottom padding
/// for it.

struct AdRulesView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var newRule = ""
    @State private var notice = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if sharedSettings.customAdRules.isEmpty {
                    Text(lang.text(.adRulesEmpty))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                } else {
                    OMGroupedCard {
                        ForEach(sharedSettings.customAdRules, id: \.self) { rule in
                            HStack {
                                Text(rule)
                                    .font(.system(.body, design: .monospaced))
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .layoutPriority(1)
                                Spacer()
                                Button {
                                    var rules = sharedSettings.customAdRules
                                    rules.removeAll { $0 == rule }
                                    sharedSettings.setCustomAdRules(rules)
                                } label: {
                                    Image(systemName: "trash")
                                        .foregroundColor(.red)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            if rule != sharedSettings.customAdRules.last {
                                Divider()
                            }
                        }
                    }
                }
                OMGroupedCard {
                    HStack(spacing: 10) {
                        TextField(lang.text(.adRulesPlaceholder), text: $newRule)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                            .layoutPriority(1)
                        Button(lang.text(.adRulesAdd)) { addRule() }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                if !notice.isEmpty {
                    Text(notice)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.horizontal, 4)
                }
                Text(lang.text(.adRulesFootnote))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.adRulesTitle))
        .onAppear { sharedSettings.refresh() }
    }

    private func addRule() {
        let rule = newRule.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rule.isEmpty, !rule.contains(" ") else {
            notice = lang.text(.adRulesInvalid)
            return
        }
        guard !sharedSettings.customAdRules.contains(rule) else {
            newRule = ""
            notice = ""
            return
        }
        var rules = sharedSettings.customAdRules
        rules.append(rule)
        sharedSettings.setCustomAdRules(rules)
        newRule = ""
        notice = ""
    }
}

struct SmartSearchView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var newName = ""
    @State private var newTrigger = ""
    @State private var newURL = ""
    @State private var notice = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OMGroupedCard {
                    OMGroupedRow(title: lang.text(.triggerRow)) {
                        OMSegmentedPill(
                            options: [
                                ("prefix", lang.text(.triggerPrefix)),
                                ("suffix", lang.text(.triggerSuffix)),
                            ],
                            selection: sharedSettings.smartSearchTriggerBinding)
                    }
                }
                OMGroupedCard {
                    ForEach(sharedSettings.smartSearchEngines) { engine in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(engine.name)
                                    .font(.body)
                                    .fontWeight(.semibold)
                                    .layoutPriority(1)
                                Spacer()
                                Text(engine.trigger)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(OMDesign.brand)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(OMDesign.brand.opacity(0.12))
                                    .clipShape(Capsule())
                                Button {
                                    var engines = sharedSettings.smartSearchEngines
                                    engines.removeAll { $0.id == engine.id }
                                    sharedSettings.setSmartSearchEngines(engines)
                                } label: {
                                    Image(systemName: "trash")
                                        .foregroundColor(.red)
                                }
                                .buttonStyle(.plain)
                            }
                            Text(engine.url)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        if engine.id != sharedSettings.smartSearchEngines.last?.id {
                            Divider()
                        }
                    }
                }
                OMGroupedCard {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField(lang.text(.engineName), text: $newName)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                        TextField(lang.text(.engineTrigger), text: $newTrigger)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                        TextField(lang.text(.engineURL), text: $newURL)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                        HStack {
                            Spacer()
                            Button(lang.text(.addEngine)) { addEngine() }
                                .buttonStyle(.borderedProminent)
                            Button(lang.text(.resetEngines)) {
                                sharedSettings.setSmartSearchEngines(OMSearchEngine.defaults)
                                notice = ""
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                if !notice.isEmpty {
                    Text(notice)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .padding(.horizontal, 4)
                }
                Text(lang.text(.smartSearchFootnote))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.smartSearchTitle))
        .onAppear { sharedSettings.refresh() }
    }

    private func addEngine() {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trigger = newTrigger.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = newURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !trigger.isEmpty, !url.contains(" "),
              url.contains("{q}"), URL(string: url.replacingOccurrences(of: "{q}", with: "test")) != nil else {
            notice = lang.text(.engineInvalid)
            return
        }
        var engines = sharedSettings.smartSearchEngines
        engines.append(OMSearchEngine(
            id: UUID().uuidString, name: name, trigger: trigger, url: url))
        sharedSettings.setSmartSearchEngines(engines)
        newName = ""
        newTrigger = ""
        newURL = ""
        notice = ""
    }
}

struct ResourcesView: View {

    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var resources: [OMDetectedResource] = []
    @State private var notice = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !sharedSettings.resourceDetectionEnabled {
                    Text(lang.text(.resourcesDetectionOff))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                } else if resources.isEmpty {
                    Text(lang.text(.resourcesEmpty))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                } else {
                    OMGroupedCard {
                        ForEach(resources) { resource in
                            resourceRow(resource)
                            if resource.id != resources.last?.id {
                                Divider()
                            }
                        }
                    }
                }
                if !notice.isEmpty {
                    Text(notice)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                }
            }
            .padding(16)
        }
        .background(OMDesign.pageBackground)
        .omSubPage(title: lang.text(.cardResourcesTitle))
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { reload() }) {
                    Image(systemName: "arrow.clockwise")
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
        .onAppear {
            sharedSettings.refresh()
            reload()
        }
    }

    private func reload() {
        resources = OMResourceStore.load()
    }

    private func typeLabel(_ type: String) -> String {
        switch type.lowercased() {
        case "video": return lang.text(.resourcesTypeVideo)
        case "audio": return lang.text(.resourcesTypeAudio)
        case "image": return lang.text(.resourcesTypeImage)
        default: return lang.text(.resourcesTypeOther)
        }
    }

    private func typeIcon(_ type: String) -> String {
        switch type.lowercased() {
        case "video": return "film.fill"
        case "audio": return "waveform"
        case "image": return "photo.fill"
        default: return "doc.fill"
        }
    }

    private func resourceRow(_ resource: OMDetectedResource) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: typeIcon(resource.type))
                    .font(.subheadline)
                    .foregroundColor(OMDesign.brand)
                    .frame(width: 28, height: 28)
                    .background(OMDesign.brand.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 2) {
                    Text(resource.title?.isEmpty == false ? resource.title! : resource.url)
                        .font(.body)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(typeLabel(resource.type))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .layoutPriority(1)
            }
            if let pageURL = resource.pageURL, !pageURL.isEmpty {
                Text(lang.text(.resourcesFrom) + " " + pageURL)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            HStack(spacing: 8) {
                Button(lang.text(.resourcesSave)) { save(resource) }
                    .buttonStyle(.borderedProminent)
                Button(lang.text(.resourcesCopyLink)) { copyLink(resource) }
                    .buttonStyle(.bordered)
            }
            .font(.subheadline)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func copyLink(_ resource: OMDetectedResource) {
        #if os(iOS)
        UIPasteboard.general.string = resource.url
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(resource.url, forType: .string)
        #endif
        notice = lang.text(.resourcesCopiedLink)
    }

    /// Downloads the media over HTTP(S) and saves it into
    /// Documents/Resources/. Blob/data URLs cannot be downloaded by
    /// the app and report a failure honestly.
    private func save(_ resource: OMDetectedResource) {
        guard let url = URL(string: resource.url),
              url.scheme == "http" || url.scheme == "https" else {
            notice = lang.format(.resourcesSaveFailed, resource.url)
            return
        }
        URLSession.shared.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.notice = self.lang.format(
                        .resourcesSaveFailed, error.localizedDescription)
                    return
                }
                guard let data = data, !data.isEmpty else {
                    self.notice = self.lang.format(
                        .resourcesSaveFailed, resource.url)
                    return
                }
                let manager = FileManager.default
                let directory = manager.urls(
                    for: .documentDirectory, in: .userDomainMask)[0]
                    .appendingPathComponent("Resources", isDirectory: true)
                do {
                    try manager.createDirectory(
                        at: directory, withIntermediateDirectories: true, attributes: nil)
                    let fileName = url.lastPathComponent.isEmpty
                        ? "downloaded-media" : url.lastPathComponent
                    let target = directory.appendingPathComponent(fileName)
                    try data.write(to: target, options: .atomic)
                    self.notice = self.lang.format(.resourcesSavedFormat, fileName)
                } catch let saveError {
                    self.notice = self.lang.format(
                        .resourcesSaveFailed, saveError.localizedDescription)
                }
            }
        }.resume()
    }
}

#if DEBUG
struct FeaturePages_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            AdRulesView()
        }
        .environmentObject(OMLanguageManager())
        .environmentObject(OMSharedSettings())
    }
}
#endif
