import { serve } from '@hono/node-server';
import { genericApp } from './generic-server-app.js';

const PORT = Number(process.env.GENERIC_PORT || 3003);

serve({ fetch: genericApp.fetch, port: PORT }, () => {
  console.log(`[generic-server] Generic API mock running on http://localhost:${PORT}`);
});
