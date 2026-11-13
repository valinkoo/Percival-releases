<script lang="ts">
  import type { AttachmentDto } from '@percival/shared';
  import { onMount } from 'svelte';
  import { fetchAttachmentBlob } from '../lib/attachments';
  import { errorMessage } from '../lib/messages';

  let { attachment, onopen }: { attachment: AttachmentDto; onopen: (src: string) => void } =
    $props();

  let host = $state<HTMLElement>();
  let src = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let destroyed = false;
  let objectUrl: string | null = null;

  async function load() {
    if (loading || objectUrl) return;
    loading = true;
    error = null;
    try {
      const blob = await fetchAttachmentBlob(attachment);
      if (destroyed) return; // The message left the screen while the image was on its way.
      objectUrl = URL.createObjectURL(blob);
      src = objectUrl;
    } catch (failure) {
      if (!destroyed) error = errorMessage(failure);
    } finally {
      loading = false;
    }
  }

  // The image is fetched when it comes into view, not when its message is rendered: a channel
  // history can hold many large pictures.
  onMount(() => {
    let observer: IntersectionObserver | undefined;
    if (host && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            void load();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(host);
    } else {
      void load();
    }
    return () => {
      destroyed = true;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<div class="image" bind:this={host}>
  {#if src}
    <button
      type="button"
      class="open"
      onclick={() => src && onopen(src)}
      aria-label={`Agrandir l'image ${attachment.fileName}`}
    >
      <img {src} alt={attachment.fileName} />
    </button>
  {:else if error}
    <div class="placeholder failed" role="alert">
      <span>{error}</span>
      <button type="button" onclick={load}>Réessayer</button>
    </div>
  {:else}
    <div class="placeholder" aria-busy={loading}>
      <span>{loading ? 'Chargement…' : attachment.fileName}</span>
    </div>
  {/if}
</div>

<style>
  .image {
    max-width: 100%;
  }

  .open {
    display: block;
    padding: 0;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    cursor: zoom-in;
  }

  img {
    display: block;
    /* Fixed caps: a percentage here would be resolved against the button, which itself takes the
       image's natural width, leaving an empty strip beside the picture. */
    max-width: 360px;
    max-height: 280px;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 240px;
    max-width: 100%;
    height: 140px;
    padding: 8px;
    background: var(--surface-raised);
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    overflow: hidden;
  }

  .placeholder.failed {
    color: var(--danger-text);
  }

  .placeholder button {
    padding: 3px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
</style>
