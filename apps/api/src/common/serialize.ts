import type {
  Activity as ActivityRow,
  Attachment as AttachmentRow,
  Board as BoardRow,
  BoardMember as BoardMemberRow,
  Card as CardRow,
  Checklist as ChecklistRow,
  ChecklistItem as ChecklistItemRow,
  Comment as CommentRow,
  Invite as InviteRow,
  Label as LabelRow,
  List as ListRow,
  Notification as NotificationRow,
  User as UserRow,
  Workspace as WorkspaceRow,
  WorkspaceMember as WorkspaceMemberRow,
} from '@prisma/client';
import type {
  Activity,
  Attachment,
  Board,
  BoardMember,
  Card,
  Checklist,
  ChecklistItem,
  Comment,
  Invite,
  Label,
  List,
  Notification,
  PublicUser,
  Workspace,
  WorkspaceMember,
} from '@trello-clone/shared';

const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null);

export type CardAggregates = {
  labelIds?: string[];
  memberIds?: string[];
  commentCount?: number;
  attachmentCount?: number;
  checklistTotal?: number;
  checklistDone?: number;
};

export function toPublicUser(user: Pick<UserRow, 'id' | 'name' | 'email' | 'avatarUrl'>): PublicUser {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

export function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: iso(row.createdAt) };
}

export function toWorkspaceMember(
  row: WorkspaceMemberRow & { user?: UserRow | null },
): WorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role,
    joinedAt: iso(row.joinedAt),
    ...(row.user ? { user: toPublicUser(row.user) } : {}),
  };
}

export function toBoard(row: BoardRow, starred?: boolean): Board {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    bgType: row.bgType,
    bgValue: row.bgValue,
    closed: row.closed,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    ...(starred === undefined ? {} : { starred }),
  };
}

export function toBoardMember(row: BoardMemberRow & { user?: UserRow | null }): BoardMember {
  return {
    id: row.id,
    boardId: row.boardId,
    userId: row.userId,
    role: row.role,
    joinedAt: iso(row.joinedAt),
    ...(row.user ? { user: toPublicUser(row.user) } : {}),
  };
}

export function toList(row: ListRow): List {
  return {
    id: row.id,
    boardId: row.boardId,
    title: row.title,
    position: row.position,
    archived: row.archived,
    createdAt: iso(row.createdAt),
  };
}

export function toLabel(row: LabelRow): Label {
  return { id: row.id, boardId: row.boardId, name: row.name, color: row.color };
}

export function toCard(row: CardRow, aggregates: CardAggregates = {}): Card {
  return {
    id: row.id,
    boardId: row.boardId,
    listId: row.listId,
    title: row.title,
    description: row.description,
    position: row.position,
    dueAt: isoOrNull(row.dueAt),
    dueComplete: row.dueComplete,
    coverType: row.coverType,
    coverValue: row.coverValue,
    archived: row.archived,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...aggregates,
  };
}

export function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    checklistId: row.checklistId,
    text: row.text,
    completed: row.completed,
    position: row.position,
    dueAt: isoOrNull(row.dueAt),
    createdAt: iso(row.createdAt),
  };
}

export function toChecklist(row: ChecklistRow & { items?: ChecklistItemRow[] }): Checklist {
  return {
    id: row.id,
    cardId: row.cardId,
    title: row.title,
    position: row.position,
    items: (row.items ?? []).map(toChecklistItem),
  };
}

export function toComment(row: CommentRow & { user?: UserRow | null }): Comment {
  return {
    id: row.id,
    cardId: row.cardId,
    userId: row.userId,
    text: row.text,
    editedAt: isoOrNull(row.editedAt),
    createdAt: iso(row.createdAt),
    ...(row.user ? { user: toPublicUser(row.user) } : {}),
  };
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    cardId: row.cardId,
    uploaderId: row.uploaderId,
    kind: row.kind,
    url: row.url,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    isCover: row.isCover,
    createdAt: iso(row.createdAt),
  };
}

export function toActivity(row: ActivityRow & { user?: UserRow | null }): Activity {
  return {
    id: row.id,
    boardId: row.boardId,
    cardId: row.cardId,
    userId: row.userId,
    type: row.type,
    data: (row.data ?? {}) as Record<string, unknown>,
    createdAt: iso(row.createdAt),
    ...(row.user ? { user: toPublicUser(row.user) } : {}),
  };
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.userId,
    actorId: row.actorId,
    type: row.type,
    boardId: row.boardId,
    cardId: row.cardId,
    data: (row.data ?? {}) as Record<string, unknown>,
    read: row.read,
    createdAt: iso(row.createdAt),
  };
}

export function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    code: row.code,
    email: row.email,
    role: row.role,
    createdById: row.createdById,
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
  };
}
