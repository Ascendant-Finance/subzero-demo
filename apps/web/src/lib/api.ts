'use client';

import type {
  Activity,
  Attachment,
  Board,
  BoardBootstrapResponse,
  Card,
  CardDetailResponse,
  Checklist,
  ChecklistItem,
  Comment,
  Invite,
  Label,
  List,
  Notification,
  PresignResponse,
  PublicUser,
  User,
  Workspace,
  WorkspaceDetailResponse,
} from '@trello-clone/shared';
import { api } from './api-client';

/** Every REST call the client makes, typed by the shared contract. */
export const trello = {
  auth: {
    register: (body: { email: string; password: string; name: string }) =>
      api.post<{ user: User; accessToken: string }>('/auth/register', body),
    login: (body: { email: string; password: string }) =>
      api.post<{ user: User; accessToken: string }>('/auth/login', body),
    logout: () => api.post<{ ok: true }>('/auth/logout'),
    me: () => api.get<{ user: User }>('/auth/me'),
  },

  workspaces: {
    list: () => api.get<{ workspaces: Workspace[] }>('/workspaces'),
    create: (name: string) => api.post<{ workspace: Workspace }>('/workspaces', { name }),
    detail: (id: string) => api.get<WorkspaceDetailResponse>(`/workspaces/${id}`),
    createInvite: (id: string, role: 'admin' | 'member' = 'member') =>
      api.post<{ invite: Invite }>(`/workspaces/${id}/invites`, { role }),
    join: (code: string) => api.post<{ workspace: Workspace }>('/workspaces/join', { code }),
  },

  boards: {
    create: (workspaceId: string, body: { title: string; visibility?: string; bgValue?: string }) =>
      api.post<{ board: Board }>(`/workspaces/${workspaceId}/boards`, body),
    bootstrap: (id: string) => api.get<BoardBootstrapResponse>(`/boards/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      api.patch<{ board: Board }>(`/boards/${id}`, body),
    close: (id: string) => api.post<{ board: Board }>(`/boards/${id}/close`),
    reopen: (id: string) => api.post<{ board: Board }>(`/boards/${id}/reopen`),
    star: (id: string) => api.post<{ starred: boolean }>(`/boards/${id}/star`),
    unstar: (id: string) => api.delete<{ starred: boolean }>(`/boards/${id}/star`),
    addMember: (id: string, userId: string, role = 'member') =>
      api.post(`/boards/${id}/members`, { userId, role }),
    updateMember: (id: string, userId: string, role: string) =>
      api.patch(`/boards/${id}/members/${userId}`, { role }),
    removeMember: (id: string, userId: string) => api.delete(`/boards/${id}/members/${userId}`),
    activity: (id: string, cursor?: string) =>
      api.get<{ activities: Activity[]; nextCursor: string | null }>(
        `/boards/${id}/activity${cursor ? `?cursor=${cursor}` : ''}`,
      ),
    search: (id: string, query: string) =>
      api.get<{ cards: Card[] }>(`/boards/${id}/search${query ? `?${query}` : ''}`),
  },

  lists: {
    create: (boardId: string, title: string) =>
      api.post<{ list: List }>(`/boards/${boardId}/lists`, { title }),
    update: (id: string, body: { title?: string; archived?: boolean }) =>
      api.patch<{ list: List }>(`/lists/${id}`, body),
    move: (id: string, beforeListId: string | null, afterListId: string | null) =>
      api.post<{ list: List }>(`/lists/${id}/move`, { beforeListId, afterListId }),
  },

  cards: {
    create: (listId: string, title: string) =>
      api.post<{ card: Card }>(`/lists/${listId}/cards`, { title }),
    detail: (id: string) => api.get<CardDetailResponse>(`/cards/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      api.patch<{ card: Card }>(`/cards/${id}`, body),
    move: (
      id: string,
      targetListId: string,
      beforeCardId: string | null,
      afterCardId: string | null,
    ) => api.post<{ card: Card }>(`/cards/${id}/move`, { targetListId, beforeCardId, afterCardId }),
    addLabel: (id: string, labelId: string) => api.post(`/cards/${id}/labels`, { labelId }),
    removeLabel: (id: string, labelId: string) => api.delete(`/cards/${id}/labels/${labelId}`),
    addMember: (id: string, userId: string) => api.post(`/cards/${id}/members`, { userId }),
    removeMember: (id: string, userId: string) => api.delete(`/cards/${id}/members/${userId}`),
    activity: (id: string) =>
      api.get<{ activities: Activity[]; nextCursor: string | null }>(`/cards/${id}/activity`),
  },

  labels: {
    create: (boardId: string, body: { name: string; color: string }) =>
      api.post<{ label: Label }>(`/boards/${boardId}/labels`, body),
    update: (id: string, body: { name?: string; color?: string }) =>
      api.patch<{ label: Label }>(`/labels/${id}`, body),
    remove: (id: string) => api.delete(`/labels/${id}`),
  },

  checklists: {
    create: (cardId: string, title: string) =>
      api.post<{ checklist: Checklist }>(`/cards/${cardId}/checklists`, { title }),
    update: (id: string, title: string) =>
      api.patch<{ checklist: Checklist }>(`/checklists/${id}`, { title }),
    remove: (id: string) => api.delete(`/checklists/${id}`),
    createItem: (checklistId: string, text: string) =>
      api.post<{ item: ChecklistItem }>(`/checklists/${checklistId}/items`, { text }),
    updateItem: (id: string, body: { text?: string; completed?: boolean }) =>
      api.patch<{ item: ChecklistItem }>(`/checklist-items/${id}`, body),
    removeItem: (id: string) => api.delete(`/checklist-items/${id}`),
  },

  comments: {
    create: (cardId: string, text: string) =>
      api.post<{ comment: Comment }>(`/cards/${cardId}/comments`, { text }),
    update: (id: string, text: string) => api.patch<{ comment: Comment }>(`/comments/${id}`, { text }),
    remove: (id: string) => api.delete(`/comments/${id}`),
  },

  attachments: {
    presign: (cardId: string, body: { fileName: string; mimeType: string; sizeBytes: number }) =>
      api.post<PresignResponse>(`/uploads/presign?cardId=${cardId}`, body),
    create: (cardId: string, body: Record<string, unknown>) =>
      api.post<{ attachment: Attachment }>(`/cards/${cardId}/attachments`, body),
    setCover: (cardId: string, attachmentId: string) =>
      api.post<{ card: Card }>(`/cards/${cardId}/attachments/${attachmentId}/cover`),
    remove: (id: string) => api.delete(`/attachments/${id}`),
  },

  notifications: {
    list: () =>
      api.get<{ notifications: Notification[]; nextCursor: string | null }>('/notifications'),
    markRead: (id: string) => api.post(`/notifications/${id}/read`),
    markAllRead: () => api.post('/notifications/read-all'),
  },

  users: {
    search: (q: string) => api.get<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  },

  demo: {
    signup: (body: { email: string; name: string; company?: string; website?: string }) =>
      api.post<{ user: User; accessToken: string; demo: DemoDetails & DemoCredentials }>(
        '/demo/signup',
        body,
      ),
    me: () => api.get<{ demo: DemoDetails }>('/demo/me'),
  },
};

export interface DemoDetails {
  projectKey: string;
  expiresAt: string;
  dashboardUrl: string;
  apiUrl: string;
  repoUrl: string;
}

/** Shown once, at signup. The server keeps only hashes. */
export interface DemoCredentials {
  trelloPassword: string;
  subzero: { email: string; password: string };
}
