<script lang="ts">
  import { session } from '../lib/session.svelte';
  import PasswordForm from './PasswordForm.svelte';

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

<!-- Shown instead of the chat while the account still has a temporary password. -->
<main class="screen">
  <div class="card">
    <div class="brand">
      <span class="logo" aria-hidden="true">P</span>
      <div>
        <h1>Choisissez votre mot de passe</h1>
        <p class="subtitle">Bienvenue {session.user?.username}</p>
      </div>
    </div>

    <p class="intro">
      Le mot de passe que vous avez reçu est provisoire. Choisissez-en un nouveau, que vous seul
      connaîtrez, pour accéder à Percival.
    </p>

    <PasswordForm forced />

    <button type="button" class="signout" onclick={signOut} disabled={signingOut}>
      {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  </div>
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
    max-width: 420px;
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
  }

  .logo {
    display: grid;
    flex-shrink: 0;
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
    font-size: 20px;
    line-height: 1.2;
  }

  .subtitle {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .intro {
    margin: 0;
    font-size: 14px;
  }

  .signout {
    align-self: flex-start;
    padding: 7px 16px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .signout:hover:not(:disabled) {
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  .signout:disabled {
    opacity: 0.6;
    cursor: progress;
  }
</style>
