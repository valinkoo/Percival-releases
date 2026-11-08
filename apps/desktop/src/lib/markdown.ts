/**
 * Markdown rendering for messages.
 *
 * Messages are written by other users (and, later, by bots and webhooks), so their content is
 * untrusted. Two layers protect the WebView:
 *   1. markdown-it runs with raw HTML disabled, so `<script>`, `<img onerror=...>` and friends
 *      are shown as text;
 *   2. DOMPurify then keeps only an allowlist of tags and attributes and of link protocols.
 * The strict CSP in tauri.conf.json is the last line of defence.
 */
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  // Chat convention: a single line break is a line break.
  breaks: true,
  typographer: false,
});
// Remote images would reveal the reader's IP address to any sender. Attachments come in v0.0.4.
markdown.disable('image');

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  's',
  'code',
  'pre',
  'blockquote',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(markdown.render(source), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    // Relative links mean nothing inside the app: only these protocols survive.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
