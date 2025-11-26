

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/memristor/',  // ← REPLACE <repo-name> with your GitHub repo
})
