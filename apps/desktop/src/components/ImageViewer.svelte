<script lang="ts">
  import type { AttachmentDto } from '@percival/shared';
  import { onMount } from 'svelte';
  import { saveAttachment } from '../lib/attachments';
  import { formatFileSize } from '../lib/format';

  let {
    attachment,
    src,
    onclose,
  }: { attachment: AttachmentDto; src: string; onclose: () => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(() => dialog?.showModal());

  async function download() {
    busy = true;
    error = null;
    error = await saveAttachment(attachment);
    busy = false;
  }

  function handleClick(event: MouseEvent) {
    // A click beside the picture (the dialog itself or its stage) closes the viewer.
    const target = event.target;
    if (
      target === dialog ||
      (target instanceof HTMLElement && target.dataset['stage'] !== undefined)
    ) {
      dialog?.close();
    }
  }
</script>

<!-- Esc and the buttons all end up in `close`, which tells the parent to unmount the viewer. -->
<dialog bind:this={dialog} aria-label={attachment.fileName} {onclose} onclick={handleClick}>
  <div class="bar">
    <span class="name" title={attachment.fileName}>
      {attachment.fileName} · {formatFileSize(attachment.fileSize)}
    </span>
    {#if error}<span class="error" role="alert">{error}</span>{/if}
    <button type="button" onclick={download} disabled={busy}>
      {busy ? 'Téléchargement…' : 'Télécharger'}
    </button>
    <button type="button" onclick={() => dialog?.close()}>Fermer</button>
  </div>
  <div class="stage" data-stage>
    <img {src} alt={attachment.fileName} />
  </div>
</dialog>

<style>
  dialog {
    width: 100vw;
    max-width: 100vw;
    height: 100vh;
    max-height: 100vh;
    padding: 0;
    background: rgb(0 0 0 / 0.88);
    border: 0;
    color: #ffffff;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error {
    color: #ffb4c0;
    font-size: 13px;
  }

  button {
    padding: 5px 14px;
    background: rgb(255 255 255 / 0.12);
    border: 1px solid rgb(255 255 255 / 0.3);
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.22);
  }

  button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .stage {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 0 16px 16px;
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
