<script lang="ts">
  import { ATTACHMENT_EXTENSIONS, MESSAGE_MAX_LENGTH } from '@percival/shared';
  import { chat } from '../lib/chat.svelte';
  import { addPendingFiles } from '../lib/pending-files';
  import PendingFile from './PendingFile.svelte';

  let { channelId, channelName }: { channelId: string; channelName: string } = $props();

  /** Suggested to the file picker. Only a hint: the server checks what each file really is. */
  const PICKER_ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');

  let content = $state('');
  let files = $state<File[]>([]);
  let sending = $state(false);
  let error = $state<string | null>(null);
  /** Files refused before sending (too big, too many...), shown until the next change. */
  let problems = $state<string[]>([]);
  let dragging = $state(false);
  let field = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let dragDepth = 0;

  const tooLong = $derived(content.length > MESSAGE_MAX_LENGTH);
  // A message needs text or at least one file.
  const canSend = $derived((content.trim() !== '' || files.length > 0) && !tooLong && !sending);
  const nearLimit = $derived(content.length > MESSAGE_MAX_LENGTH * 0.9);

  // Grow with the text, up to a limit (then the field scrolls).
  $effect(() => {
    void content;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  });

  function addFiles(incoming: readonly File[]) {
    if (incoming.length === 0) return;
    const result = addPendingFiles(files, incoming);
    files = result.files;
    problems = result.problems;
    error = null;
  }

  function removeFile(file: File) {
    files = files.filter((candidate) => candidate !== file);
    problems = [];
  }

  function handlePicked(event: Event & { currentTarget: HTMLInputElement }) {
    addFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = ''; // The same file can be picked again after removing it.
  }

  /** A screenshot or files copied from Explorer: attached, unless the clipboard also carries text. */
  function handlePaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (pasted.length === 0 || event.clipboardData?.getData('text/plain')) return;
    event.preventDefault();
    addFiles(pasted);
  }

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  // Files can be dropped anywhere in the window. The page must always cancel the drop, otherwise
  // the WebView would navigate to the file.
  function handleDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    dragging = true;
  }

  function handleDragOver(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  function handleDrop(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dragging = false;
    if (!sending) addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async function submit() {
    if (!canSend) return;
    sending = true;
    error = null;
    problems = [];
    const failure = await chat.send(channelId, content, files);
    sending = false;
    if (failure) {
      error = failure; // The text and the files stay so nothing is lost.
    } else {
      content = '';
      files = [];
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

<svelte:window
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
/>

{#if dragging}
  <div class="drop-hint" aria-hidden="true">Déposez vos fichiers pour les joindre au message</div>
{/if}

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
  {#if problems.length > 0}
    <ul class="problems" role="alert">
      {#each problems as problem (problem)}
        <li>{problem}</li>
      {/each}
    </ul>
  {/if}
  {#if files.length > 0}
    <ul class="files" aria-label="Fichiers à envoyer">
      {#each files as file (file)}
        <PendingFile {file} disabled={sending} onremove={() => removeFile(file)} />
      {/each}
    </ul>
  {/if}
  <div class="row">
    <button
      type="button"
      class="attach"
      onclick={() => picker?.click()}
      disabled={sending}
      title="Joindre des fichiers"
      aria-label="Joindre des fichiers"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <textarea
      bind:this={field}
      bind:value={content}
      oninput={() => content.trim() !== '' && chat.notifyTyping(channelId)}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      rows="1"
      placeholder={files.length > 0
        ? 'Ajouter un message (facultatif)'
        : `Écrire dans #${channelName} (Markdown accepté, Maj+Entrée pour un retour à la ligne)`}
      aria-label={`Message dans #${channelName}`}></textarea>
    <button type="submit" class="send" disabled={!canSend}>
      {sending ? 'Envoi…' : 'Envoyer'}
    </button>
  </div>
  <input
    bind:this={picker}
    type="file"
    multiple
    hidden
    accept={PICKER_ACCEPT}
    onchange={handlePicked}
  />
  {#if sending && files.length > 0}
    <p class="hint" role="status">
      Envoi de {files.length === 1 ? 'un fichier' : `${files.length} fichiers`}…
    </p>
  {/if}
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
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  .send {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .send:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .attach {
    display: grid;
    place-items: center;
    height: 42px;
    padding: 0 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .attach:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 10px;
    padding: 0;
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

  .problems {
    margin: 0 0 8px;
    padding: 8px 10px 8px 26px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  .hint {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 13px;
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

  .drop-hint {
    position: fixed;
    inset: 8px;
    z-index: 50;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 2px dashed var(--accent);
    border-radius: 12px;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    pointer-events: none;
  }
</style>
