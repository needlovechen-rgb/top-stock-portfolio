import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/top-stock-portfolio/',
  server: {
    proxy: {
      // 代理 TWSE 一般 API (有 CORS 限制的)
      '/twse': {
        target: 'https://www.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/twse/, ''),
      },
      // 代理 TWSE OpenAPI (配息等)
      '/twse-open': {
        target: 'https://openapi.twse.com.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/twse-open/, ''),
      },
    },
  },
})

