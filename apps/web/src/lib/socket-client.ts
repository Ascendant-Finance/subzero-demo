'use client';

import { WS_EVENTS } from '@trello-clone/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './auth-store';
import { WS_URL } from './config';

let socket: Socket | null = null;

/** One shared socket for the tab, keyed by the current access token. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(WS_URL, {
    autoConnect: true,
    transports: ['websocket'],
    auth: (callback) => callback({ token: getAccessToken() }),
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export { WS_EVENTS };
export type { Socket };
