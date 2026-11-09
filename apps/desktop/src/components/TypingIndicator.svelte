<script lang="ts">
  import { chat } from '../lib/chat.svelte';
  import { typingLabel } from '../lib/typing';

  let { channelId }: { channelId: string } = $props();

  const label = $derived(typingLabel(chat.typingUsers(channelId)));
</script>

<!-- Always takes its line, so the list does not jump when someone starts or stops typing. -->
<p class="typing" aria-live="polite">{label}</p>

<style>
  .typing {
    min-height: 20px;
    margin: 0;
    padding: 2px 20px 0;
    color: var(--text-muted);
    font-size: 13px;
    font-style: italic;
  }
</style>
