<script lang="ts">
  import type { AttachmentDto } from '@percival/shared';
  import { saveAttachment } from '../lib/attachments';
  import { fileKindLabel, formatFileSize } from '../lib/format';

  let { attachment }: { attachment: AttachmentDto } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function download() {
    busy = true;
    error = null;
    error = await saveAttachment(attachment);
    busy = false;
  }
</script>

<div class="file">
  <svg class="icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path
      d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path d="M14 2v5h5" fill="none" stroke="currentColor" stroke-width="1.6" />
  </svg>
  <div class="meta">
    <span class="name" title={attachment.fileName}>{attachment.fileName}</span>
    <span class="info"
      >{fileKindLabel(attachment.fileType)} · {formatFileSize(attachment.fileSize)}</span
    >
  </div>
  <button type="button" onclick={download} disabled={busy}>
    {busy ? 'Téléchargement…' : 'Télécharger'}
  </button>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .file {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    width: min(420px, 100%);
    padding: 8px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .icon {
    flex: none;
    color: var(--text-muted);
  }

  .meta {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info {
    color: var(--text-muted);
    font-size: 12px;
  }

  button {
    padding: 4px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .error {
    flex-basis: 100%;
    margin: 0;
    color: var(--danger-text);
    font-size: 13px;
  }
</style>
