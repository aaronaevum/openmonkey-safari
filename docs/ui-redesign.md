# OpenMonkey UI redesign (v0.5.0 — rebuilt strictly to the Addons reference)

> Rebuild note (2026-11-20): the repository was deleted and recreated clean at v0.5.3. The converter-template IPA workflow (`build-ipa.yml`), the TestFlight placeholder (`testflight.yml`), `scripts/convert.sh`, and 34 unreferenced icon PNGs were removed; no code changed. This file is the iteration history of the redesign (v0.5.0–v0.5.3) as written at the time — earlier sections may mention files that no longer exist.

Aaron rejected v0.4.0 angrily ("你真的气死我了") — it still did not
look like Addons — and sent 7 screenshots of the real Addons app
(v5.3, dark mode, Chinese) with the order: build STRICTLY according
to these pictures, but not exactly identical (same layout/structure/
feel, OpenMonkey's own branding and real features, no copied
artwork). The 7 shots (in `~/workspace/user/files/`, 2026-11-16):
Home (2 shots, scrolled), 我的 tab, 通用设置， 任务设置，
iCloud同步， 清理数据. v0.5.0 rebuilds the host app screen-by-screen
to them and adds the features the Home cards promise, for real.
No code, text, or artwork was copied from Addons; the screenshots
are the layout authority only, and every icon is an SF Symbol drawn
by the app.

## v0.5.1 — screen-size / safe-area adaptation fix (NOT a redesign)

Aaron installed v0.5.0 and reported the app's displayed size does
not match the phone's visible area: layout misalignment, the bottom
tab bar covering content, unnecessary blank areas. No design,
style, icon, colour, font or feature changed here — only the layout
mechanics, plus one shortened description string (Defect 2 below).
The root causes were all in the same
open-loop scheme: v0.5.0 positioned the pill and cleared content
under it with fixed numbers that never read the device at all.

### Root causes (all found by a line-by-line audit; grep over
`xcode/` confirms zero reads of `safeAreaInsets` and zero
`GeometryReader`s anywhere in the app)

- **R1 — a fixed 116pt bottom clearance that is right on no
  device.** `Design.swift:93,97` defined
  `tabBarClearance = 116` and `tabBarClearanceExtra = 100`, used
  at 13 call sites (`HomeView.swift:160`, `MyView.swift:112`,
  `SettingsView.swift:91,155,229,304,343,442`,
  `FeaturePages.swift:84,210,276`, `LibraryView.swift:107`,
  `ScriptDetailView.swift:65`, `EditorView.swift:93`, plus the
  `omTabBarClearance()` helper at `Design.swift:1543`). The pill
  is ~64pt tall and floats 18pt above the safe-area bottom, so the
  clearance a scroll view actually needs above that same edge is
  ~64 + 18 + its own 16pt content padding ≈ 98pt — the fixed
  116pt over-reserves by ~34pt on *every* device, which is the
  band of empty page background the user saw below the last card.
  And a fixed number can never track the real pill height, which
  grows with Dynamic Type / language, so a larger-text pill could
  still overlap content. `LibraryView` used the full 116 while the
  others used 100 + 16 — the same total only by accident — and
  `PrivacyView` stacked 100 on top of a 20pt text padding (120pt
  total). Two constants inviting drift, one wrong value.
- **R2 — the pill was anchored to a layout edge, never to the
  safe area.** `OpenMonkeyApp.swift:69-76`: a
  `ZStack(alignment: .bottom)` with the pill as an overlay child
  plus `.padding(.bottom, 18)`. Nothing in that chain reads the
  device's bottom safe-area inset (notch / Dynamic Island / Home
  Indicator / none on a Home-button phone), and the pill's height
  is never measured — the 18pt float and the 116pt clearance in R1
  are two magic numbers that must agree with each other, with the
  real pill height, and with the real safe area, and they do not.
  On a small phone the 116pt is a larger fraction of the screen;
  on a large phone the pill floats further from the visible
  bottom edge. Any device that is not the one the numbers were
  tuned against shows either a gap or an overlap.
- **R3 — page backgrounds stopped at the safe-area edge.**
  Every screen did `.background(OMDesign.pageBackground)` on its
  `ScrollView` (or `VStack`), and the root `ZStack` in
  `OpenMonkeyApp.swift` had no background at all — so the strips
  outside the safe area (the Home Indicator strip at the bottom,
  and the status-bar strip at the top where the navigation bar
  does not cover it) showed the window's default background:
  black in dark mode, white in light mode, against the grouped
  page background. That is the black/white blank band, not
  content. `LockView` (`OpenMonkeyApp.swift`, `.background(...)`
  on a full-screen overlay) had the same gap.
- **R4 — the editor's 100pt dead band.** `EditorView.swift:93`
  gave a non-scrolling `VStack` (code editor + status bar)
  `.padding(.bottom, 100)` whenever it was pushed from the Home
  card (`HomeView.swift`, `EditorView(bottomClearance: true)`).
  Padding on a `VStack` squeezes the editor and leaves a 100pt
  empty band under the status bar with nothing in it — the worst
  single instance of the reported blank area — and the editor's
  root `VStack` had no background of its own, so the band showed
  the system background instead of the editor theme.
- **Checked and NOT defects (no change): top safe area; card
  widths; icon frames.** No fixed top padding exists anywhere
  (only `LibraryView.swift:106` `.padding(.top, 8)`, which is
  content spacing below the navigation bar, not safe-area
  compensation): the 首页 title and first card already respect
  the top safe area through the system `NavigationView` +
  `.navigationBarTitleDisplayMode(.inline)`, so no top padding
  was added or removed. Cards are already flexible width
  (`maxWidth: .infinity`, 16pt side margins, no `frame(width:
  390)` / `844` / `667` anywhere — grep finds no such literal).
  The remaining fixed `frame(width:height:)` values are icon
  glyph boxes only (44pt feature icon, 40pt script icon, 36pt
  back button, 30pt row icon, 28pt resource icon, 7pt status
  dot, 88pt lock circle) — legitimately fixed sizes, not layout
  widths. The only `.ignoresSafeArea` in the app is
  `EditorView.swift:246` `.ignoresSafeArea(.keyboard)`, which is
  keyboard-only and correct. No absolute positioning, no
  `offset(`/`position(`, no forced scaling anywhere.

### What the real-device problem shot shows

Primary problem reference (no further screenshots asked for):
`~/workspace/user/files/1D8C228C-…-DCCBD748-….jpg`, Aaron's phone,
2026-11-16 12:22 — the v0.3.0 rejection shot, Home in dark mode.
What is visible in it:

- A huge black void above the large "Home" title: the title sits
  about a third of the way down the screen, with nothing but black
  between the status bar and it.
- Cards invisible: black on black, no separation at all between a
  card and the page behind it (the v0.3.0 dark-mode bug).
- The Scripts description breaking mid-word across two lines:
  "Greasemonk ey/Tamper…".
- The floating pill tab bar overlapping the second card's "View
  help" capsule — only "…w help" peeks out at the right edge,
  behind the pill.
- The Install card cut off mid-way at the bottom edge (only its
  icon top and "Install" title visible).
- The lower ~third of the screen pure black void: no further card,
  no page background — the content does not fill the visible area
  and nothing fills the gap.

