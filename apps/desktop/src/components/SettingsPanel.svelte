<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { onMount } from 'svelte';
  import { chat } from '../lib/chat.svelte';
  import { CONNECTION_LABELS } from '../lib/connection';
  import { openExternal } from '../lib/external';
  import { formatFullDate } from '../lib/format';
  import { ROLE_LABELS } from '../lib/roles';
  import { session } from '../lib/session.svelte';
  import { inTauri } from '../lib/tauri';
  import { THEME_OPTIONS, theme } from '../lib/theme.svelte';
  import { updater } from '../lib/updater.svelte';

  /** The author's page, behind the "by valinko" link of the About section. */
  const AUTHOR_URL = 'https://valinko.carrd.co/';

  let { onclose }: { onclose: () => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let appVersion = $state('');
  let signingOut = $state(false);

  const user = $derived(session.user);
  const searching = $derived(updater.checkState === 'checking');
  const installing = $derived(updater.phase === 'installing');

  onMount(() => {
    dialog?.showModal();
    // The running build (only known inside the Tauri shell).
    if (inTauri) void getVersion().then((version) => (appVersion = version));
  });

  async function signOut() {
    signingOut = true;
    try {
      await session.signOut();
    } finally {
      signingOut = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    // A click on the backdrop lands on the dialog element itself, not on its content.
    if (event.target === dialog) dialog?.close();
  }

  function openAuthorPage(event: MouseEvent) {
    event.preventDefault();
    void openExternal(AUTHOR_URL);
  }
</script>

<!-- Esc and the buttons all end up in `close`, which tells the parent to unmount the panel. -->
<dialog bind:this={dialog} aria-labelledby="settings-title" {onclose} onclick={handleBackdropClick}>
  <h2 id="settings-title">Paramètres</h2>

  <section aria-labelledby="settings-account">
    <h3 id="settings-account">Compte</h3>
    <dl>
      <div>
        <dt>Nom d'utilisateur</dt>
        <dd>{user?.username}</dd>
      </div>
      <div>
        <dt>Rôle</dt>
        <dd>{user?.roles.map((role) => ROLE_LABELS[role]).join(', ')}</dd>
      </div>
      <div>
        <dt>État</dt>
        <dd class="status {chat.connection}">
          <span class="dot" aria-hidden="true"></span>{CONNECTION_LABELS[chat.connection]}
        </dd>
      </div>
      {#if user}
        <div>
          <dt>Compte créé le</dt>
          <dd>{formatFullDate(user.createdAt)}</dd>
        </div>
      {/if}
      <div>
        <dt>Serveur</dt>
        <dd class="server">{session.serverUrl}</dd>
      </div>
    </dl>
    <button type="button" class="signout" onclick={signOut} disabled={signingOut}>
      {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  </section>

  <section aria-labelledby="settings-appearance">
    <h3 id="settings-appearance">Apparence</h3>
    <fieldset>
      <legend>Thème</legend>
      <div class="themes">
        {#each THEME_OPTIONS as option (option.value)}
          <label class="theme">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme.choice === option.value}
              onchange={() => theme.set(option.value)}
            />
            <span>
              <span class="theme-name">{option.label}</span>
              <span class="theme-hint">{option.hint}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>
  </section>

  <section aria-labelledby="settings-updates">
    <h3 id="settings-updates">Mises à jour</h3>
    <p class="version">
      Version installée : <strong>{appVersion ? `v${appVersion}` : 'inconnue'}</strong>
    </p>

    {#if updater.supported}
      <label class="auto">
        <input
          type="checkbox"
          checked={updater.autoCheck}
          onchange={(event) => updater.setAutoCheck(event.currentTarget.checked)}
        />
        <span>
          Chercher les mises à jour automatiquement
          <span class="hint">
            au démarrage, puis toutes les 4 heures ; vous pouvez toujours chercher à la main
          </span>
        </span>
      </label>

      <div class="update-row">
        {#if updater.phase === 'available' || updater.phase === 'failed' || installing}
          {#if installing}
            <p role="status">
              Téléchargement de la mise à jour{updater.progress === null
                ? '…'
                : ` : ${updater.progress} %`}
              Percival redémarrera tout seul.
            </p>
          {:else if updater.phase === 'failed'}
            <p role="status">La mise à jour a échoué. Le réseau est peut-être coupé.</p>
            <button type="button" class="primary" onclick={() => void updater.install()}>
              Réessayer
            </button>
          {:else}
            <p role="status">La version {updater.version} est disponible.</p>
            <button type="button" class="primary" onclick={() => void updater.install()}>
              Installer et redémarrer
            </button>
          {/if}
        {:else}
          <button type="button" onclick={() => void updater.checkNow()} disabled={searching}>
            {searching ? 'Recherche…' : 'Rechercher maintenant'}
          </button>
          {#if updater.checkState === 'upToDate'}
            <p role="status">Vous utilisez la dernière version.</p>
          {:else if updater.checkState === 'error'}
            <p role="status" class="problem">
              Impossible de chercher les mises à jour. Le réseau est peut-être coupé.
            </p>
          {/if}
        {/if}
      </div>
    {:else}
      <p class="hint">Les mises à jour ne fonctionnent que dans l'application installée.</p>
    {/if}
  </section>

  <section aria-labelledby="settings-about">
    <h3 id="settings-about">À propos</h3>
    <div class="about-title">
      <span class="logo" aria-hidden="true">P</span>
      <span class="name">Percival</span>
    </div>
    <p>
      Messagerie privée, auto-hébergée et organisée en salons. Vos données restent sur votre
      serveur.
    </p>
    <a href={AUTHOR_URL} onclick={openAuthorPage}>Percival by valinko</a>
  </section>

  <footer>
    <button type="button" class="primary" onclick={() => dialog?.close()}>Fermer</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(540px, calc(100vw - 32px));
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

  dl {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 12px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    text-align: right;
  }

  .server {
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d9a441;
  }

  .status.connected .dot {
    background: #3fb97a;
  }

  .status.offline .dot {
    background: #e0586b;
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

  .signout:hover:not(:disabled) {
    border-color: var(--danger-border);
    color: var(--danger-text);
  }

  fieldset {
    margin: 0;
    padding: 10px 14px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  legend {
    padding: 0 6px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .theme,
  .auto {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .theme input,
  .auto input {
    flex-shrink: 0;
    margin: 4px 0 0;
    accent-color: var(--accent);
  }

  .theme-name {
    display: block;
  }

  .theme-hint,
  .hint {
    display: block;
    color: var(--text-muted);
    font-size: 13px;
  }

  .version {
    margin-bottom: 12px;
  }

  .update-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }

  .update-row p {
    margin: 0;
  }

  .problem {
    color: var(--danger-text);
  }

  .about-title {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 20px;
    font-weight: 700;
  }

  .name {
    font-size: 24px;
    font-weight: 700;
  }

  a {
    color: var(--accent-hover);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: 14px 24px;
  }
</style>
