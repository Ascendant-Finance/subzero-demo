/** Canonical socket.io event names. Never hardcode these strings elsewhere. */
export const WS_EVENTS = {
  // client to server
  BOARD_OPEN: 'board:open',
  BOARD_CLOSE: 'board:close',
  CARD_MOVE: 'card:move',
  LIST_MOVE: 'list:move',
  CARD_UPDATE: 'card:update',
  PRESENCE_PING: 'presence:ping',

  // server to client
  CARD_CREATED: 'card:created',
  CARD_UPDATED: 'card:updated',
  CARD_MOVED: 'card:moved',
  CARD_DELETED: 'card:deleted',
  LIST_CREATED: 'list:created',
  LIST_UPDATED: 'list:updated',
  LIST_MOVED: 'list:moved',
  LIST_REORDERED: 'list:reordered',
  BOARD_LISTS_REORDERED: 'board:lists_reordered',
  LABEL_CHANGED: 'label:changed',
  MEMBER_CHANGED: 'member:changed',
  CHECKLIST_CHANGED: 'checklist:changed',
  COMMENT_CREATED: 'comment:created',
  ACTIVITY_NEW: 'activity:new',
  PRESENCE_UPDATED: 'presence:updated',
  NOTIFICATION_NEW: 'notification:new',
  ERROR: 'error',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export const ROOMS = {
  user: (userId: string) => `user:${userId}`,
  board: (boardId: string) => `board:${boardId}`,
} as const;
