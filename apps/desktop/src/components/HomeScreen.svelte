<script lang="ts">
  import { ROLE_LABELS } from '../lib/roles';
  import { session } from '../lib/session.svelte';

  let signingOut = $state(false);

  async function signOut() {
    signingOut = true;
    try {
      await session.signOut();
    } finally {
      signingOut = false;
    }
  }
</script>

<div class="layout">
  <header>
    <span class="brand"><span class="logo" aria-hidden="true">P</span> Percival</span>
    <div class="user">
      <span>{session.user?.username}</span>
      <button type="button" onclick={signOut} disabled={signingOut}>Déconnexion</button>
    </div>
  </header>

  <main>
    <h1>Bienvenue, {session.user?.username}</h1>
    <p class="muted">Connecté à {session.serverUrl}</p>

    <ul class="roles" aria-label="Rôles">
      {#each session.user?.roles ?? [] as role (role)}
        <li>{ROLE_LABELS[role]}</li>
      {/each}
    </ul>

    {#if session.notice}
      <p class="banner" role="status">{session.notice}</p>
    {/if}

    <p class="placeholder">Les salons et les messages arrivent dans la version 0.0.2.</p>
  </main>
</div>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 15px;
  }

  .user {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--text-muted);
  }

  button {
    padding: 7px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  main {
    flex: 1;
    padding: 40px 32px;
    max-width: 720px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 26px;
  }

  .muted {
    margin: 0 0 20px;
    color: var(--text-muted);
  }

  .roles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0;
    margin: 0 0 28px;
    list-style: none;
  }

  .roles li {
    padding: 3px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 13px;
  }

  .banner {
    padding: 10px 12px;
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    color: var(--info-text);
    font-size: 14px;
  }

  .placeholder {
    color: var(--text-muted);
  }
</style>
