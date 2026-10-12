import { createAppleSplashScreens, defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the app icons and iOS splash screens in public/ from public/icon.svg.
// Run `npm run icons` after changing the icon, then commit the generated files.
const BG = '#0c1016';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BG } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: BG } },
    // iOS ignores the manifest's background color, so it needs startup images:
    // the icon centered on the app background, one per device size and orientation.
    appleSplashScreens: createAppleSplashScreens({
      padding: 0.6,
      resizeOptions: { background: BG, fit: 'contain' },
      linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/spread/', xhtml: false },
      png: { compressionLevel: 9, quality: 60 },
      name: (landscape, size) => `splash/apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
    }),
  },
  images: ['public/icon.svg'],
});
