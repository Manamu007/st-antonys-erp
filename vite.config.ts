import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, '.', '');
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  
  // Dynamic version generation for GCS deployment (e.g. version-10, version-11, etc. inside service-25-working/)
  let version = process.env.VITE_ACTIVE_VERSION;
  if (!version) {
    try {
      const versionFilePath = path.resolve(__dirname, 'version.txt');
      let currentVersion = 'version-10';
      if (fs.existsSync(versionFilePath)) {
        currentVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
      }

      if (command === 'build') {
        const match = currentVersion.match(/version-(\d+)/);
        if (match) {
          const nextVersionNum = parseInt(match[1], 10) + 1;
          version = `version-${nextVersionNum}`;
        } else {
          version = `version-${Date.now()}`;
        }
        fs.writeFileSync(versionFilePath, version, 'utf-8');
        console.log(`[Vite Build] Target deployment version incremented and set to: ${version}`);
      } else {
        version = currentVersion || 'version-10';
        console.log(`[Vite] Serving with active version: ${version}`);
      }

      process.env.VITE_ACTIVE_VERSION = version;

      // Clean up all old version-* folders inside dist to prevent massive bloat and slow publishing/deployments
      const distPath = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distPath) && command === 'build') {
        const files = fs.readdirSync(distPath);
        for (const file of files) {
          if (file.startsWith('version-') && file !== version) {
            const fullPath = path.join(distPath, file);
            try {
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`[Vite Build] Cleaned up old version build to prevent bloat: ${file}`);
            } catch (cleanErr) {
              console.error(`[Vite Build] Error cleaning old version ${file}:`, cleanErr);
            }
          }
        }
      }
    } catch (e) {
      console.error("[Vite Build] Error managing version.txt:", e);
      version = 'version-10';
    }
  }
  
  return {
    base: '/', // Ensure absolute URLs for assets to load perfectly on deep nested router paths and prevent Safari "Importing a module script failed" errors on reload
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-to-version',
        closeBundle() {
          const distPath = path.resolve(__dirname, 'dist');
          const versionedPath = path.join(distPath, version);
          
          function copyFolderSync(from: string, to: string) {
            if (!fs.existsSync(to)) {
              fs.mkdirSync(to, { recursive: true });
            }
            fs.readdirSync(from).forEach(element => {
              if (element === version) return; // Avoid infinite recursion
              const srcPath = path.join(from, element);
              const destPath = path.join(to, element);
              const stat = fs.lstatSync(srcPath);
              if (stat.isDirectory()) {
                copyFolderSync(srcPath, destPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
              }
            });
          }
          
          try {
            console.log(`[Vite Plugin] Copying build files from dist to ${versionedPath}...`);
            copyFolderSync(distPath, versionedPath);
            console.log(`[Vite Plugin] Successfully copied build files to backward-compatible versioned path!`);
          } catch (err) {
            console.error("[Vite Plugin] Error copying files to versioned path:", err);
          }
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom', 'react-router-dom', 'motion', 'motion/react'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-router-dom',
        'motion/react',
        'sonner',
        'lucide-react',
      ],
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      cssCodeSplit: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
