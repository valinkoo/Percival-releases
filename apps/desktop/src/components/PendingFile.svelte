<script lang="ts">
  import { isPreviewableImage } from '@percival/shared';
  import { onMount } from 'svelte';
  import { formatFileSize } from '../lib/format';

  let { file, disabled, onremove }: { file: File; disabled: boolean; onremove: () => void } =
    $props();

  let thumbnail = $state<string | null>(null);

  // A small preview for pictures, from the local file (nothing is uploaded yet).
  onMount(() => {
    if (!isPreviewableImage(file.type)) return;
    const url = URL.createObjectURL(file);
    thumbnail = url;
    return () => URL.revokeObjectURL(url);
  });
</script>

<li class="pending">
  {#if thumbnail}
    <img src={thumbnail} alt="" />
  {:else}
    <span class="icon" aria-hidden="true">📄</span>
  {/if}
  <span class="meta">
    <span class="name" title={file.name}>{file.name}</span>
    <span class="size">{formatFileSize(file.size)}</span>
  </span>
  <button
    type="button"
    onclick={onremove}
    {disabled}
    aria-label={`Retirer ${file.name}`}
    title="Retirer"
  >
    ×
  </button>
</li>

<style>
  .pending {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 260px;
    padding: 4px 6px 4px 4px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    list-style: none;
  }

  img,
  .icon {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 6px;
  }

  img {
    object-fit: cover;
  }

  .icon {
    display: grid;
    place-items: center;
    font-size: 20px;
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  .name {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size {
    color: var(--text-muted);
    font-size: 12px;
  }

  button {
    flex: none;
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    color: var(--text-muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--surface);
    color: var(--danger-text);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
