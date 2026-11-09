import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { theme } from './lib/theme.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Missing #app root element');
}

theme.init();
mount(App, { target });
