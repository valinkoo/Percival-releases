<script lang="ts">
  import { updater } from '../lib/updater.svelte';
</script>

{#if updater.phase !== 'idle'}
  <div class="update" role="status">
    {#if updater.phase === 'available'}
      <p>La version {updater.version} de Percival est disponible.</p>
      <button type="button" onclick={() => void updater.install()}>
        Installer et redémarrer
      </button>
    {:else if updater.phase === 'installing'}
      <p>
        Téléchargement de la mise à jour{updater.progress === null
          ? '…'
          : ` : ${updater.progress} %`}
        Percival redémarrera tout seul.
      </p>
    {:else}
      <p>La mise à jour a échoué. Le réseau est peut-être coupé.</p>
      <button type="button" onclick={() => void updater.install()}>Réessayer</button>
    {/if}
  </div>
{/if}

<style>
  .update {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 20px;
    background: var(--info-bg);
    border-bottom: 1px solid var(--info-border);
    color: var(--info-text);
    font-size: 14px;
  }

  p {
    margin: 0;
  }

  button {
    padding: 4px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
  }
</style>
