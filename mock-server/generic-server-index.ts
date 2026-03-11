import { createServer } from 'http';
import { serve } from '@hono/node-server';
import { genericApp } from './generic-server-app.js';
import { attachGenericWebSocket } from './generic-ws.js';

const PORT = Number(process.env.GENERIC_PORT || 3003);

const server = serve({ fetch: genericApp.fetch, port: PORT, createServer }, () => {
  console.log(`[generic-server] Generic API mock running on http://localhost:${PORT}`);
});

attachGenericWebSocket(server as ReturnType<typeof createServer>);
