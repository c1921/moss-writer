/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Styles
import 'virtual:uno.css'
import 'unfonts.css'
import '@milkdown/theme-nord/style.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
