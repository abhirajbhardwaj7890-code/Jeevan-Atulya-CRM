import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  // Allow these prefixes to be exposed to the client-side code
  envPrefix: ['VITE_', 'REACT_APP_', 'SUPABASE_', 'GOOGLE_'],
});