import { mount } from 'svelte';
import App from './ui/App.svelte';
import './ui/app.css';
import { registerServiceWorker } from './ui/install.svelte';

registerServiceWorker();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
