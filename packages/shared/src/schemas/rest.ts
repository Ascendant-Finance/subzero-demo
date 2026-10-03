import { z } from 'zod';
import {
  attachmentKindSchema,
  boardRoleSchema,
  boardVisibilitySchema,
  coverTypeSchema,
  workspaceRoleSchema,
} from './enums.js';
import {
  activitySchema,
  attachmentSchema,
  boardMemberSchema,
  boardSchema,
  cardSchema,
  checklistItemSchema,
  checklistSchema,
  commentSchema,
  inviteSchema,
  labelSchema,
  listSchema,
  notificationSchema,
  publicUserSchema,
  userSchema,
  workspaceMemberSchema,
  workspaceSchema,
} from './entities.js';

const id = z.string().min(1);
const nullableIsoDate = z.string().datetime().nullable();

/* ---------------------------------------------------------------- auth */

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authResponseSchema = z.object({ user: userSchema, accessToken: z.string() });
export const refreshResponseSchema = z.object({ accessToken: z.string() });
export const meResponseSchema = z.object({ user: userSchema });
export const okResponseSchema = z.object({ ok: z.literal(true) });

/* ---------------------------------------------------------- workspaces */

export const createWorkspaceBodySchema = z.object({ name: z.string().min(1).max(80) });
export const createInviteBodySchema = z.object({
  email: z.string().email().optional(),
  role: workspaceRoleSchema.default('member'),
});
export const joinWorkspaceBodySchema = z.object({ code: z.string().min(1) });

export const workspaceResponseSchema = z.object({ workspace: workspaceSchema });
export const workspacesResponseSchema = z.object({ workspaces: z.array(workspaceSchema) });
export const workspaceDetailResponseSchema = z.object({
  workspace: workspaceSchema,
  members: z.array(workspaceMemberSchema),
  boards: z.array(boardSchema),
});
export const inviteResponseSchema = z.object({ invite: inviteSchema });

/* -------------------------------------------------------------- boards */

export const createBoardBodySchema = z.object({
  title: z.string().min(1).max(120),
  visibility: boardVisibilitySchema.optional(),
  bgType: coverTypeSchema.optional(),
  bgValue: z.string().optional(),
});

export const updateBoardBodySchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(4000).nullable().optional(),
    visibility: boardVisibilitySchema.optional(),
    bgType: coverTypeSchema.optional(),
    bgValue: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });

export const addBoardMemberBodySchema = z.object({
  userId: id,
  role: boardRoleSchema.default('member'),
});
export const updateBoardMemberBodySchema = z.object({ role: boardRoleSchema });

export const boardResponseSchema = z.object({ board: boardSchema });
export const boardBootstrapResponseSchema = z.object({
  board: boardSchema,
  members: z.array(boardMemberSchema),
  lists: z.array(listSchema),
  cards: z.array(cardSchema),
  labels: z.array(labelSchema),
});
export const boardStarResponseSchema = z.object({ starred: z.boolean() });
export const boardMemberResponseSchema = z.object({ member: boardMemberSchema });

/* --------------------------------------------------------------- lists */

export const createListBodySchema = z.object({ title: z.string().min(1).max(120) });
export const updateListBodySchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });

/** Neighbour ids only. The client never sends a position. Spec section 5.1. */
export const moveListBodySchema = z.object({
  beforeListId: id.nullable(),
  afterListId: id.nullable(),
});

export const listResponseSchema = z.object({ list: listSchema });

/* --------------------------------------------------------------- cards */

export const createCardBodySchema = z.object({ title: z.string().min(1).max(400) });

export const updateCardBodySchema = z
  .object({
    title: z.string().min(1).max(400).optional(),
    description: z.string().max(20000).nullable().optional(),
    dueAt: nullableIsoDate.optional(),
    dueComplete: z.boolean().optional(),
    coverType: coverTypeSchema.optional(),
    coverValue: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });

export const moveCardBodySchema = z.object({
  targetListId: id,
  beforeCardId: id.nullable(),
  afterCardId: id.nullable(),
});

export const cardResponseSchema = z.object({ card: cardSchema });
export const cardDetailResponseSchema = z.object({
  card: cardSchema,
  labels: z.array(labelSchema),
  members: z.array(publicUserSchema),
  checklists: z.array(checklistSchema),
  comments: z.array(commentSchema),
  attachments: z.array(attachmentSchema),
});

