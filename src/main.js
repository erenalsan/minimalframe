import { mount } from 'svelte'
import './fonts.js'
import './app.css'
import './ui.css'
import './lib/theme.svelte.js' // the chosen theme, before anything is drawn
import App from './App.svelte'
import { registerSW } from 'virtual:pwa-register'
import { startSegMotion } from './lib/segMotion.js'

startSegMotion()

// The offline worker is for the website. The Android app already ships every file in the APK, and a worker
// there would keep serving the previous version's files after an app update.
if (!window.Capacitor?.isNativePlatform?.()) registerSW({ immediate: true })

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
