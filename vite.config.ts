import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // This repository retains legacy projects under external-proj/ as reference
  // material. Limit dependency discovery to the application entry point so
  // Vite does not scan their unrelated HTML/JavaScript files.
  optimizeDeps: {
    entries: ['index.html'],
    // Sharp is a native Node addon. Keep it out of the browser pre-bundle.
    exclude: ['sharp'],
  },
  ssr: {
    external: ['sharp'],
  },
})
