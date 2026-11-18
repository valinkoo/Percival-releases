<script lang="ts">
  import { CHANNEL_DESCRIPTION_MAX_LENGTH, CHANNEL_NAME_MAX_LENGTH } from '@percival/shared';
  import { chat } from '../lib/chat.svelte';
  import { can } from '../lib/roles';
  import { session } from '../lib/session.svelte';

  const canCreate = $derived(can(session.user?.roles, 'channel.create'));

  let creating = $state(false);
  let name = $state('');
  let description = $state('');
  let isPrivate = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  function openForm() {
    creating = true;
    error = null;
  }

  function closeForm() {
    creating = false;
    name = '';
    description = '';
    isPrivate = false;
    error = null;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    const failure = await chat.createChannel(name, description, isPrivate);
    busy = false;
    if (failure) {
      error = failure;
    } else {
      closeForm();
    }
  }
</script>

<nav class="sidebar" aria-label="Salons">
  <div class="heading">
    <h2>Salons</h2>
    {#if canCreate && !creating}
      <button type="button" class="add" onclick={openForm} title="Créer un salon">+</button>
    {/if}
  </div>

  {#if creating}
    <form class="create" onsubmit={submit}>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <label>
        <span>Nom</span>
        <input
          type="text"
          bind:value={name}
          maxlength={CHANNEL_NAME_MAX_LENGTH}
          placeholder="projet-client"
          autocomplete="off"
          spellcheck="false"
          required
        />
      </label>
      <label>
        <span>Description (facultative)</span>
        <input
          type="text"
          bind:value={description}
          maxlength={CHANNEL_DESCRIPTION_MAX_LENGTH}
          autocomplete="off"
        />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={isPrivate} />
        <span>
          Salon privé
          <span class="check-hint">visible seulement par ses membres ; vous en êtes le premier</span
          >
        </span>
      </label>
      <div class="actions">
        <button type="submit" class="primary" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button
        >
        <button type="button" onclick={closeForm} disabled={busy}>Annuler</button>
      </div>
    </form>
  {/if}

  {#if chat.loading}
    <p class="hint">Chargement…</p>
  {:else if chat.error}
    <div class="hint">
      <p role="alert">{chat.error}</p>
      <button type="button" onclick={() => chat.retry()}>Réessayer</button>
    </div>
  {:else if chat.channels.length === 0}
    <p class="hint">Aucun salon pour l'instant.</p>
  {:else}
    <ul>
      {#each chat.channels as channel (channel.id)}
        {@const unread = chat.unread[channel.id] ?? 0}
        <li>
          <button
            type="button"
            class="channel"
            class:active={channel.id === chat.activeChannelId}
            class:has-unread={unread > 0}
            aria-current={channel.id === chat.activeChannelId ? 'true' : undefined}
            title={channel.description || undefined}
            onclick={() => chat.select(channel.id)}
          >
            <span class="name">
              <span class="hash" aria-hidden="true">#</span>{channel.name}
              {#if channel.isPrivate}
                <span class="lock" role="img" aria-label="Salon privé" title="Salon privé">🔒</span>
              {/if}
            </span>
            {#if unread > 0}
              <span
                class="unread"
                aria-label={`${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 240px;
    padding: 14px 10px;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }

  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px;
  }

  h2 {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .channel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: none;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .channel.has-unread {
    color: var(--text);
    font-weight: 600;
  }

  .unread {
    flex-shrink: 0;
    min-width: 20px;
    padding: 0 6px;
    background: var(--accent);
    border-radius: 999px;
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
  }

  .channel:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .channel.active {
    background: var(--surface-raised);
    color: var(--text);
    font-weight: 600;
  }

  .hash {
    margin-right: 4px;
    opacity: 0.6;
  }

  .lock {
    margin-left: 4px;
    font-size: 11px;
  }

  label.check {
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    font-weight: 600;
  }

  label.check input {
    margin: 2px 0 0;
    padding: 0;
    accent-color: var(--accent);
  }

  .check-hint {
    display: block;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
  }

  .add {
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .add:hover {
    border-color: var(--accent);
  }

  .create {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  input {
    padding: 6px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-weight: 400;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    padding: 5px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .actions .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .error {
    margin: 0;
    padding: 6px 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 6px;
    color: var(--danger-text);
    font-size: 13px;
  }

  .hint {
    margin: 8px 6px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .hint button {
    margin-top: 6px;
    padding: 5px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
</style>
