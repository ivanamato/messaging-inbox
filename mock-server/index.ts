import { createServer } from 'http';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { attachEvolutionWebSocket } from './ws.js';

const PORT = Number(process.env.MOCK_PORT || 3002);

const server = serve({ fetch: app.fetch, port: PORT, createServer }, () => {
  console.log(`[mock-server] Evolution API mock running on http://localhost:${PORT}`);
});

attachEvolutionWebSocket(server as ReturnType<typeof createServer>);
