import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import tailwindcss from '@tailwindcss/vite';

// Serve devices.json from project root during dev
function serveDevicesJson(): Plugin {
  return {
    name: 'serve-devices-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/devices.json') return next();
        // Only serve tokens to loopback or local private-range connections.
        // Private ranges are included to support Docker Desktop for Mac, where
        // the host connects via the VM bridge gateway (192.168.65.x / 172.x.x.x)
        // rather than 127.0.0.1. The guard still blocks public internet addresses.
        const remoteAddr = req.socket.remoteAddress || '';
        const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
        // Also allow Docker Desktop VM bridge addresses. Docker Desktop for Mac
        // routes host→container traffic through its internal VM network and may
        // present source IPs in 172.x.x.x / 192.168.x.x / 10.x.x.x ranges.
        const isPrivate =
          /^(::ffff:)?192\.168\./.test(remoteAddr) ||
          /^(::ffff:)?172\./.test(remoteAddr) ||
          /^(::ffff:)?10\./.test(remoteAddr);
        if (!isLoopback && !isPrivate) {
          res.statusCode = 403;
          res.end('Forbidden: devices.json is only served to localhost');
          return;
        }
        const filePath = resolve(__dirname, 'devices.json');
        if (!existsSync(filePath)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(filePath, 'utf-8'));
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  envPrefix: 'OPENWHATS_',
  plugins: [
    preact(),
    tailwindcss(),
    serveDevicesJson(),
    dts({ include: ['src'], insertTypesEntry: true, rollupTypes: false, compilerOptions: { skipLibCheck: true } }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/client': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      command === 'build' ? 'production' : 'development'
    ),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MessagingInbox',
      formats: ['es', 'umd'],
      fileName: (format) => `messaging-inbox.${format}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'style.css';
          return assetInfo.name || 'assets/[name].[ext]';
        },
      },
    },
    cssCodeSplit: false,
  },
}));
