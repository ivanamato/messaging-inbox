// Native WebSocket server for the generic-server mock.
// Uses the `ws` npm package. Broadcasts normalized JSON frames.

import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';

const GENERIC_TOKENS: Record<string, string> = {
  'generic-token-789': 'GENERIC1',
  'generic-token-custom': 'GENERIC_CUSTOM',
};

type WsClient = {
  socket: WebSocket;
  channelId: string;
};

let clients: WsClient[] = [];

export function attachGenericWebSocket(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Match /ws/channels/:channelId or /api/v2/ws/:channelId
    const defaultMatch = pathname.match(/^\/ws\/channels\/([^/]+)$/);
    const customMatch = pathname.match(/^\/api\/v2\/ws\/([^/]+)$/);
    const match = defaultMatch || customMatch;

    if (!match) {
      socket.destroy();
      return;
    }

    const channelId = decodeURIComponent(match[1]);
    const token = url.searchParams.get('token');

    if (!token || !GENERIC_TOKENS[token] || GENERIC_TOKENS[token] !== channelId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, channelId);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, channelId: string) => {
    const client: WsClient = { socket: ws, channelId };
    clients.push(client);
    console.log(`[generic-ws] Client connected for channel ${channelId}`);

    ws.on('close', () => {
      clients = clients.filter((c) => c !== client);
      console.log(`[generic-ws] Client disconnected from channel ${channelId}`);
    });

    ws.on('message', (data) => {
      // Handle ping/pong keepalive
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore
      }
    });
  });

  console.log('[generic-ws] Generic WebSocket server attached');
  return wss;
}

/** Broadcast a normalized event to all clients connected to a specific channel. */
export function broadcastToChannel(channelId: string, event: Record<string, unknown>): void {
  const data = JSON.stringify(event);
  for (const client of clients) {
    if (client.channelId === channelId && client.socket.readyState === 1) {
      client.socket.send(data);
    }
  }
}
