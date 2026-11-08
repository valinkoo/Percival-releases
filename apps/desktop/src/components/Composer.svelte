<script lang="ts">
  import { MESSAGE_MAX_LENGTH } from '@percival/shared';
  import { chat } from '../lib/chat.svelte';

  let { channelId, channelName }: { channelId: string; channelName: string } = $props();

  let content = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let field = $state<HTMLTextAreaElement>();

  const tooLong = $derived(content.length > MESSAGE_MAX_LENGTH);
  const canSend = $derived(content.trim() !== '' && !tooLong && !sending);
  const nearLimit = $derived(content.length > MESSAGE_MAX_LENGTH * 0.9);

  // Grow with the text, up to a limit (then the field scrolls).
  $effect(() => {
    void content;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  });

  async function submit() {
    if (!canSend) return;
    sending = true;
    error = null;
    const failure = await chat.send(channelId, content);
    sending = false;
    if (failure) {
      error = failure; // The text stays in the field so nothing is lost.
    } else {
      content = '';
    }
    field?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    // Enter sends, Shift+Enter adds a line. Ignored while an IME composition is in progress.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  }
</script>

<form
  class="composer"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <div class="row">
    <textarea
      bind:this={field}
      bind:value={content}
      onkeydown={handleKeydown}
      rows="1"
      placeholder={`Écrire dans #${channelName} (Markdown accepté, Maj+Entrée pour un retour à la ligne)`}
      aria-label={`Message dans #${channelName}`}></textarea>
    <button type="submit" disabled={!canSend}>{sending ? 'Envoi…' : 'Envoyer'}</button>
  </div>
  {#if nearLimit}
    <p class="counter" class:over={tooLong}>{content.length} / {MESSAGE_MAX_LENGTH}</p>
  {/if}
</form>

<style>
  .composer {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  textarea {
    flex: 1;
    resize: none;
    padding: 10px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    line-height: 1.4;
  }

  textarea:focus-visible {
    border-color: var(--focus);
    outline-offset: 0;
  }

  button {
    padding: 10px 18px;
    background: var(--accent);
    border: 0;
    border-radius: 8px;
    color: var(--accent-text);
    font-weight: 600;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0 0 8px;
    padding: 8px 10px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  .counter {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    text-align: right;
  }

  .counter.over {
    color: var(--danger-text);
    font-weight: 600;
  }
</style>
