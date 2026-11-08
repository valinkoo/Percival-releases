<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { onDestroy, onMount } from 'svelte';
  import { chat } from '../lib/chat.svelte';
  import { ROLE_LABELS } from '../lib/roles';
  import { session } from '../lib/session.svelte';
  import { inTauri } from '../lib/tauri';
  import ChannelList from './ChannelList.svelte';
  import Composer from './Composer.svelte';
  import MessageList from './MessageList.svelte';
  import UpdateBanner from './UpdateBanner.svelte';

  let signingOut = $state(false);
  let appVersion = $state('');

  onMount(() => {
    void chat.start();
    // The running build, shown in the header (only known inside the Tauri shell).
    if (inTauri) void getVersion().then((version) => (appVersion = version));
  });
  onDestroy(() => chat.stop());

  async function signOut() {
    signingOut = true;
    try {
      await session.signOut();
    } finally {
      signingOut = false;
    }
  }

  const CONNECTION_LABELS = {
    connected: 'Connecté',
    connecting: 'Connexion…',
    offline: 'Reconnexion…',
  } as const;
</script>

<div class="layout">
  <header>
    <span class="brand">
      <span class="logo" aria-hidden="true">P</span> Percival
      {#if appVersion}<span class="version">v{appVersion}</span>{/if}
    </span>
    <div class="right">
      <span class="status {chat.connection}" role="status">
        <span class="dot" aria-hidden="true"></span>{CONNECTION_LABELS[chat.connection]}
      </span>
      <span class="user">
        {session.user?.username}
        <span class="role">
          {session.user?.roles.map((role) => ROLE_LABELS[role]).join(', ')}
        </span>
      </span>
      <button type="button" onclick={signOut} disabled={signingOut}>Déconnexion</button>
    </div>
  </header>

  <UpdateBanner />

  {#if session.notice}
    <p class="banner" role="status">{session.notice}</p>
  {/if}

  <div class="body">
    <ChannelList />

    <main>
      {#if chat.activeChannel}
        <div class="channel-header">
          <h1><span aria-hidden="true">#</span>{chat.activeChannel.name}</h1>
          {#if chat.activeChannel.description}
            <p>{chat.activeChannel.description}</p>
          {/if}
        </div>
        {#key chat.activeChannel.id}
          <MessageList channelId={chat.activeChannel.id} />
          <Composer channelId={chat.activeChannel.id} channelName={chat.activeChannel.name} />
        {/key}
      {:else if !chat.loading && !chat.error}
        <p class="empty">Aucun salon à afficher. Un administrateur peut en créer un.</p>
      {/if}
    </main>
  </div>
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
    padding: 10px 20px;
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

  .version {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 13px;
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

  .user {
    color: var(--text);
  }

  .role {
    margin-left: 6px;
    color: var(--text-muted);
    font-size: 13px;
  }

  button {
    padding: 6px 14px;
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

  .banner {
    margin: 0;
    padding: 8px 20px;
    background: var(--info-bg);
    border-bottom: 1px solid var(--info-border);
    color: var(--info-text);
    font-size: 14px;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .channel-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
  }

  h1 {
    margin: 0;
    font-size: 17px;
  }

  .channel-header p {
    margin: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    margin: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
