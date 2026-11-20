// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import SwiftUI
import WebKit

/// A plugin README. The core turns the source's Markdown or HTML into
/// sanitized HTML; this shows it in a web view with JavaScript off, styled
/// like the app (system font, accent links, light and dark), and opens every
/// link in the default browser instead of navigating.
struct PluginReadmeView: NSViewRepresentable {
    /// Sanitized HTML fragment from the core.
    let html: String
    /// Resolves relative links and images, when the source has a project page.
    var baseURL: URL?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        view.allowsMagnification = false
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        let document = Self.document(for: html)
        guard context.coordinator.loaded != document else { return }
        context.coordinator.loaded = document
        view.loadHTMLString(document, baseURL: baseURL)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loaded: String?

        func webView(
            _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
        ) {
            // The first load is our own document; anything after is a link.
            if action.navigationType == .other || action.request.url?.scheme == "about" {
                decisionHandler(.allow)
                return
            }
            if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    /// Wraps the fragment in a page whose look follows the system appearance.
    static func document(for fragment: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'">
        <style>\(css)</style></head><body>\(fragment)</body></html>
        """
    }

    private static let css = """
        :root { color-scheme: light dark; }
        body { font: 13px/1.5 -apple-system, system-ui, sans-serif; color: CanvasText;
               background: transparent; margin: 0; padding: 4px 2px 24px; overflow-wrap: anywhere; }
        h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.5em; }
        h1 { font-size: 1.6em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; }
        a { color: AccentColor; text-decoration: none; } a:hover { text-decoration: underline; }
        img { max-width: 100%; height: auto; border-radius: 4px; }
        pre, code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
        pre { padding: 10px 12px; border-radius: 8px; overflow-x: auto;
              background: color-mix(in srgb, CanvasText 6%, transparent); }
        :not(pre) > code { padding: 1px 4px; border-radius: 4px;
                           background: color-mix(in srgb, CanvasText 8%, transparent); }
        blockquote { margin: 0.8em 0; padding: 0 12px; color: GrayText;
                     border-left: 3px solid color-mix(in srgb, CanvasText 20%, transparent); }
        table { border-collapse: collapse; margin: 0.8em 0; display: block; overflow-x: auto; }
        th, td { padding: 4px 10px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }
        hr { border: 0; border-top: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }
        """
}
