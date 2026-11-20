import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// The script editor, rebuilt for v0.3.0 as a dark code editor: a
/// dark background, a line-number gutter that scrolls with the text,
/// and basic syntax highlighting (keywords, strings, comments,
/// numbers). The "…" menu holds Save and the other actions; the
/// status bar shows the character count and whether there are
/// unsaved changes.
///
/// The dark theme follows the "Code Editor" toggle on the Home card
/// (`OpenMonkeyDarkEditor`); turning it off gives a light editor.
/// Live metadata validation and save / discard behaviour are
/// unchanged from the previous editor: the `// ==UserScript==`
/// header is checked as you type, and saving is only possible once
/// it parses. Validation is done by the bundled Swift parser
/// (`Shared/MetadataParser.swift`) — no JavaScript engine is
/// involved.
///
/// On macOS the editor is a plain monospaced TextEditor (no gutter
/// or highlighting yet); the dark editor is iOS-only for now.
struct EditorView: View {

    @EnvironmentObject private var store: ScriptStore
    @EnvironmentObject private var lang: OMLanguageManager
    @Environment(\.dismiss) private var dismiss

    /// The dark editor preference, shared with the extension through
    /// the App Group suite (v0.5.0: no longer app-local `@AppStorage`).
    @EnvironmentObject private var sharedSettings: OMSharedSettings

    /// The script being edited, or `nil` for a brand-new script.
    private var script: StoredScript?

    @State private var source: String
    @State private var parseError: MetadataParseError?
    @State private var parsedMetadata: UserscriptMetadata?
    @State private var showingDiscardConfirmation = false
    @State private var showingSaveError = false
    @State private var saveErrorMessage = ""
    @State private var savedFileName: String?

    /// The source the editor started with, used to detect unsaved changes.
    private let originalSource: String

    init(script: StoredScript? = nil) {
        self.script = script
        // The source is loaded here (not in `onAppear`) so the editor
        // shows the file contents on first render.
        let initial: String
        if let script = script {
            // A fresh store read is acceptable here: the library already
            // loaded this file, and the editor is opened from it.
            initial = ScriptStore().loadScript(fileName: script.fileName)
                ?? MetadataParser.template(name: script.name)
        } else {
            initial = MetadataParser.template()
        }
        _source = State(initialValue: initial)
        originalSource = initial
    }

    private var hasUnsavedChanges: Bool { source != originalSource }

    /// The editor theme colour for the background behind the status
    /// bar: dark `#1E1E1E` / white, matching
    /// `CodeEditorContainerView.applyTheme`.
    private var editorBackground: Color {
        sharedSettings.darkEditor
            ? Color(red: 0x1E / 255.0, green: 0x1E / 255.0, blue: 0x1E / 255.0)
            : .white
    }