export const cardLabelBodySchema = z.object({ labelId: id });
export const cardMemberBodySchema = z.object({ userId: id });

/* -------------------------------------------------------------- labels */

export const createLabelBodySchema = z.object({
  name: z.string().max(60).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const updateLabelBodySchema = z
  .object({
    name: z.string().max(60).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });
export const labelResponseSchema = z.object({ label: labelSchema });

/* ---------------------------------------------------------- checklists */

export const createChecklistBodySchema = z.object({ title: z.string().min(1).max(120) });
export const updateChecklistBodySchema = z.object({ title: z.string().min(1).max(120) });
export const createChecklistItemBodySchema = z.object({ text: z.string().min(1).max(400) });
export const updateChecklistItemBodySchema = z
  .object({
    text: z.string().min(1).max(400).optional(),
    completed: z.boolean().optional(),
    dueAt: nullableIsoDate.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' });

export const checklistResponseSchema = z.object({ checklist: checklistSchema });
export const checklistItemResponseSchema = z.object({ item: checklistItemSchema });

/* ------------------------------------------------------------ comments */

export const createCommentBodySchema = z.object({ text: z.string().min(1).max(5000) });
export const updateCommentBodySchema = z.object({ text: z.string().min(1).max(5000) });
export const commentResponseSchema = z.object({ comment: commentSchema });

/* --------------------------------------------------------- attachments */

export const presignBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive(),
});
export const presignResponseSchema = z.object({
  attachmentId: z.string(),
  uploadUrl: z.string(),
  publicUrl: z.string(),
});

export const createAttachmentBodySchema = z.object({
  kind: attachmentKindSchema,
  url: z.string().url(),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(160).optional(),
  sizeBytes: z.number().int().positive().optional(),
  attachmentId: z.string().optional(),
});
export const attachmentResponseSchema = z.object({ attachment: attachmentSchema });

/* --------------------------------- activity, notifications and search */

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const activityFeedResponseSchema = z.object({
  activities: z.array(activitySchema),
  nextCursor: z.string().nullable(),
});

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});

const csvIds = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : undefined));

export const boardSearchQuerySchema = z.object({
  q: z.string().optional(),
  labelIds: csvIds,
  memberIds: csvIds,
  due: z.enum(['overdue', 'day', 'week', 'month', 'none', 'complete', 'incomplete']).optional(),
});

export const boardSearchResponseSchema = z.object({ cards: z.array(cardSchema) });

/* --------------------------------------------------------------- types */

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;
export type CreateInviteBody = z.input<typeof createInviteBodySchema>;
export type JoinWorkspaceBody = z.infer<typeof joinWorkspaceBodySchema>;
export type WorkspaceDetailResponse = z.infer<typeof workspaceDetailResponseSchema>;
export type CreateBoardBody = z.infer<typeof createBoardBodySchema>;
export type UpdateBoardBody = z.infer<typeof updateBoardBodySchema>;
export type BoardBootstrapResponse = z.infer<typeof boardBootstrapResponseSchema>;
export type CreateListBody = z.infer<typeof createListBodySchema>;
export type UpdateListBody = z.infer<typeof updateListBodySchema>;
export type MoveListBody = z.infer<typeof moveListBodySchema>;
export type CreateCardBody = z.infer<typeof createCardBodySchema>;
export type UpdateCardBody = z.infer<typeof updateCardBodySchema>;
export type MoveCardBody = z.infer<typeof moveCardBodySchema>;
export type CardDetailResponse = z.infer<typeof cardDetailResponseSchema>;
export type CreateLabelBody = z.input<typeof createLabelBodySchema>;
export type UpdateLabelBody = z.infer<typeof updateLabelBodySchema>;
export type CreateChecklistBody = z.infer<typeof createChecklistBodySchema>;
export type CreateChecklistItemBody = z.infer<typeof createChecklistItemBodySchema>;
export type UpdateChecklistItemBody = z.infer<typeof updateChecklistItemBodySchema>;
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;
export type PresignBody = z.infer<typeof presignBodySchema>;
export type PresignResponse = z.infer<typeof presignResponseSchema>;
export type CreateAttachmentBody = z.infer<typeof createAttachmentBodySchema>;
export type BoardSearchQuery = z.input<typeof boardSearchQuerySchema>;
export type AddBoardMemberBody = z.input<typeof addBoardMemberBodySchema>;
export type DueFilter = NonNullable<z.infer<typeof boardSearchQuerySchema>['due']>;
