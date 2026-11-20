import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// host: true lets your phone open the app over home Wi-Fi (http://<your-mac>.local:5180).
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5180, strictPort: true },
});
