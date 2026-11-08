<script lang="ts">
  import { onMount } from 'svelte';
  import ChatScreen from './components/ChatScreen.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import { session } from './lib/session.svelte';

  onMount(() => {
    void session.restore();
  });
</script>

{#if session.status === 'starting'}
  <main class="splash" aria-busy="true">
    <p>Chargement…</p>
  </main>
{:else if session.status === 'signedIn'}
  <ChatScreen />
{:else}
  <LoginScreen />
{/if}

<style>
  .splash {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-muted);
  }
</style>
