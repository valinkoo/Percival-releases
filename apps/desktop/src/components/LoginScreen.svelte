<script lang="ts">
  import { session } from '../lib/session.svelte';

  let serverUrl = $state(session.serverUrl || 'http://localhost:3000');
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Keep the field in sync when the stored address is loaded after this screen is mounted.
  $effect(() => {
    if (session.serverUrl) serverUrl = session.serverUrl;
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = null;
    busy = true;
    try {
      error = await session.signIn(serverUrl, username, password);
      if (error) password = '';
    } finally {
      busy = false;
    }
  }
</script>

<main class="screen">
  <form class="card" onsubmit={submit} aria-labelledby="title">
    <div class="brand">
      <span class="logo" aria-hidden="true">P</span>
      <div>
        <h1 id="title">Percival</h1>
        <p class="subtitle">Connexion à votre serveur</p>
      </div>
    </div>

    {#if session.notice}
      <p class="banner info" role="status">{session.notice}</p>
    {/if}
    {#if error}
      <p class="banner danger" role="alert">{error}</p>
    {/if}

    <label>
      <span>Adresse du serveur</span>
      <input
        type="text"
        bind:value={serverUrl}
        placeholder="https://mon-serveur.tailnet.ts.net"
        autocomplete="url"
        spellcheck="false"
        required
      />
    </label>

    <label>
      <span>Nom d'utilisateur</span>
      <input
        type="text"
        bind:value={username}
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
    </label>

    <label>
      <span>Mot de passe</span>
      <input type="password" bind:value={password} autocomplete="current-password" required />
    </label>

    <button type="submit" disabled={busy}>
      {busy ? 'Connexion…' : 'Se connecter'}
    </button>
  </form>
</main>

<style>
  .screen {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 24px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 400px;
    padding: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 26px;
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    line-height: 1.2;
  }

  .subtitle {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }

  input {
    padding: 10px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-weight: 400;
  }

  input:focus-visible {
    border-color: var(--focus);
    outline-offset: 0;
  }

  button {
    margin-top: 4px;
    padding: 11px 16px;
    background: var(--accent);
    border: 0;
    border-radius: 8px;
    color: var(--accent-text);
    font-weight: 600;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .banner {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid;
    border-radius: 8px;
    font-size: 14px;
  }

  .banner.danger {
    background: var(--danger-bg);
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  .banner.info {
    background: var(--info-bg);
    border-color: var(--info-border);
    color: var(--info-text);
  }
</style>
