<script lang="ts">
  import {
    CHANNEL_DESCRIPTION_MAX_LENGTH,
    CHANNEL_NAME_MAX_LENGTH,
    type ChannelDto,
    type ChannelMemberDto,
  } from '@percival/shared';
  import { onMount } from 'svelte';
  import { admin } from '../lib/admin';
  import { chat } from '../lib/chat.svelte';
  import { ROLE_LABELS, can } from '../lib/roles';
  import { session } from '../lib/session.svelte';

  let { channel, onclose }: { channel: ChannelDto; onclose: () => void } = $props();

  let dialog = $state<HTMLDialogElement>();

  const canRename = $derived(can(session.user?.roles, 'channel.rename'));
  const canManageMembers = $derived(can(session.user?.roles, 'channel.members'));

  // Name and description.
  let name = $state('');
  let description = $state('');
  let renaming = $state(false);
  let renameError = $state<string | null>(null);
  let renamed = $state(false);

  // Members.
  let members = $state<ChannelMemberDto[]>([]);
  let candidates = $state<ChannelMemberDto[]>([]);
  let selected = $state('');
  let loadingMembers = $state(false);
  let membersError = $state<string | null>(null);
  let membersBusy = $state(false);

  onMount(() => {
    dialog?.showModal();
    name = channel.name;
    description = channel.description;
    if (canManageMembers) void loadMembers();
  });

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === dialog) dialog?.close();
  }

  async function saveNames(event: SubmitEvent) {
    event.preventDefault();
    if (renaming) return;
    renaming = true;
    renameError = null;
    renamed = false;
    const failure = await chat.updateChannel(channel.id, { name, description });
    renaming = false;
    if (failure) {
      renameError = failure;
      return;
    }
    // The server normalizes the name: show what it kept.
    name = chat.channels.find((candidate) => candidate.id === channel.id)?.name ?? name;
    renamed = true;
  }

  function show(response: { members: ChannelMemberDto[]; candidates: ChannelMemberDto[] }) {
    members = response.members;
    candidates = response.candidates;
    selected = '';
  }

  async function loadMembers() {
    loadingMembers = true;
    membersError = null;
    const result = await admin.listMembers(channel.id);
    loadingMembers = false;
    if (result.ok) {
      show(result.value);
    } else {
      membersError = result.message;
    }
  }

  async function change(call: () => ReturnType<typeof admin.addMember>) {
    if (membersBusy) return;
    membersBusy = true;
    membersError = null;
    const result = await call();
    membersBusy = false;
    if (result.ok) {
      show(result.value);
    } else {
      membersError = result.message;
      void loadMembers();
    }
  }

  function addSelected(event: SubmitEvent) {
    event.preventDefault();
    if (selected === '') return;
    const userId = selected;
    void change(() => admin.addMember(channel.id, userId));
  }
</script>

<dialog bind:this={dialog} aria-labelledby="channel-title" {onclose} onclick={handleBackdropClick}>
  <h2 id="channel-title">
    <span aria-hidden="true">#</span>{channel.name}
    {#if channel.isPrivate}<span class="private">salon privé</span>{/if}
  </h2>

  {#if canRename}
    <section aria-labelledby="channel-names">
      <h3 id="channel-names">Nom et description</h3>
      <form onsubmit={saveNames}>
        {#if renameError}<p class="error" role="alert">{renameError}</p>{/if}
        <label>
          <span>Nom</span>
          <input
            type="text"
            bind:value={name}
            maxlength={CHANNEL_NAME_MAX_LENGTH}
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
        <p class="hint">Le nom est mis en forme par le serveur (minuscules, tirets).</p>
        <div class="actions">
          <button type="submit" class="primary" disabled={renaming}>
            {renaming ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {#if renamed}<span role="status" class="done">Enregistré</span>{/if}
        </div>
      </form>
    </section>
  {/if}

  {#if canManageMembers}
    <section aria-labelledby="channel-members">
      <h3 id="channel-members">Membres</h3>
      <p class="hint">
        {#if channel.isPrivate}
          Ce salon est privé : seuls ses membres et les administrateurs le voient.
        {:else}
          Ce salon est public : les membres et les administrateurs le voient déjà. Ajoutez ici les
          invités qui doivent y avoir accès.
        {/if}
      </p>

      {#if membersError}
        <p class="error" role="alert">{membersError}</p>
      {/if}

      {#if loadingMembers && members.length === 0}
        <p class="hint">Chargement…</p>
      {:else if members.length === 0}
        <p class="hint">Aucun membre listé pour l'instant.</p>
      {:else}
        <ul>
          {#each members as member (member.id)}
            <li>
              <span class="member-name">{member.username}</span>
              <span class="tag">{ROLE_LABELS[member.role]}</span>
              <button
                type="button"
                class="danger"
                disabled={membersBusy}
                aria-label={`Retirer ${member.username}`}
                onclick={() => void change(() => admin.removeMember(channel.id, member.id))}
              >
                Retirer
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if candidates.length > 0}
        <form class="add" onsubmit={addSelected}>
          <label>
            <span>Ajouter</span>
            <select bind:value={selected}>
              <option value="">Choisir une personne…</option>
              {#each candidates as candidate (candidate.id)}
                <option value={candidate.id}>
                  {candidate.username} ({ROLE_LABELS[candidate.role]})
                </option>
              {/each}
            </select>
          </label>
          <button type="submit" disabled={membersBusy || selected === ''}>Ajouter</button>
        </form>
      {:else if !loadingMembers && !membersError}
        <p class="hint">
          {channel.isPrivate
            ? 'Toutes les personnes concernées sont déjà membres.'
            : 'Aucun invité à ajouter.'}
        </p>
      {/if}
    </section>
  {/if}

  <footer>
    <button type="button" class="primary" onclick={() => dialog?.close()}>Fermer</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    padding: 0;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 55%);
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin: 0;
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 20px;
  }

  .private {
    margin-left: 10px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 400;
  }

  section {
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
  }

  h3 {
    margin: 0 0 10px;
    color: var(--text-muted);
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  p {
    margin: 0 0 8px;
  }

  .hint {
    color: var(--text-muted);
    font-size: 13px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }

  input,
  select {
    padding: 7px 9px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-weight: 400;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .member-name {
    flex: 1;
    font-weight: 600;
  }

  .tag {
    padding: 1px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 12px;
  }

  form.add {
    flex-direction: row;
    align-items: flex-end;
  }

  form.add label {
    flex: 1;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .done {
    color: var(--info-text);
    font-size: 14px;
  }

  button {
    padding: 7px 16px;
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

  button.danger {
    padding: 4px 12px;
  }

  button.danger:hover:not(:disabled) {
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  .error {
    padding: 8px 10px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: 14px 24px;
  }
</style>
