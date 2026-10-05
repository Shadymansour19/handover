import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is now done explicitly in main.js via
      // `virtual:pwa-register`'s registerSW(), not the plugin's own
      // auto-injected <script> — the auto-injected one only ever calls
      // navigator.serviceWorker.register() and nothing else, so a tab
      // left open across a deploy kept running the stale JS bundle
      // indefinitely (new service worker activates in the background,
      // but nothing told the already-loaded page about it). See
      // SPEC.md "stale app after a deploy".
      injectRegister: false,
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Handover',
        short_name: 'Handover',
        description: 'Work-permit and equipment-tracking tool',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // Explicit, not just relying on the spec's documented default —
        // leaving `orientation` out entirely is what caused rotation to
        // work fine in the plain mobile-browser tab (which doesn't apply
        // manifest orientation at all) but not once installed/launched as
        // a standalone app: several Android WebAPK/Chrome versions lock
        // installed PWAs to the orientation at install time rather than
        // actually defaulting to "any" when the field is simply absent.
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App-shell caching only (SPEC.md decision) — the static app is
        // cached so it launches offline; data always comes from Supabase
        // over the network and is never cached by the service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // The docx/pdf export libraries are large, dynamically import()'d
        // only when Export/Export PDF is actually clicked (mainView.js),
        // and exporting needs a live Supabase fetch regardless (see
        // fetchExportData()) — there's no offline export use case for
        // precaching to serve. Left in, pdfmake + its bundled font set
        // alone would add ~1.7MB to every install's precache, whether or
        // not Export is ever used.
        globIgnores: ['**/docxExport-*.js', '**/pdfExport-*.js', '**/pdfmake-*.js', '**/vfs_fonts-*.js'],
      },
    }),
  ],
})
