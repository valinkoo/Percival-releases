<script lang="ts">
  import {
    assignableRoles,
    outranks,
    type HumanRoleName,
    type ManagedUserDto,
  } from '@percival/shared';
  import { onMount } from 'svelte';
  import { admin } from '../lib/admin';
  import { formatFullDate } from '../lib/format';
  import { checkTemporaryPassword, checkUsername, generatePassword } from '../lib/password';
  import { ROLE_LABELS, can } from '../lib/roles';
  import { session } from '../lib/session.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let users = $state<ManagedUserDto[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  const viewerRoles = $derived(session.user?.roles ?? []);
  /** Roles the viewer may give: strictly below their own. */
  const givable = $derived(assignableRoles(viewerRoles));
  const canCreate = $derived(can(viewerRoles, 'user.create') && givable.length > 0);
  const canChangeRole = $derived(can(viewerRoles, 'user.role'));
  const canManage = $derived(can(viewerRoles, 'user.manage'));

  /** A temporary password just handed to someone: shown until dismissed, so it can be passed on. */
  let handover = $state<{ username: string; password: string } | null>(null);
  let copied = $state(false);

  // New account form.
  let creating = $state(false);
  let newName = $state('');
  let newRole = $state<HumanRoleName>('member');
  let newPassword = $state('');
  let createBusy = $state(false);
  let createError = $state<string | null>(null);

  // Per-account state, by user id.
  let busyIds = $state<Record<string, boolean>>({});
  let rowErrors = $state<Record<string, string>>({});
  let confirmingDisable = $state<string | null>(null);
  let resettingId = $state<string | null>(null);
  let resetValue = $state('');

  onMount(() => {
    dialog?.showModal();
    void load();
  });

  async function load() {
    loading = true;
    loadError = null;
    const result = await admin.listUsers();
    loading = false;
    if (result.ok) {
      users = result.value;
    } else {
      loadError = result.message;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === dialog) dialog?.close();
  }

  function openCreateForm() {
    creating = true;
    createError = null;
    newName = '';
    newRole = givable.includes('member') ? 'member' : (givable[0] ?? 'guest');
    newPassword = generatePassword();
  }

  function closeCreateForm() {
    creating = false;
    newPassword = '';
    createError = null;
  }

  function show(user: ManagedUserDto) {
    const known = users.some((candidate) => candidate.id === user.id);
    users = known
      ? users.map((candidate) => (candidate.id === user.id ? user : candidate))
      : [...users, user];
  }

  async function createAccount(event: SubmitEvent) {
    event.preventDefault();
    if (createBusy) return;
    const problem = checkUsername(newName) ?? checkTemporaryPassword(newPassword);
    if (problem) {
      createError = problem;
      return;
    }
    createBusy = true;
    createError = null;
    const password = newPassword;
    const result = await admin.createUser({
      username: newName.trim().toLowerCase(),
      password,
      role: newRole,
    });
    createBusy = false;
    if (!result.ok) {
      createError = result.message;
      return;
    }
    show(result.value);
    handoverTo(result.value.username, password);
    closeCreateForm();
  }

  function handoverTo(username: string, password: string) {
    handover = { username, password };
    copied = false;
  }

  async function copyPassword() {
    if (!handover) return;
    try {
      await navigator.clipboard.writeText(handover.password);
      copied = true;
    } catch {
      copied = false; // The password stays on screen to be copied by hand.
    }
  }

  /** Runs a change on one account, keeping its error message next to it. */
  async function act(
    user: ManagedUserDto,
    change: () => Promise<{ ok: true; value: ManagedUserDto } | { ok: false; message: string }>,
  ): Promise<boolean> {
    busyIds[user.id] = true;
    delete rowErrors[user.id];
    const result = await change();
    busyIds[user.id] = false;
    if (result.ok) {
      show(result.value);
      return true;
    }
    rowErrors[user.id] = result.message;
    // The list may be out of date (the account changed or vanished): show what is true now.
    void load();
    return false;
  }

  function changeRole(user: ManagedUserDto, role: HumanRoleName) {
    if (role === user.role) return;
    void act(user, () => admin.updateUser(user.id, { role }));
  }

  async function setActive(user: ManagedUserDto, active: boolean) {
    confirmingDisable = null;
    await act(user, () => admin.updateUser(user.id, { active }));
  }

  function startReset(user: ManagedUserDto) {
    resettingId = user.id;
    resetValue = generatePassword();
    delete rowErrors[user.id];
  }

  async function submitReset(event: SubmitEvent, user: ManagedUserDto) {
    event.preventDefault();
    const problem = checkTemporaryPassword(resetValue);
    if (problem) {
      rowErrors[user.id] = problem;
      return;
    }
    const password = resetValue;
    if (await act(user, () => admin.resetPassword(user.id, password))) {
      resettingId = null;
      handoverTo(user.username, password);
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="users-title" {onclose} onclick={handleBackdropClick}>
  <h2 id="users-title">Comptes</h2>

  <div class="body">
    {#if handover}
      <div class="handover" role="status">
        <p>
          Mot de passe provisoire de <strong>{handover.username}</strong> :
          <code>{handover.password}</code>
        </p>
        <p class="hint">
          Communiquez-le à la personne : elle devra en choisir un autre à sa première connexion. Il
          ne sera plus affiché une fois ce message fermé.
        </p>
        <div class="row-actions">
          <button type="button" onclick={copyPassword}>{copied ? 'Copié' : 'Copier'}</button>
          <button type="button" onclick={() => (handover = null)}>J'ai noté le mot de passe</button>
        </div>
      </div>
    {/if}

    {#if canCreate}
      {#if creating}
        <form class="create" onsubmit={createAccount}>
          <h3>Nouveau compte</h3>
          {#if createError}<p class="error" role="alert">{createError}</p>{/if}
          <div class="fields">
            <label>
              <span>Nom d'utilisateur</span>
              <input
                type="text"
                bind:value={newName}
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                required
              />
            </label>
            <label>
              <span>Rôle</span>
              <select bind:value={newRole}>
                {#each givable as role (role)}
                  <option value={role}>{ROLE_LABELS[role]}</option>
                {/each}
              </select>
            </label>
          </div>
          <label>
            <span>Mot de passe provisoire</span>
            <div class="password-row">
              <input type="text" bind:value={newPassword} autocomplete="off" spellcheck="false" />
              <button type="button" onclick={() => (newPassword = generatePassword())}>
                Générer
              </button>
            </div>
          </label>
          <div class="row-actions">
            <button type="submit" class="primary" disabled={createBusy}>
              {createBusy ? 'Création…' : 'Créer le compte'}
            </button>
            <button type="button" onclick={closeCreateForm} disabled={createBusy}>Annuler</button>
          </div>
        </form>
      {:else}
        <button type="button" class="primary new" onclick={openCreateForm}>Nouveau compte</button>
      {/if}
    {/if}

    {#if loading && users.length === 0}
      <p class="hint">Chargement…</p>
    {:else if loadError}
      <div class="error" role="alert">
        <p>{loadError}</p>
        <button type="button" onclick={() => void load()}>Réessayer</button>
      </div>
    {:else if users.length === 0}
      <p class="hint">Aucun compte à afficher.</p>
    {:else}
      <ul class="users">
        {#each users as user (user.id)}
          {@const actionable = outranks(viewerRoles, [user.role])}
          {@const busy = busyIds[user.id] ?? false}
          <li class:disabled={!user.active}>
            <div class="identity">
              <span class="name">{user.username}</span>
              <span class="tags">
                <span class="tag">{ROLE_LABELS[user.role]}</span>
                {#if !user.active}<span class="tag off">Désactivé</span>{/if}
                {#if user.mustChangePassword}
                  <span class="tag temp" title="N'a pas encore choisi son mot de passe">
                    Mot de passe provisoire
                  </span>
                {/if}
              </span>
              <span class="created">Créé le {formatFullDate(user.createdAt)}</span>
            </div>

            {#if actionable}
              <div class="controls">
                {#if canChangeRole}
                  <select
                    aria-label={`Rôle de ${user.username}`}
                    value={user.role}
                    disabled={busy}
                    onchange={(event) =>
                      changeRole(user, event.currentTarget.value as HumanRoleName)}
                  >
                    {#each givable as role (role)}
                      <option value={role}>{ROLE_LABELS[role]}</option>
                    {/each}
                  </select>
                {/if}
                {#if canManage}
                  {#if user.active}
                    {#if confirmingDisable === user.id}
                      <span class="confirm">Désactiver ce compte ?</span>
                      <button
                        type="button"
                        class="danger-solid"
                        disabled={busy}
                        onclick={() => void setActive(user, false)}
                      >
                        Désactiver
                      </button>
                      <button type="button" onclick={() => (confirmingDisable = null)}>
                        Annuler
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="danger"
                        disabled={busy}
                        aria-label={`Désactiver ${user.username}`}
                        onclick={() => (confirmingDisable = user.id)}
                      >
                        Désactiver
                      </button>
                    {/if}
                  {:else}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Réactiver ${user.username}`}
                      onclick={() => void setActive(user, true)}
                    >
                      Réactiver
                    </button>
                  {/if}
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Réinitialiser le mot de passe de ${user.username}`}
                    onclick={() => startReset(user)}
                  >
                    Réinitialiser le mot de passe
                  </button>
                {/if}
              </div>
            {:else}
              <span class="locked" title="Un compte de rang égal ou supérieur au vôtre">—</span>
            {/if}

            {#if resettingId === user.id}
              <form class="reset" onsubmit={(event) => void submitReset(event, user)}>
                <label>
                  <span>Nouveau mot de passe provisoire pour {user.username}</span>
                  <div class="password-row">
                    <input
                      type="text"
                      bind:value={resetValue}
                      autocomplete="off"
                      spellcheck="false"
                    />
                    <button type="button" onclick={() => (resetValue = generatePassword())}>
                      Générer
                    </button>
                  </div>
                </label>
                <p class="hint">
                  Ses sessions en cours seront fermées ; il devra choisir un autre mot de passe à la
                  prochaine connexion.
                </p>
                <div class="row-actions">
                  <button type="submit" class="primary" disabled={busy}>Réinitialiser</button>
                  <button type="button" onclick={() => (resettingId = null)} disabled={busy}>
                    Annuler
                  </button>
                </div>
              </form>
            {/if}

            {#if rowErrors[user.id]}
              <p class="error" role="alert">{rowErrors[user.id]}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer>
    <button type="button" class="primary" onclick={() => dialog?.close()}>Fermer</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 32px));
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
    margin: 0;
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 20px;
  }

  h3 {
    margin: 0;
    font-size: 15px;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 24px;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 13px;
  }

  .users {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  li.disabled .name {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .identity {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 12px;
  }

  .name {
    font-weight: 600;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    padding: 1px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .tag.off {
    background: var(--danger-bg);
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  .tag.temp {
    background: var(--info-bg);
    border-color: var(--info-border);
    color: var(--info-text);
  }

  .created {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 12px;
  }

  .controls,
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .locked {
    color: var(--text-muted);
  }

  .confirm {
    font-size: 14px;
  }

  .handover {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    color: var(--info-text);
  }

  .handover code {
    padding: 2px 6px;
    background: var(--surface);
    border-radius: 4px;
    color: var(--text);
    font-size: 15px;
    user-select: all;
  }

  .create,
  .reset {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 180px;
    gap: 12px;
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
    padding: 6px 8px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-weight: 400;
  }

  .password-row {
    display: flex;
    gap: 8px;
  }

  .password-row input {
    flex: 1;
    font-family: ui-monospace, Consolas, monospace;
  }

  button {
    padding: 6px 14px;
    background: var(--surface);
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

  button.new {
    align-self: flex-start;
  }

  button.danger:hover:not(:disabled) {
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  button.danger-solid {
    background: var(--danger-text);
    border-color: var(--danger-text);
    color: var(--surface);
    font-weight: 600;
  }

  .error {
    padding: 8px 10px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    color: var(--danger-text);
    font-size: 14px;
  }

  .error button {
    margin-top: 6px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: 14px 24px;
    border-top: 1px solid var(--border);
  }
</style>
