import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import sqlite3 from 'sqlite3'
import { defineConfig, type PluginOption } from 'vite'

// Initialize SQLite database
const db = new sqlite3.Database('db.sqlite')

// Custom plugin for dev server API routes
function apiPlugin(): PluginOption {
  return {
    name: 'api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/alive', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        db.get('SELECT sqlite_version() as version', (err, row) => {
          if (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ message: 'Hello, World!', db: 'error', error: err.message }))
          } else {
            res.end(JSON.stringify({ message: 'Hello, World!', db: 'connected', sqlite_version: (row as { version: string }).version }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
})

