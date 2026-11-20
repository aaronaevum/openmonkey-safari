import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// OpenMonkey for Safari — the host app.
///
/// The host app is where scripts are managed: installed, edited, enabled
/// and deleted. The Safari Web Extension itself (see
/// `Extension/SafariWebExtensionHandler.swift` and the web extension in
/// `extension/`) does the in-page work; it reads the same scripts from the
/// shared App Group container. The app therefore never needs to be running
/// for scripts to work in Safari — it only needs to have saved them.
///
/// v0.5.0: two tabs only — 首页 (Home) and 我的 (My) — with a FLOATING
/// pill tab bar, like the reference Addons app: a dark translucent
/// capsule centred near the bottom edge, the active tab highlighted as
/// a darker inner pill. The reference itself uses this pill, so the
/// v0.3.0 bug was never the pill — it was content hiding under it.
///
/// v0.5.1: the pill strip is reserved in the layout flow — a
/// `VStack` puts the tab content above the pill container (see
/// `body`), so the pill sits above the Home Indicator on every
/// device and no scroll view's frame ever extends under it, at any
/// scroll position. No scroll view carries its own bottom padding
/// for the pill any more — v0.5.0's fixed 116pt clearance was wrong
/// on every device (the pill is ~64pt tall, so ~98pt was needed and
/// 116pt left a ~34pt band of empty page background below the last
/// card). The root view also carries the page background through
/// the safe areas, so the Home Indicator strip is the page colour
/// instead of the window default (black in dark mode).
///
/// Both tabs stay mounted (a `ZStack` with an opacity switch) so each
/// tab's `NavigationView` stack is preserved when switching; the hidden
/// tab is disabled and hidden from accessibility so it cannot receive
/// taps. The app's appearance follows the Dark Mode setting
/// (`OMSharedSettings.appColorScheme`); App Lock, when enabled, covers
/// the whole UI with a lock screen on launch and on foregrounding
/// until Face ID / Touch ID / passcode succeeds.
@main
struct OpenMonkeyApp: App {

    /// The single shared store, owned here and passed down through the
    /// environment so Home, Library, Editor and Settings all see the same data.
    @StateObject private var store = ScriptStore()

    /// The app language (v0.4.0): persisted in the App Group suite,
    /// observed by every view so a change re-renders instantly.
    @StateObject private var languageManager = OMLanguageManager()

    /// The shared settings (v0.5.0): every toggle on Home and in the
    /// sub-pages reads/writes the App Group suite through this object,
    /// so the extension sees the same values.
    @StateObject private var sharedSettings = OMSharedSettings()

    /// App Lock state (v0.5.0): locked on launch / foreground when
    /// the setting is on, unlocked only by a successful biometric or
    /// passcode prompt.
    @StateObject private var appLock = OMAppLock()

    @State private var selectedTab: Tab = .home

    private enum Tab {
        case home
        case my
    }

