<script lang="ts">
  import { openExternal } from '../lib/external';
  import { renderMarkdown } from '../lib/markdown';

  let { source }: { source: string } = $props();

  // Sanitized by DOMPurify (see lib/markdown.ts): the only place where HTML is injected.
  const html = $derived(renderMarkdown(source));

  /** Links never navigate the WebView: they open in the system browser. */
  function handleClick(event: MouseEvent) {
    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (href) void openExternal(href);
  }
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class="markdown" role="presentation" onclick={handleClick}>{@html html}</div>

<style>
  .markdown {
    overflow-wrap: anywhere;
  }

  .markdown :global(> :first-child) {
    margin-top: 0;
  }

  .markdown :global(> :last-child) {
    margin-bottom: 0;
  }

  .markdown :global(p),
  .markdown :global(ul),
  .markdown :global(ol),
  .markdown :global(blockquote),
  .markdown :global(pre),
  .markdown :global(table) {
    margin: 0.4em 0;
  }

  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4),
  .markdown :global(h5),
  .markdown :global(h6) {
    margin: 0.7em 0 0.3em;
    line-height: 1.25;
  }

  .markdown :global(h1) {
    font-size: 1.5em;
  }
  .markdown :global(h2) {
    font-size: 1.3em;
  }
  .markdown :global(h3) {
    font-size: 1.15em;
  }
  .markdown :global(h4),
  .markdown :global(h5),
  .markdown :global(h6) {
    font-size: 1em;
  }

  .markdown :global(ul),
  .markdown :global(ol) {
    padding-left: 1.5em;
  }

  .markdown :global(a) {
    color: var(--accent-hover);
    text-decoration: underline;
    cursor: pointer;
  }

  .markdown :global(blockquote) {
    padding: 0 0.9em;
    border-left: 3px solid var(--border);
    color: var(--text-muted);
  }

  .markdown :global(hr) {
    border: 0;
    border-top: 1px solid var(--border);
  }

  .markdown :global(code) {
    padding: 0.1em 0.35em;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'Cascadia Code', 'Cascadia Mono', Consolas, monospace;
    font-size: 0.9em;
  }

  .markdown :global(pre) {
    overflow-x: auto;
    padding: 0.7em 0.9em;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .markdown :global(pre code) {
    padding: 0;
    background: none;
    border: 0;
    font-size: 0.88em;
  }

  .markdown :global(table) {
    border-collapse: collapse;
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }

  .markdown :global(th),
  .markdown :global(td) {
    padding: 0.3em 0.7em;
    border: 1px solid var(--border);
    text-align: left;
  }

  .markdown :global(th) {
    background: var(--surface-raised);
  }
</style>
