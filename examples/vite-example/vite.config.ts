import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { insy } from '@insy/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), insy()],
});
