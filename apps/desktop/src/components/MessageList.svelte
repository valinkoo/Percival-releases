<script lang="ts">
  import { tick } from 'svelte';
  import { chat } from '../lib/chat.svelte';
  import { formatFullDate, formatTimestamp } from '../lib/format';
  import MarkdownContent from './MarkdownContent.svelte';

  let { channelId }: { channelId: string } = $props();

  /** Consecutive messages of one author, a few minutes apart, share a single header. */
  const GROUP_WINDOW_MS = 5 * 60 * 1000;
  const NEAR_BOTTOM_PX = 80;
  const NEAR_TOP_PX = 40;

  let container = $state<HTMLDivElement>();
  let pinnedToBottom = true;
  let displayedChannel: string | undefined;

  const history = $derived(chat.histories[channelId]);

  const rows = $derived(
    (history?.messages ?? []).map((message, index, all) => {
      const previous = all[index - 1];
      const grouped =
        previous !== undefined &&
        previous.author.id === message.author.id &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
          GROUP_WINDOW_MS;
      return { message, showHeader: !grouped };
    }),
  );

  function scrollToBottom() {
    void tick().then(() => {
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  // Follow new messages while the reader is at the bottom; start at the bottom on a new channel.
  $effect(() => {
    void history?.messages.length;
    if (displayedChannel !== channelId) {
      displayedChannel = channelId;
      pinnedToBottom = true;
    }
    if (pinnedToBottom) scrollToBottom();
  });

  async function loadOlder() {
    if (!container || !history?.nextBefore || history.loadingOlder) return;
    const heightBefore = container.scrollHeight;
    const topBefore = container.scrollTop;
    await chat.loadOlder(channelId);
    await tick();
    // Keep what the reader was looking at in place instead of jumping to the new top.
    if (container) container.scrollTop = topBefore + (container.scrollHeight - heightBefore);
  }

  function handleScroll() {
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    pinnedToBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    if (container.scrollTop < NEAR_TOP_PX) void loadOlder();
  }
</script>

<div class="messages" bind:this={container} onscroll={handleScroll}>
  {#if !history || (history.loading && history.messages.length === 0)}
    <p class="state">Chargement des messages…</p>
  {:else if history.error && history.messages.length === 0}
    <div class="state">
      <p role="alert">{history.error}</p>
      <button type="button" onclick={() => chat.retryHistory(channelId)}>Réessayer</button>
    </div>
  {:else}
    {#if history.nextBefore}
      <button type="button" class="older" onclick={loadOlder} disabled={history.loadingOlder}>
        {history.loadingOlder ? 'Chargement…' : 'Charger les messages précédents'}
      </button>
    {:else if history.messages.length > 0}
      <p class="beginning">Début du salon</p>
    {/if}

    {#if history.error}
      <p class="inline-error" role="alert">{history.error}</p>
    {/if}

    {#if history.messages.length === 0}
      <p class="state">Aucun message pour l'instant. Écrivez le premier !</p>
    {/if}

    {#each rows as { message, showHeader } (message.id)}
      <article class="message" class:grouped={!showHeader}>
        {#if showHeader}
          <header>
            <span class="author">{message.author.username}</span>
            {#if message.author.isBot}<span class="badge">BOT</span>{/if}
            <time datetime={message.createdAt} title={formatFullDate(message.createdAt)}>
              {formatTimestamp(message.createdAt)}
            </time>
          </header>
        {/if}
        <MarkdownContent source={message.content} />
      </article>
    {/each}
  {/if}
</div>

<style>
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .state {
    margin: 40px 0;
    color: var(--text-muted);
    text-align: center;
  }

  .beginning {
    margin: 0 0 16px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }

  .older {
    display: block;
    margin: 0 auto 16px;
    padding: 6px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 13px;
    cursor: pointer;
  }

  .older:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .inline-error {
    margin: 0 0 12px;
    color: var(--danger-text);
    font-size: 14px;
    text-align: center;
  }

  .state button {
    margin-top: 8px;
    padding: 6px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }

  .message {
    margin-top: 14px;
  }

  .message.grouped {
    margin-top: 2px;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .author {
    font-weight: 600;
  }

  .badge {
    padding: 0 6px;
    background: var(--accent);
    border-radius: 4px;
    color: var(--accent-text);
    font-size: 11px;
    font-weight: 700;
  }

  time {
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
