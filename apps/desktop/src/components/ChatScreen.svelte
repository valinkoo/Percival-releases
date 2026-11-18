<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { chat } from '../lib/chat.svelte';
  import { CONNECTION_LABELS } from '../lib/connection';
  import { can } from '../lib/roles';
  import { session } from '../lib/session.svelte';
  import ChannelList from './ChannelList.svelte';
  import ChannelSettingsPanel from './ChannelSettingsPanel.svelte';
  import Composer from './Composer.svelte';
  import MessageList from './MessageList.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import UpdateBanner from './UpdateBanner.svelte';

  let settingsOpen = $state(false);
  let channelSettingsOpen = $state(false);

  const canManageChannel = $derived(
    can(session.user?.roles, 'channel.rename') || can(session.user?.roles, 'channel.members'),
  );

  onMount(() => {
    void chat.start();
  });
  onDestroy(() => chat.stop());
</script>

<div class="layout">
  <header>
    <span class="brand">
      <span class="logo" aria-hidden="true">P</span> Percival
    </span>
    <div class="right">
      <span class="status {chat.connection}" role="status">
        <span class="dot" aria-hidden="true"></span>{CONNECTION_LABELS[chat.connection]}
      </span>
      <span class="user">{session.user?.username}</span>
      <button type="button" onclick={() => (settingsOpen = true)}>Paramètres</button>
    </div>
  </header>

  {#if settingsOpen}
    <SettingsPanel onclose={() => (settingsOpen = false)} />
  {/if}

  <!-- Tied to the open channel: if it disappears (the user lost access), the panel goes too. -->
  {#if channelSettingsOpen && chat.activeChannel}
    {#key chat.activeChannel.id}
      <ChannelSettingsPanel
        channel={chat.activeChannel}
        onclose={() => (channelSettingsOpen = false)}
      />
    {/key}
  {/if}

  <UpdateBanner />

  {#if session.notice}
    <p class="banner" role="status">{session.notice}</p>
  {/if}

  <div class="body">
    <ChannelList />

    <main>
      {#if chat.activeChannel}
        <div class="channel-header">
          <h1>
            <span aria-hidden="true">#</span>{chat.activeChannel.name}
            {#if chat.activeChannel.isPrivate}
              <span class="lock" role="img" aria-label="Salon privé" title="Salon privé">🔒</span>
            {/if}
          </h1>
          {#if chat.activeChannel.description}
            <p>{chat.activeChannel.description}</p>
          {/if}
          {#if canManageChannel}
            <button type="button" class="manage" onclick={() => (channelSettingsOpen = true)}>
              Gérer le salon
            </button>
          {/if}
        </div>
        {#key chat.activeChannel.id}
          <MessageList channelId={chat.activeChannel.id} />
          <TypingIndicator channelId={chat.activeChannel.id} />
          <Composer channelId={chat.activeChannel.id} channelName={chat.activeChannel.name} />
        {/key}
      {:else if !chat.loading && !chat.error}
        <p class="empty">
          Aucun salon à afficher. Un administrateur ou un Modo peut en créer un, ou vous donner
          accès à un salon existant.
        </p>
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

  .right button {
    padding: 6px 14px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }

  .right button:hover {
    border-color: var(--accent);
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

  .lock {
    margin-left: 4px;
    font-size: 13px;
  }

  .manage {
    flex-shrink: 0;
    margin-left: auto;
    padding: 4px 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .manage:hover {
    border-color: var(--accent);
  }

  .empty {
    margin: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
