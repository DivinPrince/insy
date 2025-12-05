import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// vite.config.ts
import { startServer } from "@react-grab/opencode/server";

if (process.env.NODE_ENV === "development") {
  startServer();
}


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
