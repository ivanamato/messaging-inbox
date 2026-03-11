// socket.io WebSocket server for the Evolution API mock.
// Attaches to the existing HTTP server and namespaces per instance.

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { store } from './store.js';

const VALID_TOKENS: Record<string, string> = {
  'mock-token-123': 'MOCK1',
  'mock-token-456': 'MOCK2',
};

export function attachEvolutionWebSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  // Create a namespace per instance
  for (const [, instanceName] of Object.entries(VALID_TOKENS)) {
    const nsp = io.of(`/${instanceName}`);

    nsp.on('connection', (socket) => {
      console.log(`[ws] Client connected to /${instanceName} (${socket.id})`);
      socket.on('disconnect', () => {
        console.log(`[ws] Client disconnected from /${instanceName} (${socket.id})`);
      });
    });
  }

  // Subscribe to store mutations and broadcast via socket.io
  store.onMutation((event) => {
    const nsp = io.of(`/${event.instance}`);
    nsp.emit(event.type, event.data);
  });

  console.log('[ws] Evolution WebSocket server attached');
  return io;
}
