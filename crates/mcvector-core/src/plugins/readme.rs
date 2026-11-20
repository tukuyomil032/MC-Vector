//! Provider README rendering. Sanitization is always the final transformation.
use super::{
    catalog::{hangar, modrinth, spiget},
    installer::ProjectRef,
    model::{project_url, PluginSource},
};
use pulldown_cmark::{html, Event, Options, Parser};
use reqwest::Url;

pub async fn project_html(project: &ProjectRef) -> Result<Option<String>, String> {
    let (source, body, url) = match project {
        ProjectRef::Modrinth { project_id } => (
            PluginSource::Modrinth,
            modrinth::project_body(project_id).await?,
            project_url("https://modrinth.com/project/", &[project_id]),
        ),
        ProjectRef::Hangar { owner, slug } => (
            PluginSource::Hangar,
            hangar::project_body(owner, slug).await?,
            project_url("https://hangar.papermc.io/", &[owner, slug]),
        ),
        ProjectRef::Spiget { resource_id } => (
            PluginSource::Spiget,
            spiget::resource_body(*resource_id).await?,
            Url::parse(&format!(
                "https://www.spigotmc.org/resources/{resource_id}/"
            ))
            .ok(),
        ),
    };
    let url = url.ok_or("Invalid project URL")?;
    Ok(body.map(|body| render(source, &body, url)))
}

pub fn safe_html(source: PluginSource, body: &str, project_url: &str) -> Result<String, String> {
    let base = Url::parse(project_url).map_err(|_| "Invalid project URL")?;
    if base.scheme() != "https" || !base.username().is_empty() || base.password().is_some() {
        return Err("Invalid project URL".into());
    }
    if source == PluginSource::Spiget {
        return Ok(render(source, &spiget::decode_body(body), base));
    }
    Ok(render(source, body, base))
}

fn render(source: PluginSource, body: &str, base: Url) -> String {
    let normalized = body.replace("\r\n", "\n");
    let raw = if source == PluginSource::Spiget {
        normalized
    } else {
        let mut rendered = String::new();
        let parser = Parser::new_ext(
            &normalized,
            Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS,
        );
        html::push_html(
            &mut rendered,
            parser.map(|event| match event {
                // Render task state without permitting author-provided form controls.
                Event::TaskListMarker(checked) => {
                    Event::Text(if checked { "☑ " } else { "☐ " }.into())
                }
                other => other,
            }),
        );
        rendered
    };
    let mut clean = ammonia::Builder::default();
    clean
        .tags(
            [
                "a",
                "b",
                "blockquote",
                "br",
                "caption",
                "code",
                "dd",
                "del",
                "details",
                "div",
                "dl",
                "dt",
                "em",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "hr",
                "i",
                "img",
                "kbd",
                "li",
                "ol",
                "p",
                "pre",
                "s",
                "span",
                "strong",
                "sub",
                "summary",
                "sup",
                "table",
                "tbody",
                "td",
                "th",
                "thead",
                "tr",
                "ul",
            ]
            .into_iter()
            .collect(),
        )
        .add_clean_content_tags([
            "iframe", "form", "object", "embed", "svg", "math", "template",
        ])
        .url_schemes(["https", "http"].into_iter().collect())
        .url_relative(ammonia::UrlRelative::RewriteWithBase(base));
    clean.clean(&raw).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    #[test]
    fn strips_executable_markup_and_resolves_relative_urls() {
        let html = safe_html(PluginSource::Modrinth, r#"<script>alert(1)</script><style>x</style><iframe src='https://evil.test'></iframe><form><input></form><img src='images/a.png' onerror='boom()'><a href='javascript:alert(1)'>x</a>"#, "https://modrinth.com/project/a/").unwrap();
        for forbidden in [
            "<script",
            "<style",
            "<iframe",
            "<form",
            "<input",
            "onerror",
            "javascript:",
        ] {
            assert!(!html.contains(forbidden), "{html}");
        }
        assert!(html.contains("https://modrinth.com/project/a/images/a.png"));
    }
    #[test]
    fn keeps_gfm_and_code() {
        let html = safe_html(
            PluginSource::Hangar,
            "| A | B |\n|---|---|\n| 1 | 2 |\n\n~~old~~\n\n- [x] done\n\n```rust\nlet x = 1;\n```",
            "https://hangar.papermc.io/o/p",
        )
        .unwrap();
        assert!(html.contains("<table>"));
        assert!(html.contains("<del>old</del>"));
        assert!(html.contains("<code"));
        assert!(html.contains("☑ done"));
    }
    #[test]
    fn decodes_spiget_and_sanitizes_encoded_attacks() {
        let encoded = base64::engine::general_purpose::STANDARD_NO_PAD
            .encode("<b>ok</b><script>bad()</script>");
        let html = safe_html(
            PluginSource::Spiget,
            &encoded,
            "https://www.spigotmc.org/resources/1/",
        )
        .unwrap();
        assert!(html.contains("<b>ok</b>"));
        assert!(!html.contains("bad()"));
    }
}
