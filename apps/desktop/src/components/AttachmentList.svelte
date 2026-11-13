<script lang="ts">
  import { isPreviewableImage, type AttachmentDto } from '@percival/shared';
  import AttachmentFile from './AttachmentFile.svelte';
  import AttachmentImage from './AttachmentImage.svelte';
  import ImageViewer from './ImageViewer.svelte';

  let { attachments }: { attachments: AttachmentDto[] } = $props();

  const images = $derived(
    attachments.filter((attachment) => isPreviewableImage(attachment.fileType)),
  );
  const files = $derived(
    attachments.filter((attachment) => !isPreviewableImage(attachment.fileType)),
  );

  /** The picture shown full screen, with the object URL its thumbnail already loaded. */
  let viewer = $state<{ attachment: AttachmentDto; src: string } | null>(null);
</script>

{#if attachments.length > 0}
  <div class="attachments">
    {#if images.length > 0}
      <div class="images">
        {#each images as attachment (attachment.id)}
          <AttachmentImage {attachment} onopen={(src) => (viewer = { attachment, src })} />
        {/each}
      </div>
    {/if}
    {#each files as attachment (attachment.id)}
      <AttachmentFile {attachment} />
    {/each}
  </div>
{/if}

{#if viewer}
  <ImageViewer attachment={viewer.attachment} src={viewer.src} onclose={() => (viewer = null)} />
{/if}

<style>
  .attachments {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin-top: 4px;
  }

  .images {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
