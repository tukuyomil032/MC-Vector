import rehypeSanitize, { type Options as SanitizeOptions } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import { isAllowedPluginBrowserUrl } from './plugin-model';
import styles from './markdown.module.css';

const HTML_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'center',
  'code',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'input',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
];

/**
 * Explicit policy for README HTML. Only the listed tags and attributes survive. Script, style, iframe,
 * object, embed and form are stripped with their contents. On* handlers, style attributes, javascript:
 * and data: URLs are not on the list, so they are dropped too. Images accept only https sources.
 */
export const README_SANITIZE_SCHEMA: SanitizeOptions = {
  tagNames: HTML_TAGS,
  attributes: {
    '*': ['title'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'align'],
    details: ['open'],
    div: ['align'],
    p: ['align'],
    h1: ['align'],
    h2: ['align'],
    h3: ['align'],
    h4: ['align'],
    table: ['align'],
    tr: ['align'],
    td: ['align', 'colSpan', 'rowSpan'],
    th: ['align', 'colSpan', 'rowSpan'],
    ol: ['start'],
    input: [['type', 'checkbox'], ['disabled', true], 'checked'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['https'],
  },
  strip: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'noscript',
    'template',
    'svg',
    'math',
    'textarea',
  ],
  clobber: [],
};

export interface PluginReadmeProps {
  /** Markdown or HTML-in-markdown from the provider. It is sanitized before it is shown. */
  markdown: string;
  /** Opens an approved provider URL through the app's external opener. */
  onOpenLink: (url: string) => void;
}

/**
 * Renders a plugin README the way the provider page does. Links to approved hosts open through the
 * app's opener. Other links show as plain text with the URL in a tooltip, so a README never navigates
 * the app window.
 */
export function PluginReadme({ markdown, onOpenLink }: PluginReadmeProps) {
  const components: Components = {
    a({ href, children }) {
      if (!href || href.startsWith('#')) {
        return <span>{children}</span>;
      }
      if (isAllowedPluginBrowserUrl(href)) {
        return (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onOpenLink(href);
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <Tooltip content={href}>
          <span className={styles.plainLink}>{children}</span>
        </Tooltip>
      );
    },
    img(props) {
      const { src, alt, width, height } = props;
      // align is a legacy img attribute that the React typings omit; it still arrives in props, so it is read here.
      const { align } = props as { align?: string };
      return (
        <img
          src={src}
          alt={alt ?? ''}
          width={width}
          height={height}
          data-align={align}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={styles.image}
        />
      );
    },
  };

  return (
    <div className={styles.markdown} data-testid="plugin-readme">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, README_SANITIZE_SCHEMA]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export default PluginReadme;