    var body: some Scene {
        WindowGroup {
            // v0.5.2 — THE REAL v0.5.1 BUG, found from Aaron's
            // 19:11 real-device shot (measured, not guessed): the
            // root VStack never filled the window. With no size
            // constraint it sized to its children's ideal heights
            // (~589pt) and SwiftUI CENTRED it vertically in the
            // 926pt window — nav title at ~198pt instead of ~70pt,
            // ~122pt black bands top and bottom, the pill floating
            // mid-screen, the ScrollView viewport only ~460pt tall
            // so the 3rd card sat under the pill at scroll-top.
            // v0.5.1's VStack-flow pill fix was real but irrelevant:
            // it arranged children inside a box that itself floated.
            // The HTML previews could never catch this — they render
            // a mock in a 926pt-tall box by construction, not the
            // SwiftUI layout. From v0.5.2 on, delivery requires a
            // real simulator screenshot (see
            // .github/workflows/screenshot-sim.yml).
            //
            // The fix is a forced fill: the GeometryReader takes the
            // window, the VStack is forced to its full size, the
            // ZStack and both tabs are forced to fill it, so the
            // NavigationView's bar sits at the top and the pill at
            // the bottom on every device. The pill's bottom padding
            // is the 18pt visual gap PLUS the real bottom safe area
            // read from the GeometryReader, so it sits above the
            // Home Indicator instead of inside it.
            GeometryReader { geometry in
                VStack(spacing: 0) {
                    ZStack {
                        HomeView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .opacity(selectedTab == .home ? 1 : 0)
                            .disabled(selectedTab != .home)
                            .accessibilityHidden(selectedTab != .home)
                        MyView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .opacity(selectedTab == .my ? 1 : 0)
                            .disabled(selectedTab != .my)
                            .accessibilityHidden(selectedTab != .my)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    floatingTabBar
                        .padding(.bottom,
                                 OMDesign.tabBarFloatGap + geometry.safeAreaInsets.bottom)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(OMDesign.pageBackground.ignoresSafeArea())
            }
            .environmentObject(store)
            .environmentObject(languageManager)
            .environmentObject(sharedSettings)
            .environment(\.locale, languageManager.locale)
            .preferredColorScheme(sharedSettings.appColorScheme)
            .overlay {
                if sharedSettings.appLockEnabled && appLock.locked {
                    LockView(appLock: appLock)
                }
            }
            .onAppear {
                store.refresh()
                sharedSettings.refresh()
                languageManager.refresh()
                appLock.refresh(settings: sharedSettings)
            }
            .onReceive(foregroundNotification) { _ in
                sharedSettings.refresh()
                languageManager.refresh()
                appLock.refresh(settings: sharedSettings)
            }
        }
    }

    /// The foreground notification on this platform, so the lock
    /// re-engages (and settings re-read) whenever the app comes back.
    private var foregroundNotification: NotificationCenter.Publisher {
        #if os(iOS)
        return NotificationCenter.default.publisher(
            for: UIApplication.willEnterForegroundNotification)
        #elseif os(macOS)
        return NotificationCenter.default.publisher(
            for: NSApplication.willBecomeActiveNotification)
        #else
        return NotificationCenter.default.publisher(for: Notification.Name("OMForeground"))
        #endif
    }

    /// The floating pill tab bar: a translucent capsule with two tabs
    /// (house + 首页, list + 我的）. The active tab sits in a darker
    /// inner pill (`secondarySystemBackground`: near-black in dark
    /// mode, white in light mode); the inactive tab is secondary text.
    /// The bar is the bottom child of the root `VStack` — the tab
    /// content's frame ends above it, so nothing is ever hidden
    /// behind it at any scroll position, and no view adds its own
    /// bottom padding for it (v0.5.1).
    private var floatingTabBar: some View {
        HStack(spacing: 4) {
            pillButton(.home, titleKey: .tabHome, systemImage: "house")
            pillButton(.my, titleKey: .tabMy, systemImage: "line.3.horizontal")
        }
        .padding(6)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: Color.black.opacity(0.18), radius: 10, x: 0, y: 4)
    }

    private func pillButton(_ tab: Tab, titleKey: OMTextKey, systemImage: String) -> some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: selectedTab == tab ? .semibold : .regular))
                Text(languageManager.text(titleKey))
                    .font(.caption2)
                    .fontWeight(selectedTab == tab ? .semibold : .regular)
            }
            .foregroundColor(selectedTab == tab ? .primary : .secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .padding(.horizontal, 24)
            .background(
                selectedTab == tab
                    ? OMDesign.pillActiveBackground : Color.clear)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// The App Lock screen: a full-screen cover with the app mark, a
/// title, and an Unlock button. Tapping Unlock prompts for Face ID /
/// Touch ID / passcode; the screen also prompts once on its own when
/// it appears, so the user usually only sees the system sheet. A
/// failed attempt shows an inline message and leaves the lock in
/// place — there is no way past it without authenticating.
private struct LockView: View {
    @EnvironmentObject private var lang: OMLanguageManager
    @ObservedObject var appLock: OMAppLock

    @State private var failed = false
    @State private var didPrompt = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle()
                    .fill(OMDesign.brand)
                    .frame(width: 88, height: 88)
                Image(systemName: "lock.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundColor(.white)
            }
            Text(lang.text(.lockTitle))
                .font(.title2)
                .fontWeight(.bold)
            Text(lang.text(.lockBody))
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button(lang.text(.lockButton)) { authenticate() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            if failed {
                Text(lang.text(.lockFailed))
                    .font(.subheadline)
                    .foregroundColor(.red)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OMDesign.pageBackground.ignoresSafeArea())
        .onAppear {
            guard !didPrompt else { return }
            didPrompt = true
            authenticate()
        }
    }

    private func authenticate() {
        appLock.authenticate { success in
            failed = !success
        }
    }
}