    var body: some View {
        VStack(spacing: 0) {
            metadataBanner
            CodeEditorView(text: $source, dark: sharedSettings.darkEditor)
                .onChange(of: source) { _ in validate() }
            Divider()
            HStack {
                Text(hasUnsavedChanges ? lang.text(.unsavedChanges) : lang.text(.allChangesSaved))
                    .font(.caption)
                    .foregroundColor(hasUnsavedChanges ? .orange : .secondary)
                Spacer()
                Text(lang.format(.charactersCount, source.count))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        // The editor's own theme colour (same values as
        // `CodeEditorContainerView.applyTheme`): the strip behind the
        // status bar — and the safe-area strips in a sheet — must be
        // the editor colour, not the page or system background, or a
        // blank band shows under the status bar. No bottom padding
        // for the pill here (v0.5.1): when pushed from the Home card
        // the root `VStack` reserves the pill strip, so this view's
        // available height ends above the pill and the status bar
        // sits directly above it; sheets get no pill strip at all.
        .background(editorBackground.ignoresSafeArea())
        .navigationTitle(navigationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(lang.text(.discard)) {
                    if hasUnsavedChanges {
                        showingDiscardConfirmation = true
                    } else {
                        dismiss()
                    }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(lang.text(.save)) { save() }
                        .disabled(parsedMetadata == nil)
                    Button(lang.text(.copySource)) { copySource() }
                    Button(lang.text(.discardChanges), role: .destructive) {
                        if hasUnsavedChanges {
                            showingDiscardConfirmation = true
                        } else {
                            dismiss()
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(lang.text(.save)) { save() }
                    // Saving is only possible once the metadata block
                    // parses; `save()` re-validates and shows the error
                    // inline when it does not.
                    .disabled(parsedMetadata == nil)
            }
        }
        .alert(lang.text(.discardChangesTitle), isPresented: $showingDiscardConfirmation) {
            Button(lang.text(.discard), role: .destructive) { dismiss() }
            Button(lang.text(.keepEditing), role: .cancel) { }
        } message: {
            Text(lang.text(.discardChangesMessage))
        }
        .alert(lang.text(.couldNotSave), isPresented: $showingSaveError) {
            Button(lang.text(.ok), role: .cancel) { }
        } message: {
            Text(saveErrorMessage)
        }
        .onAppear { validate() }
    }

    // MARK: - Metadata banner

    @ViewBuilder
    private var metadataBanner: some View {
        if let error = parseError {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text(error.localizedDescription)
                    .font(.footnote)
                Spacer()
            }
            .padding(10)
            .background(Color.orange.opacity(0.12))
        } else if let metadata = parsedMetadata {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(metadata.name)
                        .font(.footnote)
                        .fontWeight(.semibold)
                    Text("v\(metadata.version)"
                        + (metadata.urlPatterns.isEmpty
                            ? "" : " · \(metadata.urlPatterns.joined(separator: ", "))"))
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                if let savedFileName = savedFileName {
                    Text(savedFileName)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(10)
            .background(Color.green.opacity(0.08))
        }
    }

    private var navigationTitle: String {
        if let metadata = parsedMetadata { return metadata.name }
        return script?.name ?? lang.text(.editorNewScript)
    }

    // MARK: - Validation and saving

    private func validate() {
        do {
            parsedMetadata = try MetadataParser.parse(source: source)
            parseError = nil
        } catch let error as MetadataParseError {
            parsedMetadata = nil
            parseError = error
        } catch {
            parsedMetadata = nil
            parseError = .missingBlock
        }
    }

    private func save() {
        // Validate first so a script is never saved with a broken header
        // without the author knowing.
        validate()
        guard let metadata = parsedMetadata else { return }
        do {
            let fileName = try store.saveScript(
                name: metadata.name, source: source,
                fileName: script?.fileName ?? savedFileName)
            savedFileName = fileName
            dismiss()
        } catch let error as ScriptStoreError {
            saveErrorMessage = error.localizedDescription
            showingSaveError = true
        } catch {
            saveErrorMessage = error.localizedDescription
            showingSaveError = true
        }
    }

    private func copySource() {
        #if os(iOS)
        UIPasteboard.general.string = source
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(source, forType: .string)
        #endif
    }
}

/// The code editing surface: on iOS a `UITextView` with a scrolling
/// line-number gutter and syntax highlighting; on macOS a plain
/// monospaced `TextEditor` (gutter and highlighting are iOS-only
/// for now).
struct CodeEditorView: View {
    @Binding var text: String
    var dark: Bool

    var body: some View {
        #if os(iOS)
        CodeTextView(text: $text, dark: dark)
            .ignoresSafeArea(.keyboard)
        #elseif os(macOS)
        TextEditor(text: $text)
            .font(.system(.body, design: .monospaced))
            .autocapitalization(.none)
            .disableAutocorrection(true)
            .padding(.horizontal, 4)
        #endif
    }
}

#if os(iOS)
/// A `UITextView`-based code editor with a line-number gutter and
/// regex syntax highlighting. Highlighting only changes attributes,
/// never the text, so the caret stays put while typing.
private struct CodeTextView: UIViewRepresentable {
    @Binding var text: String
    var dark: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> CodeEditorContainerView {
        let view = CodeEditorContainerView()
        view.editor.delegate = context.coordinator
        view.applyTheme(dark: dark)
        view.setText(text)
        return view
    }

    func updateUIView(_ uiView: CodeEditorContainerView, context: Context) {
        uiView.applyTheme(dark: dark)
        if uiView.editor.text != text {
            uiView.setText(text)
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: CodeTextView

        init(_ parent: CodeTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            guard let container = textView.superview as? CodeEditorContainerView else { return }
            container.highlight()
            container.updateGutter()
            if parent.text != textView.text {
                parent.text = textView.text
            }
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            guard let container = scrollView.superview as? CodeEditorContainerView else { return }
            var offset = container.gutter.contentOffset
            offset.y = scrollView.contentOffset.y
            container.gutter.contentOffset = offset
        }
    }
}

/// The container view: a non-editable gutter on the left and the
/// editable text view on the right, sharing one scroll position.
private final class CodeEditorContainerView: UIView {

    let gutter = UITextView()
    let editor = UITextView()
    private var isDark = true

    private var font: UIFont {
        UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        gutter.isEditable = false
        gutter.isSelectable = false
        gutter.isScrollEnabled = false
        gutter.backgroundColor = .clear
        gutter.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 6)
        gutter.textAlignment = .right
        gutter.font = font

        editor.backgroundColor = .clear
        editor.autocorrectionType = .no
        editor.autocapitalizationType = .none
        editor.smartQuotesType = .no
        editor.smartDashesType = .no
        editor.smartInsertDeleteType = .no
        editor.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 8, right: 8)
        editor.font = font

        addSubview(gutter)
        addSubview(editor)
        gutter.translatesAutoresizingMaskIntoConstraints = false
        editor.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            gutter.leadingAnchor.constraint(equalTo: leadingAnchor),
            gutter.topAnchor.constraint(equalTo: topAnchor),
            gutter.bottomAnchor.constraint(equalTo: bottomAnchor),
            gutter.widthAnchor.constraint(equalToConstant: 40),
            editor.leadingAnchor.constraint(equalTo: gutter.trailingAnchor),
            editor.trailingAnchor.constraint(equalTo: trailingAnchor),
            editor.topAnchor.constraint(equalTo: topAnchor),
            editor.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    func setText(_ text: String) {
        editor.text = text
        highlight()
        updateGutter()
    }

    func applyTheme(dark: Bool) {
        isDark = dark
        backgroundColor = dark
            ? UIColor(red: 0x1E / 255.0, green: 0x1E / 255.0, blue: 0x1E / 255.0, alpha: 1)
            : .white
        gutter.textColor = dark
            ? UIColor(white: 0.52, alpha: 1)
            : UIColor(white: 0.6, alpha: 1)
        highlight()
    }

    /// Rebuilds the gutter text from the current line count.
    func updateGutter() {
        let lineCount = max(1, editor.text.components(separatedBy: "\n").count)
        gutter.text = (1...lineCount).map(String.init).joined(separator: "\n")
    }

    /// Applies syntax colours to the whole document: comments,
    /// strings, numbers, then keywords — one pass, one regex, so a
    /// `//` inside a string is never mistaken for a comment.
    func highlight() {
        let storage = editor.textStorage
        let fullRange = NSRange(location: 0, length: storage.length)
        guard fullRange.length > 0 else { return }

        let baseColor: UIColor = isDark
            ? UIColor(red: 0xD4 / 255.0, green: 0xD4 / 255.0, blue: 0xD4 / 255.0, alpha: 1)
            : UIColor(red: 0x1E / 255.0, green: 0x1E / 255.0, blue: 0x1E / 255.0, alpha: 1)
        let commentColor: UIColor = isDark
            ? UIColor(red: 0x6A / 255.0, green: 0x99 / 255.0, blue: 0x55 / 255.0, alpha: 1)
            : UIColor(red: 0x00 / 255.0, green: 0x80 / 255.0, blue: 0x00 / 255.0, alpha: 1)
        let stringColor: UIColor = isDark
            ? UIColor(red: 0xCE / 255.0, green: 0x91 / 255.0, blue: 0x78 / 255.0, alpha: 1)
            : UIColor(red: 0xA3 / 255.0, green: 0x15 / 255.0, blue: 0x15 / 255.0, alpha: 1)
        let keywordColor: UIColor = isDark
            ? UIColor(red: 0x56 / 255.0, green: 0x9C / 255.0, blue: 0xD6 / 255.0, alpha: 1)
            : UIColor(red: 0x00 / 255.0, green: 0x00 / 255.0, blue: 0xFF / 255.0, alpha: 1)
        let numberColor: UIColor = isDark
            ? UIColor(red: 0xB5 / 255.0, green: 0xCE / 255.0, blue: 0xA8 / 255.0, alpha: 1)
            : UIColor(red: 0x09 / 255.0, green: 0x86 / 255.0, blue: 0x58 / 255.0, alpha: 1)

        storage.beginEditing()
        storage.addAttributes(
            [.font: font, .foregroundColor: baseColor], range: fullRange)
        let pattern = "(//[^\\n]*|/\\*[\\s\\S]*?\\*/)"
            + "|(\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)"
            + "|(\\b\\d+(?:\\.\\d+)?\\b)"
            + "|(\\b(?:const|let|var|function|return|if|else|for|while|do|new|class|extends|import|export|from|await|async|typeof|instanceof|in|of|switch|case|break|continue|try|catch|finally|throw|delete|void|null|true|false|this|super)\\b)"
        if let regex = try? NSRegularExpression(pattern: pattern, options: []) {
            regex.enumerateMatches(in: editor.text, options: [], range: fullRange) { match, _, _ in
                guard let match = match else { return }
                if match.range(at: 1).location != NSNotFound {
                    let italic = font.withTraits(.traitItalic) ?? font
                    storage.addAttributes(
                        [.foregroundColor: commentColor, .font: italic],
                        range: match.range(at: 1))
                } else if match.range(at: 2).location != NSNotFound {
                    storage.addAttribute(
                        .foregroundColor, value: stringColor, range: match.range(at: 2))
                } else if match.range(at: 3).location != NSNotFound {
                    storage.addAttribute(
                        .foregroundColor, value: numberColor, range: match.range(at: 3))
                } else if match.range(at: 4).location != NSNotFound {
                    storage.addAttribute(
                        .foregroundColor, value: keywordColor, range: match.range(at: 4))
                }
            }
        }
        storage.endEditing()
    }
}

private extension UIFont {
    /// The same font with extra symbolic traits (for italic comments).
    func withTraits(_ traits: UIFontDescriptor.SymbolicTraits) -> UIFont? {
        guard let descriptor = fontDescriptor.withSymbolicTraits(traits) else { return nil }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
#endif

#if DEBUG
struct EditorView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            EditorView()
        }
        .environmentObject(ScriptStore())
        .environmentObject(OMLanguageManager())
        .environmentObject(OMSharedSettings())
    }
}
#endif
