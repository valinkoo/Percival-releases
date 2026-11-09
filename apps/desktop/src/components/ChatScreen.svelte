<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { chat } from '../lib/chat.svelte';
  import { CONNECTION_LABELS } from '../lib/connection';
  import { session } from '../lib/session.svelte';
  import ChannelList from './ChannelList.svelte';
  import Composer from './Composer.svelte';
  import MessageList from './MessageList.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import UpdateBanner from './UpdateBanner.svelte';

  let settingsOpen = $state(false);

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
          <TypingIndicator channelId={chat.activeChannel.id} />
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

  .empty {
    margin: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
