import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// vite.config.ts
// @ts-ignore - external package without types
import { startServer } from "@react-grab/opencode/server";

if (process.env.NODE_ENV === "development") {
  startServer();
}


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
