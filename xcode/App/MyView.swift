import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// 我的 tab (v0.5.0), built to reference shot 3: centred title 我的，
/// section headers 基础设置 / 支持与帮助 / 关于， grouped dark cards,
/// rows = coloured rounded-square icon + title + right chevron (+ grey
/// value text). The rows are OpenMonkey's real settings and links:
/// 基础设置 opens the General / Task / Sync / Cleanup sub-pages;
/// 支持与帮助 opens the GitHub issues page in Safari (feedback),
/// the repo in Safari so it can be starred (rate), and the iOS share
/// sheet with the repo link (share); 关于 opens the in-app privacy
/// policy and the About page (version 0.5.1 + repo link).
struct MyView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    @State private var showingShare = false
    @State private var shareNotice = ""

    var body: some View {
        #if os(iOS)
        content
            .sheet(isPresented: $showingShare) {
                ShareSheet(items: [shareText()])
            }
        #else
        content
        #endif
    }

    private var content: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    OMSectionHeader(title: lang.text(.sectionBasic))
                    OMGroupedCard {
                        myRow(
                            icon: "slider.horizontal.3",
                            iconColor: OMDesign.brand,
                            title: lang.text(.myGeneral),
                            destination: AnyView(GeneralSettingsView()))
                        Divider()
                        myRow(
                            icon: "square.grid.2x2.fill",
                            iconColor: Color(red: 0x30 / 255.0, green: 0x9B / 255.0, blue: 0xFF / 255.0),
                            title: lang.text(.myTasks),
                            destination: AnyView(TaskSettingsView()))
                        Divider()
                        myRow(
                            icon: "cloud.fill",
                            iconColor: Color(red: 0x5A / 255.0, green: 0xC8 / 255.0, blue: 0xFA / 255.0),
                            title: lang.text(.mySync),
                            destination: AnyView(SyncSettingsView()))
                        Divider()
                        myRow(
                            icon: "trash.fill",
                            iconColor: Color(red: 0xFF / 255.0, green: 0x59 / 255.0, blue: 0x48 / 255.0),
                            title: lang.text(.myCleanup),
                            destination: AnyView(CleanupView()))
                    }

                    OMSectionHeader(title: lang.text(.sectionSupport))
                    OMGroupedCard {
                        myActionRow(
                            icon: "message.fill",
                            iconColor: Color(red: 0xFF / 255.0, green: 0x9F / 255.0, blue: 0x0A / 255.0),
                            title: lang.text(.myFeedback),
                            action: { openURL("https://github.com/aaronaevum/openmonkey-safari/issues") })
                        Divider()
                        myActionRow(
                            icon: "star.fill",
                            iconColor: OMDesign.brand,
                            title: lang.text(.myRate),
                            action: { openURL("https://github.com/aaronaevum/openmonkey-safari") })
                        Divider()
                        myActionRow(
                            icon: "square.and.arrow.up.fill",
                            iconColor: OMDesign.switchGreen,
                            title: lang.text(.myShare),
                            action: { share() })
                    }
                    if !shareNotice.isEmpty {
                        Text(shareNotice)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 4)
                    }

                    OMSectionHeader(title: lang.text(.sectionAbout))
                    OMGroupedCard {
                        myRow(
                            icon: "lock.fill",
                            iconColor: Color(red: 0x8E / 255.0, green: 0x8E / 255.0, blue: 0x93 / 255.0),
                            title: lang.text(.myPrivacy),
                            destination: AnyView(PrivacyView()))
                        Divider()
                        myRow(
                            icon: "info",
                            iconColor: Color(red: 0x30 / 255.0, green: 0x9B / 255.0, blue: 0xFF / 255.0),
                            title: lang.text(.myAbout),
                            value: lang.format(.versionFormat, "0.5.1"),
                            destination: AnyView(AboutView()))
                    }
                }
                .padding(16)
            }
            .background(OMDesign.pageBackground)
            .navigationTitle(lang.text(.navMy))
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                store.refresh()
                sharedSettings.refresh()
                lang.refresh()
            }
        }
    }

    /// The share action: the iOS share sheet on iOS; on macOS the
    /// link is copied to the clipboard (there is no share sheet API
    /// in the same form) and a short notice confirms it.
    private func share() {
        #if os(iOS)
        showingShare = true
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(shareText(), forType: .string)
        shareNotice = lang.text(.copied)
        #endif
    }

    /// The text shared with friends: the localized one-line pitch
    /// plus the repo link (a URL is user content, never translated).
    private func shareText() -> String {
        lang.text(.shareMessage) + "https://github.com/aaronaevum/openmonkey-safari"
    }

    private func openURL(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        #if os(iOS)
        UIApplication.shared.open(url)
        #elseif os(macOS)
        NSWorkspace.shared.open(url)
        #endif
    }

    /// A row that pushes a sub-page: icon + title + grey value +
    /// chevron.
    private func myRow(
        icon: String, iconColor: Color, title: String, value: String? = nil,
        destination: AnyView
    ) -> some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 12) {
                OMRowIconView(systemImage: icon, color: iconColor)
                Text(title)
                    .font(.body)
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer()
                if let value = value {
                    Text(value)
                        .font(.body)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Image(systemName: "chevron.right")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
    }

    /// A row that runs an action (open in Safari / share sheet):
    /// icon + title + chevron.
    private func myActionRow(
        icon: String, iconColor: Color, title: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                OMRowIconView(systemImage: icon, color: iconColor)
                Text(title)
                    .font(.body)
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
    }
}

/// The iOS share sheet, wrapped for SwiftUI. Used by 分享给朋友.
#if os(iOS)
private struct ShareSheet: UIViewControllerRepresentable {
    var items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {
    }
}
#endif

#if DEBUG
struct MyView_Previews: PreviewProvider {
    static var previews: some View {
        MyView()
            .environmentObject(ScriptStore())
            .environmentObject(OMLanguageManager())
            .environmentObject(OMSharedSettings())
    }
}
#endif
