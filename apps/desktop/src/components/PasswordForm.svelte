<script lang="ts">
  import { PASSWORD_MIN_LENGTH } from '@percival/shared';
  import { checkNewPassword } from '../lib/password';
  import { session } from '../lib/session.svelte';

  let {
    forced = false,
    onsuccess,
    oncancel,
  }: {
    /** The current password is a temporary one: the person has to choose a new one to go on. */
    forced?: boolean;
    onsuccess?: () => void;
    oncancel?: () => void;
  } = $props();

  let current = $state('');
  let next = $state('');
  let confirmation = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkNewPassword(next, confirmation, current);
    if (problem) {
      error = problem;
      return;
    }
    busy = true;
    error = null;
    const failure = await session.changePassword(current, next);
    busy = false;
    if (failure) {
      error = failure;
      return;
    }
    current = '';
    next = '';
    confirmation = '';
    onsuccess?.();
  }
</script>

<form onsubmit={submit}>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <label>
    <span>{forced ? 'Mot de passe provisoire' : 'Mot de passe actuel'}</span>
    <input type="password" bind:value={current} autocomplete="current-password" required />
  </label>
  <label>
    <span>Nouveau mot de passe</span>
    <input type="password" bind:value={next} autocomplete="new-password" required />
  </label>
  <label>
    <span>Confirmer le nouveau mot de passe</span>
    <input type="password" bind:value={confirmation} autocomplete="new-password" required />
  </label>
  <p class="hint">Au moins {PASSWORD_MIN_LENGTH} caractères, différent de l'actuel.</p>

  <div class="actions">
    <button type="submit" class="primary" disabled={busy}>
      {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
    </button>
    {#if oncancel}
      <button type="button" onclick={oncancel} disabled={busy}>Annuler</button>
    {/if}
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }

  input {
    padding: 8px 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-weight: 400;
  }

  input:focus-visible {
    border-color: var(--focus);
    outline-offset: 0;
  }

  .hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .error {
    margin: 0;
    padding: 8px 10px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  button {
    padding: 8px 16px;
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

  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  button.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
</style>