Contrast with the Addons reference Home shot
(`9A369D3B-…-0F8F58BA-….jpg`, 13:46, 首页）: centred inline title
immediately under the status bar, cards clearly separated from the
page, one-line descriptions, and content filling the screen to the
bottom edge (the next card already peeking out below the pill).
Note the reference pill itself floats *over* mid-scroll content —
it overlaps the 智能搜索 card's 查看帮助 while scrolling — so
overlap-while-scrolling is the reference behaviour. But Aaron's
explicit acceptance criterion for this app is
"不存在导航栏遮挡内容的情况" (no navigation bar covering content
at all), so transient overlap at launch is NOT acceptable here
either: v0.5.1 deliberately goes further than the reference and
reserves the pill strip in the layout flow, so no content can sit
under the pill at any scroll position (see Defect 1 below). The
pill still *looks* floating — capsule, translucent material,
18pt gap — only the content area ends above it.

Honest scoping: the problem shot is v0.3.0, so the invisible cards,
the mid-word break and the large title were already fixed in
v0.4.0/v0.5.0 and are not v0.5.1 work. What v0.5.1 takes from the
shot is the layout failure mode — the pill overlap, the cut-off
bottom card, and the top/bottom black voids (R1–R4 above). v0.5.0
answered the overlap with a fixed 116pt, which flipped it into
the opposite symptom (a blank band); v0.5.1 reserves the pill
strip in the layout flow and extends the background through the
safe areas, so the same shot retaken on v0.5.1 should show
the title under the status bar, every card separable from the
page, no card under the pill at any scroll position, and page
background (not black) wherever content ends short of the edge.

### What render verification caught (Defect 1 + Defect 2)

The first v0.5.1 fix was rendered at 5 real iPhone sizes
(60 combos) before being called done — and it failed two checks,
so it was NOT reported as done. Both are fixed in this same
version; the mechanism below is the second, corrected one.

- **Defect 1 — top rest state: the pill still covered content at
  launch (all 5 sizes).** Bottom rest state passed everywhere
  (last card fully above the pill), but at scrollTop=0 the pill
  overlaid whatever card straddled the bottom ~100pt of the
  screen. Worst cases: 375×667 SE — 广告过滤 title row 29pt
  under the pill; 430×932 — the entire 查看帮助 capsule 31pt
  under the pill; 390/393/402 — 9–32pt of card rows under the
  pill. This is the exact visual from Aaron's 12:22 problem shot
  and violates his criterion "不存在导航栏遮挡内容的情况", so
  "scroll ~30pt to clear it" is not a fix.
  Cause (confirmed against the code): the first fix anchored the
  pill with `safeAreaInset(edge: .bottom)`. That only insets the
  scrollable content's bottom edge — i.e. it only moves the *max
  scroll offset*. The ScrollView frame itself stays full-height,
  so at scrollTop=0 the pill, an overlay, covers the first
  screenful's lower band. No overlay pill can ever guarantee
  "nothing under it" at every scroll position: the strip has to
  be reserved in the layout flow, not overlaid.
- **Defect 2 — Smart Search description truncates at small
  widths.** Home card description "触发词+搜索词，快速切换搜索引擎"
  (15 chars) overflows at the 0.85 minimum-scale floor: 375pt
  needs ≤11.55pt (19px over), 390pt needs ≤12.52pt (4px over),
  393pt 1px over (noise), fits at 402/430. The v0.5.0 comment
  claiming it "fits at ~13pt scale" was wrong at 375/390 (also
  corrected in `HomeView.swift`). The EN string
  ("Trigger word + query, switch engines fast", 43 chars) also
  overflowed at 375pt. Fix: shorten the strings, not the card —
  the scale floor stays 0.85 and the card layout is unchanged.
  New strings (`Design.swift`, `cardSmartSearchDesc`): zh
  "触发词+搜索词，快速切换" (12 chars, fits at full 15pt at
  375pt: 11 full-width glyphs + "+" ≈ 172pt vs a ~173pt column),
  EN "Trigger word, switch engines" (28 chars, fits at ~0.94
  scale). The web popup keeps its own separate string
  (`featureSmartSearchDesc`, already ellipsized there) — the
  tables are not shared, so no web change was needed.

### The fix (structural, same design)

- **Pill strip reserved in the layout flow.** `OpenMonkeyApp.swift`:
  the root is now a `VStack(spacing: 0)` whose first child is the
  tab container (`ZStack` with both tabs) and whose second child is
  the pill container (`floatingTabBar` + 18pt bottom gap). Every
  ScrollView's frame therefore ends above the pill, so no card can
  sit under it at *any* scroll position — scrollTop=0, mid-scroll,
  and max scroll alike. The pill keeps its exact look (capsule,
  `ultraThinMaterial`, darker active inner pill, 18pt gap above the
  safe-area bottom edge), the pill container still respects the
  device bottom safe area (the `VStack` lays out within the safe
  area, so the pill sits above the Home Indicator and at the
  physical bottom edge on a Home-button phone), and everything is
  still derived from the pill's real height and the system safe
  area — no fixed bottom padding constant anywhere (the checker
  still forbids `tabBarClearance`). No view measures the pill,
  because no view needs to: the `VStack` measures it.
- **All fixed bottom paddings deleted.** The 13 call sites above
  lose their `.padding(.bottom, …)` entirely, `tabBarClearance` /
  `tabBarClearanceExtra` and the unused `omTabBarClearance()`
  helper are removed from `Design.swift`, and
  `check-xcode-project.py` now fails the build if the identifier
  `tabBarClearance` ever comes back — the bug cannot be
  reintroduced as a constant. Adding the clearance back by hand
  would double-count the reserved pill strip, so the rule is:
  scroll content carries no pill padding at all.
- **Backgrounds extend through the safe areas.** The root
  `VStack` gets `.background(OMDesign.pageBackground
  .ignoresSafeArea())`, and `LockView` the same, so the Home
  Indicator / status-bar strips are the page colour, not the
  window default. Per-screen `.background(pageBackground)` calls
  are unchanged (same colour, harmless).
- **Editor:** the `bottomClearance` parameter is gone
  (`EditorView(script:)` only; `HomeView` now opens a plain
  `EditorView()`). The pushed editor's available height ends
  above the pill because the root `VStack` reserves the strip,
  so the status bar sits directly above the pill with no dead
  band. The editor's root
  `VStack` gets a background in the editor's own theme colour
  (same `#1E1E1E` / white values as
  `CodeEditorContainerView.applyTheme`), extended through the
  safe areas, so the strip behind the status bar matches the
  editor instead of the system background. Sheets
  (`InstallView`, editor/detail sheets) are not descendants of
  the tab container, so they correctly get no pill strip.
- **Same treatment on every screen:** Home, 我的， all six
  settings sub-pages, the three feature pages, Library, Detail,
  Editor — the fix lives in the root container, so every pushed
  page inherits it; the per-screen change is only the deletion
  of the fixed padding.
- **Version 0.5.1** in `package.json`, `extension/manifest.json`,
  all 6 `MARKETING_VERSION` entries, the appex
  `CFBundleShortVersionString`, and the in-app version strings
  (`Design.swift` `versionValue`, `MyView`, `AboutView`).
- **App name: just "OpenMonkey".** The iOS target is renamed
  `OpenMonkey-iOS` → `OpenMonkey` (target name, `productName`,
  product reference `OpenMonkey.app`, build-configuration-list
  comments), the scheme file is now `OpenMonkey.xcscheme` (its
  `BuildableName`/`BlueprintName` updated), the native IPA
  workflow builds `-scheme OpenMonkey` and packages
  `OpenMonkey.app`, and the docs + project checker name the new
  target. Bundle id stays `com.openmonkey.safari.app` (the
  product name comes from `PRODUCT_NAME = "$(TARGET_NAME)"`, so
  the home-screen label is now just OpenMonkey); the macOS
  target `OpenMonkey-macOS` is untouched. Expected CI result:
  the IPA contains `Payload/OpenMonkey.app` with
  `CFBundleName`/`CFBundleDisplayName` = OpenMonkey.

- **App icon fix after run #44 (same version, no bump).** The
  first v0.5.1 build compiled but shipped NO app icon at all:
  its `Assets.car` held only AccentColor (18 KB) and the `.app`
  had no loose AppIcon PNGs, where v0.5.0 had a 109 KB
  `Assets.car` plus loose icons. The build log gave the cause:
  actool warned `The app icon set "AppIcon" has 36 unassigned
  children` — every entry in the generated `Contents.json`
  carried an explicit `luminosity` appearance (light AND dark),
  so no slot had a base image and actool attached none of them.
  Untagging the light entries fixed only half: run #46 still
  warned `18 unassigned children` — every dark entry, including
  1024-dark — because the legacy all-sizes set has no dark slots
  at all. The real fix is **Single Size**, Apple's documented
  route for dark variants: `Contents.json` now has exactly two
  entries, both `idiom universal, platform ios, size 1024x1024`
  (the shape Xcode itself writes) — light untagged, dark tagged
  `luminosity dark` — and Xcode generates every size from the
  1024 masters. Run #48 proves it: its `Assets.car` contains
  both `AppIcon-1024.png` and `AppIcon-1024-dark.png`, and the
  loose generated icons are emplaced. One wart remains: the 34
  old per-size PNGs still sit in the folder unreferenced, and
  actool warns `34 unassigned children` about them in every
  build log (the warning counts exactly the stale files; the two
  referenced entries are assigned). They are harmless — the build
  succeeds and the icon is correct — but the folder should be
  cleaned with a single commit deleting all 34; the GitHub
  connector cannot delete files in one commit (push_files is
  create/update only, delete_file is one file per approval), so
  the cleanup is deferred rather than spamming 34 approval cards
  or 34 CI builds. The dark background stays opaque black, as
  the user asked (white in light mode, black in dark mode),
  rather than Apple's transparent-background convention.

### Verification (v0.5.1)
- Baselines re-run after both defect fixes: `npm run build` ✓,
  `npm test` 57/57 ✓, `release-check` ✓,
  `check-xcode-project.py` 0 warnings ✓, `git diff --check`
  clean ✓.
- Renders: the verification agent rendered the first
  (`safeAreaInset`) fix at 5 real iPhone sizes, 60 combos —
  bottom rest state passed everywhere, top rest state failed
  everywhere (Defect 1 above), plus the Smart Search truncation
  (Defect 2). Both were fixed structurally (VStack flow;
  shortened strings) and the new mechanics are pending
  re-render of all 60 combos by the verification agent — do not
  call v0.5.1 done until that re-render passes.
- SwiftUI verified by line-by-line audit only — no Simulator on
  this Linux VM (same limitation as v0.5.0). The first
  `build-ipa-native` CI run is the real compile check. Untested
  on real Safari (all of it).

## v0.5.2 — the REAL screen-fit bug (v0.5.1 was still broken on device)

Aaron installed the v0.5.1 IPA (run #48) and sent a real-device shot
at 19:11 the same day: still broken, and he was right to be angry.
This section is written from measurements of that shot
(428×926pt, iPhone 13 Pro Max, dark mode), not from the HTML
previews — which is the whole lesson.

### What the shot actually showed (measured with pixel scans)
- The whole UI floated CENTRED in the window: nav title "首页" at
  y≈198pt instead of ~70pt, first card starting at y≈263pt,
  pill at y≈683–770pt, and 156pt of pure black below the pill.
  Top black margin ≈122pt, bottom ≈122pt (excluding the system
  bars) — symmetric. The root layout never filled the screen.
- Only 2.5 cards visible at scroll-top; the 3rd card (代码编辑器)
  is cut off behind the pill.
- Every description truncated with "…": "用户脚本扩展各…",
  "查看并保存网页…", "代码编辑器…".
- Cards measured 155pt tall (designed ~116pt) and the Toggle
  rendered ~84pt wide (nominal 51pt) — the text column is only
  ~150pt wide, not the ~220pt the v0.5.1 math assumed.

### Root cause (the one v0.5.1 missed)
The root `VStack` in `OpenMonkeyApp` had NO size constraint, so it
sized to its children's ideal heights (~589pt) and SwiftUI centred
it vertically in the 926pt window. v0.5.1's VStack-flow pill fix
was real but irrelevant: it arranged children correctly inside a
box that itself floated. The HTML previews could never catch this —
they render a mock inside a 926pt-tall box by construction, not
the SwiftUI layout. That is why v0.5.1 "passed" every check and
still failed on the phone. The v0.5.1 R1–R4 analysis (fixed 116pt
clearance, overlay pill, backgrounds, editor dead zone) was about
the BOTTOM of the screen; the actual breakage was the ROOT not
filling the window.

### Fix (v0.5.2)
- Root fill, forced: `GeometryReader` at the root, the `VStack`
  gets `.frame(maxWidth: .infinity, maxHeight: .infinity)`, the
  `ZStack` and both tab views get the same frame. The
  NavigationView bar now sits at the top, the pill at the bottom,
  the ScrollView gets the full viewport (~750pt).
- Pill bottom padding is the 18pt visual gap PLUS the real bottom
  safe area from the GeometryReader, so it sits above the Home
  Indicator instead of inside it (with the old fixed 18pt it
  would have ended 34pt too low once the root actually fills).
- Descriptions shortened to ≤8 Chinese characters (and short
  English): e.g. 用户脚本扩展各项功能 → 管理用户脚本,
  查看并保存网页媒体 → 查看保存媒体,
  触发词+搜索词，快速切换 → 触发词快速切换. The string contract
  is now in the table in Design.swift: do not lengthen a
  description without re-measuring the real column.
- `scripts/check-xcode-project.py` now FAILS if the root fill
  frame is removed from OpenMonkeyApp.swift.
- Design, icons, colours, fonts and functions unchanged, as
  Aaron required.

### Verification (v0.5.2) — the process fix
- New CI workflow `.github/workflows/screenshot-sim.yml`: builds
  the app for the iOS Simulator, boots an iPhone 13 Pro Max
  simulator (428×926, dark mode), installs and launches the app,
  screenshots the Home tab, uploads the PNG as an artifact.
  **Rule from v0.5.2 on: no IPA is delivered until this
  workflow's screenshot has been looked at and the real render
  matches the design.** HTML previews are mocks, not verification.
  The My tab shares the same root layout, so Home proves the fix
  for both; a My screenshot needs a tap (simctl cannot tap), so
  it is not in v1 of this workflow.

## v0.5.3 — launch screen: the window itself was not full-screen

Run #1 of the new screenshot workflow (head 8fdfa3f) returned a
REAL render — and it proved v0.5.2 did NOT fix the problem. The
simulator screenshot (home-428x926-dark.png, 1284×2778) shows the
app occupying only y≈142–784pt of the 926pt screen, perfectly
centred with 142pt black bands top and bottom, in LIGHT mode (the
`defaults write -g AppleInterfaceStyle Dark` in the workflow did
not take effect). The new short descriptions are in the build
("Manage userscripts" still truncates in English — the column is
narrower than the v0.5.2 math assumed — but the Chinese strings
are ≤8 characters and fit), the toggles render at normal size on
the simulator, and the IPA (run #55) itself is fine (0.5.2,
Assets.car with both icon variants, manifest matches dist).

### Root cause (final)
The GeometryReader + forced-fill root from v0.5.2 cannot work,
because the constraint is not inside the app — it is the WINDOW:
iOS never gave the app a native full-screen window, because the
app shipped with NO launch storyboard and the build warned about
exactly that ("A launch configuration or launch storyboard or xib
must be provided unless the app requires full screen"). The app
neither had a launch storyboard nor required full screen, so its
window came up smaller than the screen and centred; every layout
fix applied inside that window was arranging furniture in a
floating box. (The height differs between builds — ~594pt on
Aaron's v0.5.1 phone, ~642pt on the v0.5.2 simulator — because
the centred box's height follows the content; the window size is
what is wrong, and the window is what the launch screen fixes.)

### Fix (v0.5.3)
- New `xcode/App/LaunchScreen.storyboard`: a minimal launch
  screen (plain system-background view, light/dark adaptive),
  referenced in the project (file reference, App group, iOS
  Resources phase) so it is copied into the app bundle.
- `INFOPLIST_KEY_UILaunchStoryboardName = LaunchScreen` and
  `INFOPLIST_KEY_UIRequiresFullScreen = YES` in the two iOS app
  build configurations (Debug + Release; macOS untouched).
- Screenshot workflow: dark mode now set with
  `xcrun simctl ui <UDID> appearance dark` (the correct API).
- `scripts/check-xcode-project.py` now FAILS if the launch
  storyboard file is missing, unreferenced, or the Info.plist
  key is absent.
- Design, icons, colours, fonts and functions unchanged.

### Verification (v0.5.3)
- The screenshot workflow must now return a render where the app
  covers the FULL 926pt height (status bar over app content, pill
  near the bottom, no black bands) — that is the pass criterion,
  not "looks nice". If it still shows a centred band, the next
  step is instrumenting the app (debug overlay printing
  `geometry.size`) rather than another blind layout change.
- Baselines: `npm test` 57/57, `npm run build`,
  `release-check`, `check-xcode-project.py` (with the new launch
  screen guard), `git diff --check`.

## v0.5.0 — what changed and why

### Reference spec (what the 7 shots show)
- **Home:** centred title 首页. Feature cards are large rounded
  dark cards (~28pt radius): 44px coloured circle icon, bold white
  title, ONE grey description line, green iOS switch right, grey
  查看帮助 capsule bottom-right. Cards: 用户脚本 (purple), 资源管理
  (blue play), 广告过滤 (orange AD), 标记模式 (pin), 智能搜索
  (cloud), 暗黑模式 (green), 嗅探模式.
- **Tab bar:** a FLOATING pill (首页 / 我的， active tab = darker
  inner pill). The reference itself uses it — v0.3.0's real bug was
  content scrolling UNDER it with no bottom padding, not the pill.
  v0.5.0 brings the pill back with 116pt of bottom padding on every
  scroll view, so no card is ever hidden or overlapped by it. (The
  v0.4.0 attached bottom bar was wrong for this spec and is gone.)
- **我的 tab:** section headers 基础设置 / 支持与帮助 / 关于.
  Grouped dark cards, rows = coloured rounded-square icon + title +
  right chevron (+ grey value text). 基础设置： 通用设置 / 任务设置 /
  iCloud同步 / 清理数据. 支持与帮助： 意见反馈 / 好评鼓励 /
  分享给朋友. 关于： 隐私协议 / 关于我们 (版本 5.3 in the shot).
- **Sub-pages:** circle back button top-left, centred title, dark
  cards, hairline rows, segmented pills (自动/浅色/深色，
  前置/后置）, green toggles. 通用设置， 任务设置， iCloud同步，
  清理数据 each as shot.

### Host app (SwiftUI)
- Two tabs only — 首页 / 我的 — floating pill, both tabs mounted
  (ZStack + opacity, navigation stacks preserved). Tapping 用户脚本
  pushes the Stay-style library (search, Activated/Stopped/Featured,
  script rows, detail, editor); settings live under 我的， not a tab.
- Home cards, in reference order: 用户脚本 (global switch, opens
  library), 资源管理 (media-detection switch, opens detected media),
  代码编辑器 (dark-editor switch, opens editor), 安装脚本 (action
  card, NO switch — it is not a setting), 广告过滤 (switch + custom
  rules editor), 标记模式 (switch), 智能搜索 (switch + engine/trigger
  editor), 暗黑模式 (switch; mode 自动/浅色/深色 in 通用设置）,
  嗅探模式 (switch). Every toggle writes the App Group suite through
  `OMSharedSettings` and syncs to the extension. Descriptions are one
  line with `.minimumScaleFactor(0.85)` so they never break mid-word
  at 375pt.
- 我的： rows per shot 3. 意见反馈 opens the GitHub issues page in
  Safari; 好评鼓励 opens the repo (to star); 分享给朋友 opens the
  iOS share sheet with the repo link. 隐私协议 is an in-app text page
  (data stays on device / in the user's iCloud if sync is on, no
  tracking, no ads). 关于我们 shows version 0.5.0 + repo link.
- 通用设置： 暗黑模式 segmented (drives web dark mode + the app's own
  `preferredColorScheme`); 智能搜索触发词 前置/后置； 语言
  中文/English (moved here from v0.4.0's Settings); 代码编辑器
  toggle; FaceID toggle — a REAL LocalAuthentication app lock (Face
  ID / Touch ID / passcode fallback, lock overlay on launch and
  foreground; `INFOPLIST_KEY_NSFaceIDUsageDescription` added).
- 任务设置： 文件排序 (时间升序/降序/名称 — actually sorts the
  library); 显示提示弹窗 (gates install/update/delete confirmations);
  显示嗅探按钮 / 开启长按嗅探 (synced). 允许使用移动网络 omitted —
  update checks have no mechanism to be gated by it, the row would
  be fake.
- 同步： labelled 同步 (not iCloud同步）, settings-only sync via
  `NSUbiquitousKeyValueStore` — never scripts. 启用同步 toggle +
  description; 立即同步 pushes now and shows the last-sync time.
- 清理数据： only 临时数据 has a real deletable backing in the app
  (tmp + Caches), so only that row is offered, with real deletion and
  a freed-bytes report; 空间占用 is the measured size of Scripts +
  tmp + Caches (never hardcoded). The other four rows (导入文件 /
  网页数据 / 任务数据 / 图片数据） are omitted: imports are never
  staged, extension web data lives in Safari's profile, per-script GM
  storage lives in the extension's `chrome.storage.local`, and script
  icons are generated on the fly.
- Localization table extended 144 → ~230 keys; no hardcoded UI
  strings remain in views (only version interpolations). Versions:
  0.5.0 everywhere (app + extension targets, manifest, package.json).

### Web extension (popup / pages / content scripts)
- 广告过滤 (real): 27 built-in selectors (specific ad-network/id/
  class patterns, no bare structural elements) injected as CSS + a
  MutationObserver that re-hides new nodes and re-inserts the style
  element if the page removes it. Custom rules (safety-validated —
  rejects `div`, `body`, `*`, braces, `!important`) editable in the
  dashboard.
- 标记模式 (real): floating hint bar ("点击页面元素可隐藏它" +
  退出）, orange hover outline, tap hides + saves a per-site rule
  (`openmonkey.tagRules.v1`, host → selectors); long-press (600ms)
  or Exit/Escape leaves the mode. Rules editable/deletable.
- 暗黑模式 (real): stylesheet override (`color-scheme: dark` +
  background/text/border overrides), NOT an invert filter (images/
  video/canvas untouched; inline-styled pages and white-background
  images keep light patches — documented tradeoff). Gated by
  `darkModeEnabled`; mode auto/light/dark.
- 智能搜索 (real): trigger-word search in the popup (`bd 猫`,
  `g cats`); prefix/suffix modes; editable engines (Baidu `bd`,
  Google `g`, Bing `bing`); unknown trigger falls back to the default
  engine with the whole text.
- 资源管理 + 嗅探 (real, scoped honestly): content script scans the
  DOM (`video`/`audio`/`source`, media links) + resource-timing
  entries, reports `{url, type, size?}` (size via same-origin HEAD
  only) via native `reportResources` (fallback: chrome.storage
  `openmonkey.resources.v1`); dashboard lists it with copy/open/
  download; in-page panel + floating button (click or long-press
  opens it). Deliberately NOT built: m3u8→mp4 merging/converting
  (needs native code, not a content script); cross-origin download
  (CORS — copy-link instead); ad-request blocking (no
  declarativeNetRequest in a Safari web-extension content script —
  hiding only). The floating button is an in-page element, so pages
  that strip foreign DOM won't show it — the media list is always
  available in popup/dashboard as the fallback.
- Popup/pages restyled to the Home-card language (dark cards, 44px
  circle icons, one-line descriptions with ellipsis, green switches,
  查看帮助 capsules). Coordinator fix after review: feature
  descriptions were wrapping to two lines (EN) / breaking mid-word
  (zh 智能搜索） — `.feature-desc` is now single-line ellipsis, and
  the settings-page iCloud hint no longer claims script sync.
- Settings: `openmonkey.settings.v1` extended (see contract below);
  background applies features on `chrome.storage.onChanged`
  (`OM_FEATURES_CHANGED` broadcast) and content scripts watch
  storage directly. `showPromptPopups` is stored and synced but no
  web UI prompt reads it yet. No new manifest permissions.

### Settings contract (app ↔ extension, same keys both sides)
`openmonkey.settings.v1` (chrome.storage.local) / App Group suite
(`OpenMonkey<Name>`): `globalEnabled`, `language` ("system"/"zh"/
"en"), `darkMode` ("auto"/"light"/"dark", default "auto"),
`darkModeEnabled` (Bool, default false — the Home toggle;
`darkMode` alone cannot express on/off),
`adFilterEnabled` (false), `customAdRules` ([]),
`tagModeEnabled` (false), `smartSearchEnabled` (false),
`smartSearchTrigger` ("prefix"/"suffix", default "prefix"),
`smartSearchEngines` ([{id, name, trigger, url}] with {q}),
`sniffEnabled` (false), `resourceDetectionEnabled` (true — gates
detection/reporting, independent of the sniff button),
`showSniffButton` (true), `longPressSniff` (true),
`darkEditor` (true), `fileSort` ("timeAsc"/"timeDesc"/"name"),
`showPromptPopups` (true), `syncEnabled` (false).
Per-site tag rules: `openmonkey.tagRules.v1` = `{[host]: string[]}`.
Media: `openmonkey.resources.v1` (native `reportResources` message:
`{"type": "reportResources", "resources": [{url, title, type,
pageURL, detectedAt}]}` with `detectedAt` as a Unix timestamp,
normalized to ISO-8601 by the native handler; chrome.storage
fallback keeps both the legacy `{tabId, url, items}` and the native
`{resources}` shapes).

### Verification (v0.5.0)
- Baselines re-run by the coordinator: `npm run build` ✓,
  `npm test` 57/57 ✓ (37 in v0.4.0 + 20 new), `release-check` ✓,
  `check-xcode-project.py` 0 warnings ✓, `git diff --check` clean ✓.
- Web renders at 390px, light/dark × zh/en, viewed by the
  coordinator: popup feature cards match the reference (one-line
  descriptions after the ellipsis fix, capsules, toggles, language
  switch); settings page correct in both languages. Content-script
  smoke test in headless Chromium: `dist/content.js` loads with zero
  console errors.
- SwiftUI audited by reading (no Simulator on this Linux VM): card
  layout, pill tab bar + 116pt clearance, semantic colors only
  (the two `Color.white` returns are non-iOS `#else` fallbacks),
  flexible widths, no hardcoded strings, versions 0.5.0. First
  `build-ipa-native` CI run is the real compile check.
- Untested on real Safari (all of it); native-messaging end-to-end
  needs the signed app + real Safari.

## v0.4.0 — what changed in the SwiftUI app and why

Aaron installed the v0.3.0 native IPA and rejected it, with a phone
screenshot (`~/workspace/user/files/1D8C228C-…-DCCBD748-…jpg`): in
dark mode the Home cards were invisible (black page, black cards,
zero separation), the Scripts card description broke mid-word
("Greasemonk ey/Tamper…"), the floating pill tab bar overlapped the
cards and the "View help" pill, the Install card was cut off at the
bottom, and everything was English — he demands a Chinese UI plus a
中文/English switch. v0.4.0 fixes exactly those five failures in the
SwiftUI host app only (the web extension is a parallel job; its
strings and layout are not touched here). No code, text, or artwork
was copied from any reference product; the Addons/Stay screenshots
remain the layout authority only.

## v0.4.0 — what changed in the SwiftUI app and why

### Dark mode: semantic colours, not fixed fills

Root cause, verified in code: `OMDesign.cardBackground` was
`Color(UIColor.systemBackground)` — black in dark mode — on a
`systemGroupedBackground` page (#1C1C1E), so cards vanished. The
correct semantic pairing is page = `systemGroupedBackground`, cards
= `secondarySystemGroupedBackground` (white on #F2F2F7 light,
#2C2C2E on #1C1C1E dark — the pairing iOS itself uses for grouped
lists). `cardBackground` now returns that on iOS (macOS keeps
`controlBackgroundColor`).

Every other fill was audited the same way: the "View help" capsule
and the selected library segment used a fixed
`Color.gray.opacity(0.18)` — both now use the new semantic
`OMDesign.capsuleBackground` (`secondarySystemFill` on iOS). The
toolbar capsules already used `cardBackground` and now inherit the
fix. Text is `.primary` / `.secondary` throughout. What is
deliberately still fixed, and why: the coloured feature-icon circles
and the brand purple / switch green (accent colours with white glyphs,
readable in both modes); the code editor's own dark/light theme
(`#1E1E1E` + `#D4D4D4` vs white + `#1E1E1E` in
`CodeEditorContainerView`), which is a paired theme the user chooses,
not app chrome; and the card shadow (`Color.black.opacity(0.06)`),
which is a shadow, not a fill. Light mode is unchanged: #F2F2F7 page,
white cards.

### Attached tab bar: TabView is gone

Root cause: `OpenMonkeyApp` used a standard `TabView`, which on iOS
26 renders as a floating glass pill overlapping content — the pill in
the user's screenshot. v0.4.0 deletes `TabView` and builds a custom
bar in `OpenMonkeyApp.swift`: a plain `HStack` (Home `house` /
Scripts `scroll`, localized labels, selected tint = brand purple)
as the last child of the root `VStack`, below the scroll area, with a
hairline `Divider` on top — in the layout flow, not an overlay, not
floating, so content can never hide under it and no bottom-padding
hack is needed. The bar's background (`cardBackground`) extends
through the bottom safe area to the screen edge (`.ignoresSafeArea`
on the background only); the labels stay above the home indicator.
Both tabs stay mounted — a `ZStack` with an opacity switch — so each
tab's `NavigationView` stack is preserved when switching; the hidden
tab is `.disabled` and `.accessibilityHidden` so it cannot take taps.

### Adaptive layout at 375pt

Root cause: `FeatureCard`'s text column had no layout priority, so
the Toggle + chevron squeezed it and the long token
"Greasemonkey/Tampermonkey-related functions" wrapped mid-word. The
card is restructured: the text column gets `.layoutPriority(1)`, the
trailing controls (Toggle and/or chevron) sit in a compact
fixed-size `HStack` that cannot be compressed, titles are one line
and descriptions are two lines with tail truncation only. The
descriptions were also shortened in both languages ("Userscripts &
styles for Safari" / "为 Safari 运行用户脚本与样式", etc.).

Width budget at 375pt: 375 − 32 page padding − 28 card padding −
44 icon − 12 + 12 spacing − ~71 trailing controls ≈ 176pt for the
text column. At 15pt that is ~2 lines of ~23 English characters or
~11 Chinese characters per line; every description fits in two lines
in both languages. `ScriptRow` in the library and the detail-page
header card got the same treatment (text column priority, Toggle
`.fixedSize()`, name/description one line with tail truncation, so a
long unbroken script description is cut once with an ellipsis instead
of wrapping mid-word). No fixed width remains on any text container;
the only `.frame(width:)` uses left are the 40/44pt icons, the 7pt
status dot, and the editor's 40pt line-number gutter (a UIKit
constraint, not a text container) — all justified in the code.

### Chinese UI + language switch

Every user-visible string in the host app is localized — Home cards,
descriptions, "View help", help sheets, Scripts list, segments,
search placeholder, empty states, "Check for updates", "Enable all
shown", detail page, editor (buttons, menus, status bar, validation
messages), Settings (every row/section/footer), Install view,
alerts, and the App Group banner. `ScriptStoreError` and
`MetadataParseError` messages are localized too. Default = system
language (zh-Hans → Chinese, otherwise English). Settings has a
Language section with a segmented picker: 跟随系统 / 中文 / English,
persisted in the App Group suite key `OpenMonkeyLanguage`
("system" | "zh" | "en", default "system"), taking effect
immediately across the whole app.

Mechanism (deliberate choice): an in-app string table, not
`.xcstrings`. `Design.swift` holds an `OMTextKey` enum (one case per
string) plus an (English, Chinese) table, and `OMLanguageManager`, an
`ObservableObject` created once in `OpenMonkeyApp` and passed down
as an `@EnvironmentObject`; views read strings through
`lang.text(.key)` / `lang.format(.key, args)`, and the app also sets
`.environment(\.locale, languageManager.locale)`. A strings file
would have needed registering in the hand-maintained
`project.pbxproj` (file reference + build file + correct target) with
a real risk of breaking the project checks; the table needs no
project changes, is auditable in one place, and re-renders instantly
because every view observes the manager. The Foundation-only error
strings in Shared/ use a separate `AppGroup.localized(en:zh:)`
helper that reads the same suite key, because Shared/ is also
compiled into the extension target and cannot use SwiftUI. Script
names, URLs, file names and code are user content and are never
translated. No new Swift files were added, so no `project.pbxproj`
structural change was needed.

### Home toggle wired to real storage

Root cause: the Home Scripts toggle was `@AppStorage` in standard
`UserDefaults` — app-local, invisible to the extension. It now goes
through `OMSharedSettings` (`Design.swift`), which reads/writes the
App Group suite key `OpenMonkeyGlobalEnabled` (default `true`) via
`AppGroup.sharedDefaults` (`UserDefaults(suiteName:)` falling back to
`.standard` when the suite is unavailable, so an unsigned build
never crashes and the toggle still works app-locally). The same
object backs the Settings "Enable all scripts" toggle. Both views
call `refresh()` on appear, so the toggle always reflects the suite
value — including a value the extension wrote. A value left in
standard defaults by the pre-v0.4.0 `@AppStorage` toggle is migrated
into the suite once. The editor card's `@AppStorage` dark-editor
toggle is unchanged: that one is genuinely app-local.

### Native settings bridge

`SafariWebExtensionHandler.swift` gains two message types on the
existing native-message protocol (the web side calls them via the
existing `OM_NATIVE` → `sendNativeMessage` path; `getScripts` /
`saveScript` / `log` are untouched): `{"type": "getSettings"}` →
`{"ok": true, "globalEnabled": Bool, "language": String}` (defaults
`true` / `"system"` when absent or the suite is unavailable), and
`{"type": "setSettings", "globalEnabled": Bool?, "language": String?}`
→ writes whichever keys are present, no-ops the absent ones, replies
`{"ok": true}`, or `ok: false` with an error string when the suite
is unavailable. The header contract comment documents both types.
`context.completeRequest` is still called exactly once on every path
(the existing `finish` guard).

### Versions

`MARKETING_VERSION` 0.3.0 → 0.4.0 in all 6 build configurations, and
the extension target's `CFBundleShortVersionString` 0.1.0 → 0.4.0 in
`xcode/Extension/Info.plist` (it was a hardcoded literal, not
`$(MARKETING_VERSION)`). The Settings About row now shows 0.4.0.

### Verification (v0.4.0)

- `python3 scripts/check-xcode-project.py` — passes, 0 warnings.
- `git diff --check` — clean.
- Grep audit of `xcode/App/*.swift`: no hardcoded English UI strings
  remain (only SF Symbol names, URLs, file names, code identifiers
  and user content); no `.frame(width:)` on any text container; every
  remaining `Color(` fill is semantic or a justified fixed accent
  (see the dark-mode paragraph above).
- Not verifiable on this machine: there is no iOS Simulator on the
  Linux VM, so SwiftUI was verified by reading only — the layout
  reasoning for 375pt is in the adaptive-layout paragraph above, and
  the first `build-ipa-native` run on CI is the real compile check.

## v0.3.0 — from-scratch redesign

Why this version exists: the v0.2.0 redesign only restyled the web
extension pages. The IPA the user received was still built by Apple's
`safari-web-extension-converter`, whose host app is a template screen
("You can turn on OpenMonkey's Safari extension in Settings") — so
the user never saw the new UI at all, and the app icon was still a
monkey face he had asked to drop. v0.3.0 therefore rebuilds the
whole product surface from zero:

1. The hand-written SwiftUI host app is the real app again, and a
   new `build-ipa-native` workflow packages **that** app (with its
   Safari extension embedded) into an unsigned IPA. The converter
   flow (`build-ipa.yml`) stays only as a fallback.
2. Web extension popup and dashboard are rebuilt from scratch in
   the same visual language, mobile-first, single column.
3. The icon drops the monkey entirely: a purple squircle with a
   white `</>` mark.

No code, text, or artwork was copied from any reference product.
Everything below is a description of publicly visible layouts and
interactions, paraphrased from the user's own screenshots of the
Addons and Stay App Store listings plus the Stay/Userscripts
documentation. "Addons" here is the Safari extensions app whose
Store screenshots the user sent (Home with feature cards, Scripts,
Block Ads, Tagit, AI Search, Dark Mode, Code Editor).

## 1. Reference screens (what was actually studied)

### Addons — Home

- Light grey background (`#F2F2F7`), white rounded cards (radius ~16).
- Each card: a 44px coloured circle icon on the left, a bold 17pt
  title, two lines of grey description, a green iOS switch
  (`#34C759`) on the right, and a grey "View help" capsule button
  at the card's bottom-right.
- Cards are real features: Scripts (Greasemonkey/Tampermonkey),
  Downloads (merge/convert/download m3u8/mp4), Tagit (tag and remove
  web ads), Intelligent search (trigger word + search term, switch
  search engines). Bottom tab bar: Home + menu.

### Stay — Userscripts list

- Header: app icon + title, with a refresh button and a "+" button
  in a capsule group on the right.
- Rounded search field with a magnifier.
- Segmented capsules "Activated / Stopped / Featured" — the
  selected one is a light-grey capsule with black text, the others
  plain grey text.
- The script list is one white rounded container; rows are
  separated by hairlines. Each row: a 40px rounded-square script
  icon, bold name, one truncated description line, a bottom line
  "● Activated | ⓥ version | Updated date", and a switch on the
  right. Tapping a row opens its detail page.
- The same row structure is used for the content-blocker list
  (Block Ads): a category chip (Basic / Privacy / Region / Tag),
  "N filter rules", the same status bottom line, a grey hint capsule
  plus a purple-outlined "Enable" button when a blocker is off.
- The Scripts inner page has a back chevron + "Scripts" title + "+",
  and rows whose bottom line is "version: x.y.z" with a green switch.

### Other reference screens

- **Tagit:** a floating toolbar over a web page (Expand / Narrow /
  Block / GoBck capsules + a red Exit button). This is an in-page
  floating UI; noted as a future idea, **not built in this round**.
- **AI Search / Intelligent search:** a settings-style list —
  engine icon, name, domain, trigger-word chips (bd / baidu / 百度),
  right chevron. Used as the model for settings-style rows.
- **Dark Mode:** a dark preview page. **Code Editor:** a dark code
  editor with line numbers and syntax colours — the model for the
  new editor on both platforms.

### What is deliberately NOT built

- Stay's ad blocking, web-page dark mode, bookmark sync, download
  manager, curated script gallery, and any paid/Pro surface.
  OpenMonkey is a script manager only.
- Addons' Downloads, Tagit, and Intelligent search features.
  The Home cards only list features OpenMonkey really has.
- Stay's exact colours, icons, copy, and screenshots; the purple
  accent below is OpenMonkey's own brand colour, not Stay's.
- Tagit's floating in-page toolbar (future idea only).

## 2. Design tokens (one language, every surface)

| Token | Value | Used for |
|---|---|---|
| Background | `#F2F2F7` light / `#1C1C1E` dark | Page background |
| Card | `#FFFFFF` light / `#2C2C2E` dark | Cards, list containers |
| Text | `#1C1C1E` / `#F5F5F7` | Titles, names |
| Secondary text | `#6E6E73` / `#98989D` | Descriptions, dates |
| Separator | `rgba(60,60,67,0.18)` | Hairlines, borders |
| Switch green | `#34C759` | All iOS switches (on) |
| Brand purple | `#6C5CFF` | App icon, sparse emphasis only (selected capsule dot, update badge text, links in the editor theme) |
| Status green | `#34C759` | "● Activated" dot |
| Status grey | `#8E8E93` | "● Stopped" dot |
| Card radius | 16px | Feature cards, list containers |
| Row icon | 40px rounded square (radius 10) | Script rows |
| Card icon | 44px circle | Home feature cards |
| Type scale | 17 bold title / 15 body / 13 description / 12 status | — |
| Dark mode | `prefers-color-scheme` (web), system colours (SwiftUI) | Full support |

Rules that keep the design honest:

- A switch appears only where it controls a real setting
  (Scripts card = global injection; Code Editor card = dark
  editor). Install and Settings cards navigate instead of toggling.
- A "Featured" segment always means something real: in the web
  dashboard it is the scripts that have an `@updateURL` (i.e. can
  be updated at all); in the SwiftUI app the same. Scripts with an
  update actually available get the update badge inside the list.
- The editor is dark on both platforms (CodeMirror custom dark
  theme on the web; a dark `UITextView`-based editor with line
  numbers and basic syntax colouring in SwiftUI).

## 3. SwiftUI host app (from scratch)

`xcode/App/`, only the UI layer changed; `ScriptStore` and
`MetadataParser` interfaces are untouched.

- **Home** (`HomeView.swift`): the Addons Home, with only real
  features — Scripts, Code Editor, Install, Settings. Each card:
  44px coloured circle icon, bold title, two grey description
  lines, a green switch where one applies, and a "View help"
  capsule that opens a short help sheet. Bottom `TabView` with
  Home and Scripts tabs. The Install card opens `InstallView`:
  install from a `.user.js` URL (downloaded and parsed first),
  from a file (document picker), or from the clipboard, plus a
  shortcut to write a new script in the editor.
- **Scripts** (`LibraryView.swift`): search field, "Activated /
  Stopped / Featured" capsule segments (selected = grey capsule),
  one white rounded container of rows (40px icon, bold name,
  one-line description, bottom line "● Activated | ⓥ version |
  Updated date", green switch). Toolbar: refresh + "+" (new
  script). Tap a row → detail.
- **Detail** (`ScriptDetailView.swift`): header icon + name +
  version + switch; sections for Details (author, file, homepage,
  run-at), Permissions (`@grant` chips), Runs on (`@match`
  patterns); an Update card (checks `@updateURL` or
  `@downloadURL`, compares versions, and offers to replace the
  file with the newer source); actions Edit / Export .user.js /
  Copy Source / Delete.
- **Editor** (`EditorView.swift`): dark editor — line numbers in a
  synced gutter, basic syntax colouring (keywords, strings,
  comments, numbers), top bar with Discard + title + "…" menu
  (Save, Copy Source, Discard Changes) + Save, bottom status bar
  (character count, unsaved indicator). Metadata validation banner
  kept from before. On macOS the editor is a plain monospaced
  `TextEditor` (gutter and highlighting are iOS-only for now).
- **Settings** (`SettingsView.swift`): iOS grouped list — Scripts
  (global switch, update on launch, update interval), Editor
  (dark editor), Storage (folder, location, count, App Group
  status), Enable in Safari steps, Links, About.

## 4. Web extension popup and dashboard (from scratch)

Same tokens, mobile-first, single column; desktop is a
`max-width: 720px` centred column (the v0.2.0 three-column desktop
layout is gone).

- **Popup** (`popup.html` / `popup.css` / `src/popup/popup.ts`):
  compact Scripts list — header (logo, "Scripts", global switch),
  search field, Activated/Stopped capsule segments, one white
  container of Stay-style rows (icon, name, description, bottom
  line "● Activated | ⓥ version | Updated date", green switch),
  footer with New script / Install from URL / Open dashboard. The
  install prompt keeps its review-before-install content (source
  preview, match/grant chips) in the same card language. The
  "N running · M matched on this page" line sits under the header.
- **Dashboard** (`pages.html` / `pages.css` / `src/pages/pages.ts`):
  the full manager in the same shape — header with search, capsule
  segments, "Check for updates" and "+" actions; list (userscripts
  and userstyles in one container, userstyles marked with a CSS
  chip); detail section below the list (metadata, grants as chips,
  matches, update state, test-URL matcher, Edit / Duplicate /
  Export / Delete); dark CodeMirror editor (custom dark theme,
  line numbers, Ctrl/Cmd+S); settings section (global switch,
  update interval, import/export). `?new=1` still opens a new
  script in the editor.

Behaviour and storage are unchanged (additive only): the
`openmonkey.settings.v1` settings key, `OM_SET_SETTINGS`, and
`globalEnabled` in `OM_GET_MATCHING_SCRIPTS` from v0.2.0 are all
kept; no storage key or message protocol changed meaning.

## 5. App icon (no monkey)

The monkey is gone everywhere. The new mark:

- A purple (`#6C5CFF`) squircle (28px radius on a 128px tile).
- A white, bold, geometric `</>` glyph: two angle brackets and a
  slash, drawn as strokes with round caps and joins, centred with
  generous margins. No face, ears, tail, or animal shape of any kind.
- At 16px the tile and the white glyph still read clearly.

`extension/icons/icon.svg` is the source. `scripts/generate-icons.py`
reproduces the same drawing in Pillow (it does not rasterise the
SVG; it draws the geometry directly) and writes the generated
`icon16/32/48/128.png` files, which stay git-ignored. It also
writes the Xcode `AppIcon.appiconset` sizes (`--appicon`).

## 6. Native packaging (why this round is different)

The Xcode project is completed so the SwiftUI app can be packaged:

- `xcode/App/OpenMonkey.entitlements`: App Groups
  (`group.com.openmonkey.safari`) for both app targets; the
  extension's entitlements already existed.
- `xcode/App/Assets.xcassets`: `AppIcon.appiconset` built from the
  new `</>` icon, plus an `AccentColor` set (`#6C5CFF`).
- Extension target Resources: a single folder reference to
  `extension/dist`. `dist/` is self-contained — it already holds
  `manifest.json`, `popup.html`/`pages.html`, the CSS and JS, plus
  `_locales/` and `icons/` — so one folder reference carries the
  whole extension into the `.appex`. A defensive "Build Web
  Extension" run-script phase rebuilds `extension/dist` when it is
  missing and Node is available.
- `ScriptDetailView.swift` and the new `HomeView.swift` and
  `Design.swift` are added to the project (the detail view existed
  as a file in v0.2.0 but was never referenced by the project — it
  could not have built).
- Shared scheme `OpenMonkey.xcscheme` so CI can build with
  `-scheme OpenMonkey` without opening Xcode first.
- New workflow `.github/workflows/build-ipa-native.yml`: macOS
  runner, `npm ci` → icons → `npm run build` → `xcodebuild`
  (scheme `OpenMonkey`, `CODE_SIGNING_ALLOWED=NO`) → zip the
  `.app` into Payload as `OpenMonkey-native-unsigned.ipa` →
  artifact `OpenMonkey-native-unsigned` (7 days). The
  converter workflow `build-ipa.yml` is untouched and remains as
  a fallback.

Known remaining gaps (honest, not hidden):

- The macOS extension target still does not exist (the macOS app
  target builds without an embedded extension); the iOS native
  IPA is the deliverable for this round.
- Swift was checked by reading only — no Xcode on this machine.
  The first `build-ipa-native` run on CI is the real compile check.
- The SwiftUI app's "Enable all scripts" toggle was app-local
  (`@AppStorage`) in v0.3.0; v0.4.0 wires it to the shared App Group
  suite (see the v0.4.0 section above), so the host app and the
  native bridge now share one value. The web extension's own
  `chrome.storage.local` settings key is still a separate store —
  bridging the two stores is a separate job.
- The new UI has not been run in real Safari or on a device: web
  pages were verified with headless-Chromium screenshots (see §7);
  SwiftUI only by reading and by project-file consistency checks.

## 7. Verification

- `npm run build` (tsc + esbuild) — passed.
- `npm test` — 23/23 passed.
- `bash scripts/release-check.sh` — passed.
- HTML/ID cross-check: every `el('…')` id referenced by
  `popup.ts` (30 ids) and `pages.ts` (59 ids) exists in the
  rewritten `popup.html` / `pages.html`; every class name the
  scripts assign to dynamically created rows exists in
  `popup.css` / `pages.css`.
- Rendered screenshots (Playwright Chromium Headless Shell 131,
  served from `extension/dist` on a local HTTP server; the
  system Chromium refused to start under the VM's WebGL policy):
  `popup.html` and `pages.html` were rendered with the demo data
  and inspected visually — list, detail panel, dark editor,
  light and dark modes — and iterated until they matched the
  reference screens. Screenshots live under
  `~/workspace/projects/openmonkey-safari/.screenshots/` (not committed).
- Icon: `scripts/generate-icons.py` regenerated all four PNG sizes
  plus the AppIcon set; the 128px PNG was read back and inspected
  visually, and the 16px PNG checked for legibility.
- Xcode project: `scripts/check-xcode-project.py` checks pbxproj
  references, resource paths, entitlements references, the shared
  scheme, that every Swift file on disk is compiled by the targets
  that need it, and that no iOS 16+ API or Swift 5.7+ syntax is
  used — it passes with 0 errors. It also caught and fixed one
  real bug (`if let` shorthand in
  `SafariWebExtensionHandler.swift`, which does not compile under
  the project's Swift 5.0 language mode).
  The extension Resources folder reference points at
  `extension/dist`, which is generated by `npm run build` and is
  not committed — the native workflow builds it before
  `xcodebuild`, and the run-script phase rebuilds it when missing.

## 8. v0.4.0 — Chinese UI, language switch, native settings sync (web side)

Why this version exists: the user rejected the v0.3.0 UI after
installing the native IPA — not good-looking, not adaptive to the
phone screen, not like Addons/Stay, and above all entirely English
with no Chinese UI and no language switch. This round is the web
side only (the SwiftUI host app is rebuilt in parallel by a second
agent against the same shared contract below); it changes nothing
in `xcode/`, `.github/`, or `scripts/`, and adds no new features
beyond the three items here.

### 8.1 Chinese UI + language switch (headline)

- `extension/src/i18n.ts` is the single source of every
  user-visible string in the popup and the dashboard: one
  dictionary per language (English is the reference, Chinese the
  translation), ~105 keys covering headers, search placeholders,
  Activated/Stopped/Featured segments, all buttons, empty states,
  settings labels, install-prompt content, editor UI, detail
  labels, and status/toast/error messages. `translate(key, lang,
  vars)` interpolates `{name}` placeholders; `resolveLanguage`
  implements the rule (explicit zh/en wins; "system" follows
  `navigator.language`, zh\* → zh, else en); `applyStaticStrings`
  applies `data-i18n` / `data-i18n-placeholder` /
  `data-i18n-aria-label` attributes in the markup, so static text
  needs no per-element code. Script names, descriptions, URLs,
  file names, code, and version numbers are script metadata and
  are never translated — only UI chrome is.
- The settings object (`openmonkey.settings.v1`, see
  `src/pages/storage.ts`) gains an optional `language` field
  (`"system" | "zh" | "en"`, default `"system"`); old stored
  settings without the field migrate to `"system"` on read.
- The switch UI: the popup has a compact 中文 / EN pill in the
  header (the "follow system" choice lives in the dashboard
  settings); the dashboard settings panel has a proper segmented
  control, 跟随系统 / 中文 / English. Switching saves the
  preference, pushes it to the native side (see §8.3), and
  re-renders every string immediately, including
  `document.documentElement.lang`.
- The "N running · M matched on this page" line is now one
  localised string (`runningMatched`) instead of English words
  around two number spans.

### 8.2 Dark-mode + adaptive audit

`popup.css` / `pages.css` were audited line by line. What changed:

- Descriptions were single-line `ellipsis` truncation; they are
  now two-line `-webkit-line-clamp` with `overflow-wrap:
  break-word` (breaks at word boundaries; a long unbroken token
  such as a URL only breaks when it cannot fit on a line).
  `overflow-wrap: anywhere` and `word-break: break-all` are gone
  from names, descriptions, `.mono`, meta values, chips, and the
  source preview — all now `overflow-wrap: break-word`.
- Containers that could overflow at 390px got the missing guards:
  `.segments` / `.popup-footer` wrap, `.install-url-row input`
  and `.meta dd` got `min-width: 0`, the popup body got
  `max-width: 100vw`, and the settings language row drops its
  segmented control onto its own full-width line below 520px so
  the hint text is not squeezed beside it.
- No fixed white/black fills remain: the only literal `#fff` /
  `#fff8e1` values are the light-mode token definitions
  themselves, the iOS switch knob (white in both modes, as on
  iOS), and the demo-note amber, which has a dark-mode override.
  Cards render `#FFFFFF` on `#F2F2F7` in light mode and `#2C2C2E`
  on `#1C1C1E` in dark mode (verified by computed style, §8.5).

### 8.3 Settings sync with the native app (shared contract)

Contract (both sides implement it):

- App Group suite `group.com.openmonkey.safari` keys:
  `OpenMonkeyGlobalEnabled` (Bool, default true),
  `OpenMonkeyLanguage` (String `"system"|"zh"|"en"`, default
  `"system"`).
- Native messages (via `OM_NATIVE` → `chrome.runtime.
  sendNativeMessage`, host `'com.openmonkey.native'`):
  `{"type": "getSettings"}` → `{"ok": true, "globalEnabled":
  Bool, "language": String}`; `{"type": "setSettings",
  "globalEnabled"?, "language"?}` → writes present keys, replies
  `{"ok": true}`.
- Extension settings key `openmonkey.settings.v1` gains optional
  `language` (default `"system"`).

Web-side flow (`src/background/index.ts`):

- `mergeNativeSettings(local, native)` (pure, tested): native
  wins for `globalEnabled` and `language` when the reply carries
  a valid value; `updateCheckIntervalDays` is never clobbered;
  a native error reply (`ok: false`), a non-object reply, or a
  reply with wrongly typed values leaves the local settings
  untouched.
- `syncNativeSettings()`: reads local settings, asks the native
  side via `getSettings` (1.5 s timeout), merges, writes back
  only when something changed, and returns the merged settings.
  It never throws — no native messaging, a native error, or a
  timeout all resolve to the local settings, silently.
- The background runs that sync once on init, and answers a new
  message type `OM_SYNC_NATIVE_SETTINGS` with `{ ok: true,
  settings }` so a UI can trigger the same sync on open.
  `OM_SET_SETTINGS` (alarm rebuild) and every other message type
  are unchanged.
- The popup and the dashboard both send
  `OM_SYNC_NATIVE_SETTINGS` on open and render in the merged
  language. When the user flips the global switch or changes
  language in the web UI, after saving to `chrome.storage.local`
  they best-effort push the new values to the native side via the
  existing `OM_NATIVE` passthrough (`storage.ts:
  pushSettingsToNative`, 1.5 s timeout, failures silent).

### 8.4 Versions

`package.json` 0.3.0 → 0.4.0; `extension/manifest.json`
`"version"` 0.1.0 → 0.4.0 (the extension target's version had
never been bumped past 0.1.0). The `0.1.0` strings in
`src/gm/gm.ts` and `src/content/loader.ts` are the internal GM
API version, not the extension version, and are untouched.

### 8.5 Verification (v0.4.0)

- `npm run build`, `npm test` (37/37 — 23 baseline + 14 new),
  `bash scripts/release-check.sh` — all green.
- `git diff --check` clean.
- New tests: `tests/i18n.test.ts` (dictionary completeness —
  every key present in both languages, no empty strings;
  interpolation; language resolution incl. explicit-override-wins
  and unknown-setting fallback; settings migration of stored
  settings without `language`) and `tests/native-sync.test.ts`
  (merge logic: native wins for globalEnabled/language, interval
  preserved, partial replies, failure → local kept;
  `OM_SYNC_NATIVE_SETTINGS` returns local settings when native
  messaging is absent).
- HTML/ID cross-check: every `el('…')` id referenced by
  `popup.ts` (30 ids) and `pages.ts` (59 ids) exists in
  `popup.html` / `pages.html`.
- Renders (Playwright Chromium Headless Shell, local HTTP server
  over `extension/dist`, 390px viewport; script:
  `/tmp/render/render.mjs`, plus `/tmp/render/system-lang.mjs`
  for the system-language check): `popup.html` and `pages.html`
  in all four combinations (light+zh, light+en, dark+zh, dark+en),
  list + settings-panel-open + detail views, plus a live click of
  the popup language switch in each combo. Inspected visually:
  cards clearly visible in both modes (computed `.list-container`
  background `rgb(255, 255, 255)` light / `rgb(44, 44, 46)`
  dark), no horizontal overflow (`scrollWidth` 390 =
  `innerWidth` in every combo), no mid-word truncation, nothing
  clipped or overlapping, Chinese correct with no English leaking
  through (and vice versa — programmatic leak check over the
  rendered text, 0 leaks in all 20 screenshots), language switch
  visible and working (live flip re-renders in the other
  language). The `"system"` default was verified end to end:
  zh-CN locale renders Chinese with `<html lang="zh">`, en-US
  renders English with `lang="en"`. Screenshots live under
  `.screenshots/v0.4.0/` (git-ignored).
- Dist grep audit: no hardcoded user-visible English strings
  remain in the built `dist/popup.js` / `dist/pages.js` (only the
  dictionary entries themselves and script-metadata templates);
  the HTML files carry English defaults as the pre-JS fallback,
  every one covered by a `data-i18n` hook and replaced on load.

Known remaining gaps (honest, not hidden):

- The native sync has not been exercised against a real native
  host: there is no native messaging host on this Linux VM, so
  the merge logic is verified by unit tests and by the
  no-native-messaging fallback path only. The first run against
  the real Swift host app is the real end-to-end check.
- The popup's `sendToBackground` timeout is 2 s while the
  background sync can take up to ~2.5 s worst case (storage read
  + 1.5 s native timeout + write); if it times out, the popup
  proceeds with local settings and picks the merged language up
  on its next open.
