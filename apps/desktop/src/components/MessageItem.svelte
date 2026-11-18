<script lang="ts">
  import { MESSAGE_MAX_LENGTH, outranks, type MessageDto } from '@percival/shared';
  import { chat } from '../lib/chat.svelte';
  import { formatFullDate, formatTimestamp } from '../lib/format';
  import { can } from '../lib/roles';
  import { session } from '../lib/session.svelte';
  import AttachmentList from './AttachmentList.svelte';
  import MarkdownContent from './MarkdownContent.svelte';

  let { message, showHeader }: { message: MessageDto; showHeader: boolean } = $props();

  /** Only the author edits a message. */
  const isOwn = $derived(message.author.id === session.user?.id);

  /**
   * A moderator deletes the messages of anyone they outrank. A server that predates roles sends no
   * author role: nothing is offered then. The server decides again when the message is deleted.
   */
  const canModerate = $derived(
    !isOwn &&
      message.author.role !== undefined &&
      can(session.user?.roles, 'message.moderate') &&
      outranks(session.user?.roles ?? [], [message.author.role]),
  );

  let editing = $state(false);
  let draft = $state('');
  let confirmingDelete = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let field = $state<HTMLTextAreaElement>();

  // A server that predates attachments sends none: the app updates itself before the server does.
  const attachments = $derived(message.attachments ?? []);

  const tooLong = $derived(draft.length > MESSAGE_MAX_LENGTH);
  // The text may be emptied when files remain: they stand on their own.
  const canSave = $derived((draft.trim() !== '' || attachments.length > 0) && !tooLong && !busy);

  function startEdit() {
    draft = message.content;
    error = null;
    confirmingDelete = false;
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    error = null;
  }

  // Focus the field when the editor opens, with the cursor at the end of the text.
  $effect(() => {
    if (editing && field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  });

  // Grow with the text, up to a limit (then the field scrolls).
  $effect(() => {
    void draft;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  });

  async function save() {
    if (!canSave) return;
    busy = true;
    error = null;
    const failure = await chat.editMessage(message, draft);
    busy = false;
    if (failure) {
      error = failure; // The text stays in the editor so nothing is lost.
    } else {
      editing = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  function askDelete() {
    error = null;
    confirmingDelete = true;
  }

  async function confirmDelete() {
    busy = true;
    error = null;
    const failure = await chat.deleteMessage(message);
    busy = false;
    if (failure) error = failure;
    // On success the message leaves the list, and this component with it.
  }
</script>

<article class="message" class:grouped={!showHeader} class:editing>
  {#if (isOwn || canModerate) && !editing && !confirmingDelete}
    <div class="actions">
      {#if isOwn}
        <button type="button" onclick={startEdit}>Modifier</button>
      {/if}
      <button type="button" class="danger" onclick={askDelete}>Supprimer</button>
    </div>
  {/if}

  {#if showHeader}
    <header>
      <span class="author">{message.author.username}</span>
      {#if message.author.isBot}<span class="badge">BOT</span>{/if}
      <time datetime={message.createdAt} title={formatFullDate(message.createdAt)}>
        {formatTimestamp(message.createdAt)}
      </time>
    </header>
  {/if}

  {#if editing}
    <div class="editor">
      <textarea
        bind:this={field}
        bind:value={draft}
        onkeydown={handleKeydown}
        rows="1"
        aria-label="Modifier le message"></textarea>
      <div class="editor-actions">
        <button type="button" class="primary" onclick={save} disabled={!canSave}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" onclick={cancelEdit} disabled={busy}>Annuler</button>
        <span class="hint">Échap pour annuler, Entrée pour enregistrer</span>
        {#if tooLong}
          <span class="over">{draft.length} / {MESSAGE_MAX_LENGTH}</span>
        {/if}
      </div>
    </div>
  {:else}
    {#if message.content !== ''}
      <MarkdownContent source={message.content} />
    {/if}
    <AttachmentList {attachments} />
    {#if message.editedAt}
      <span class="edited" title={`Modifié le ${formatFullDate(message.editedAt)}`}>(modifié)</span>
    {/if}
  {/if}

  {#if confirmingDelete}
    <div class="confirm" role="alertdialog" aria-label="Confirmer la suppression">
      <span>
        {isOwn
          ? 'Supprimer ce message pour tout le monde ?'
          : `Supprimer ce message de ${message.author.username} pour tout le monde ?`}
      </span>
      <button type="button" class="danger-solid" onclick={confirmDelete} disabled={busy}>
        {busy ? 'Suppression…' : 'Supprimer'}
      </button>
      <button type="button" onclick={() => (confirmingDelete = false)} disabled={busy}>
        Annuler
      </button>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</article>

<style>
  .message {
    position: relative;
    margin-top: 14px;
    padding: 2px 6px;
    margin-left: -6px;
    margin-right: -6px;
    border-radius: 6px;
  }

  .message.grouped {
    margin-top: 2px;
  }

  .message:hover,
  .message:focus-within,
  .message.editing {
    background: var(--surface);
  }

  .actions {
    position: absolute;
    top: -12px;
    right: 8px;
    display: none;
    gap: 4px;
    padding: 2px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .message:hover .actions,
  .message:focus-within .actions {
    display: flex;
  }

  .actions button {
    padding: 3px 9px;
    background: none;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
  }

  .actions button:hover {
    background: var(--surface);
    color: var(--text);
  }

  .actions .danger:hover {
    color: var(--danger-text);
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

  .edited {
    margin-left: 4px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .editor textarea {
    width: 100%;
    resize: none;
    padding: 8px 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    line-height: 1.4;
  }

  .editor textarea:focus-visible {
    border-color: var(--focus);
    outline-offset: 0;
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .editor-actions button,
  .confirm button {
    padding: 4px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .editor-actions .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .editor-actions button:disabled,
  .confirm button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
  }

  .over {
    color: var(--danger-text);
    font-size: 12px;
    font-weight: 600;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  .confirm .danger-solid {
    background: var(--danger-text);
    border-color: var(--danger-text);
    color: var(--surface);
    font-weight: 600;
  }

  .error {
    margin: 6px 0 0;
    color: var(--danger-text);
    font-size: 13px;
  }
</style>
