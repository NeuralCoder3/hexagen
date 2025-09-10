import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      // Auth/session routes should hit backend directly in dev
      '/login': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/auth_cb': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/logout': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
