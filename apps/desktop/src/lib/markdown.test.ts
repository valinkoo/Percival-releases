import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

/** Parses the rendered HTML back, to assert on the DOM instead of on strings. */
function dom(source: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(source);
  return root;
}

describe('markdown rendering', () => {
  it('renders titles, emphasis, lists, quotes and rules', () => {
    const root = dom(
      [
        '# Titre',
        '',
        '**gras** et *italique* et ~~barré~~',
        '',
        '- un',
        '- deux',
        '',
        '1. a',
        '2. b',
        '',
        '> citation',
        '',
        '---',
      ].join('\n'),
    );
    expect(root.querySelector('h1')?.textContent).toBe('Titre');
    expect(root.querySelector('strong')?.textContent).toBe('gras');
    expect(root.querySelector('em')?.textContent).toBe('italique');
    expect(root.querySelector('s')?.textContent).toBe('barré');
    expect(root.querySelectorAll('ul > li')).toHaveLength(2);
    expect(root.querySelectorAll('ol > li')).toHaveLength(2);
    expect(root.querySelector('blockquote')?.textContent?.trim()).toBe('citation');
    expect(root.querySelector('hr')).not.toBeNull();
  });

  it('renders tables', () => {
    const root = dom(['| Nom | Âge |', '|---|---|', '| Ana | 30 |', '| Bob | 41 |'].join('\n'));
    expect(root.querySelectorAll('thead th')).toHaveLength(2);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelector('tbody td')?.textContent).toBe('Ana');
  });

  it('renders inline code and fenced code blocks without interpreting their content', () => {
    const root = dom('Voici `x < y` :\n\n```js\nconst a = "<b>not bold</b>";\n```');
    expect(root.querySelector('p code')?.textContent).toBe('x < y');
    expect(root.querySelector('pre code')?.textContent).toContain('<b>not bold</b>');
    expect(root.querySelector('pre b')).toBeNull();
  });

  it('turns single line breaks into <br>, like a chat', () => {
    expect(dom('ligne 1\nligne 2').querySelectorAll('br')).toHaveLength(1);
  });

  it('links http(s) URLs automatically and hardens the links', () => {
    const root = dom('Voir https://example.com/page et [le site](https://example.org)');
    const links = [...root.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/page',
      'https://example.org',
    ]);
    for (const link of links) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
      expect(link.hasAttribute('target')).toBe(false);
    }
  });

  it('keeps mailto links', () => {
    expect(dom('[écrire](mailto:moi@example.com)').querySelector('a')?.getAttribute('href')).toBe(
      'mailto:moi@example.com',
    );
  });
});

describe('markdown rendering: hostile content', () => {
  const hostile: Array<[string, string]> = [
    ['script tag', '<script>alert(1)</script>'],
    ['img onerror', '<img src=x onerror="alert(1)">'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
    ['iframe', '<iframe src="https://evil.example"></iframe>'],
    ['inline handler', '<a href="https://example.com" onclick="alert(1)">x</a>'],
    ['style tag', '<style>body{display:none}</style>'],
    ['form', '<form action="https://evil.example"><input name="p"></form>'],
    ['details/ontoggle', '<details open ontoggle="alert(1)">x</details>'],
    ['math/mXSS', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['object', '<object data="https://evil.example"></object>'],
  ];

  it.each(hostile)('never produces live markup from raw HTML: %s', (_name, payload) => {
    const html = renderMarkdown(payload);
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(
      root.querySelector('script, img, svg, iframe, style, form, input, details, math, object'),
    ).toBeNull();
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        expect(attribute.startsWith('on'), `${attribute} on <${element.tagName}>`).toBe(false);
      }
    }
  });

  it.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['JaVaScRiPt: mixed case', '[x](JaVaScRiPt:alert(1))'],
    ['entity-encoded javascript:', '[x](&#106;avascript:alert(1))'],
    ['data: URL', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript:', '[x](vbscript:msgbox(1))'],
    ['file:', '[x](file:///C:/Windows/System32/calc.exe)'],
    ['relative', '[x](/etc/passwd)'],
    ['autolinked javascript', '<javascript:alert(1)>'],
  ])('never keeps an unsafe link target: %s', (_name, payload) => {
    const root = dom(payload);
    for (const link of root.querySelectorAll('a')) {
      // An unsafe target is removed (the anchor stays as inert text); a kept one is http(s)/mailto.
      const href = link.getAttribute('href');
      if (href !== null) expect(href).toMatch(/^(https?:|mailto:)/i);
    }
    expect(root.innerHTML).not.toMatch(/href="\s*(javascript|data|vbscript|file):/i);
  });

  it('does not load remote images (they would leak the reader address)', () => {
    const root = dom('![suivi](https://tracker.example/pixel.png)');
    expect(root.querySelector('img')).toBeNull();
    // Nothing is fetched on display: the target is only a link that must be clicked.
    expect(root.textContent).toContain('suivi');
  });

  it('drops style and data attributes', () => {
    const root = dom('<p style="position:fixed" data-x="1">x</p>\n\ntexte');
    expect(root.querySelector('[style], [data-x]')).toBeNull();
  });
});
