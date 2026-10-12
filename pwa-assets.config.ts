import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG/ICO app icons in public/ from public/icon.svg (`npm run icons`).
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0c1016' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0c1016' } },
  },
  images: ['public/icon.svg'],
});
