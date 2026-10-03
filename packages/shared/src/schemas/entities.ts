import { z } from 'zod';
import {
  attachmentKindSchema,
  boardRoleSchema,
  boardVisibilitySchema,
  coverTypeSchema,
  notificationTypeSchema,
  workspaceRoleSchema,
} from './enums.js';

const dateish = z.union([z.string(), z.date()]).transform((v) => new Date(v).toISOString());
const nullableDateish = dateish.nullable();

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: dateish,
});

export const workspaceMemberSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  role: workspaceRoleSchema,
  joinedAt: dateish,
  user: publicUserSchema.optional(),
});

export const boardSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  visibility: boardVisibilitySchema,
  bgType: coverTypeSchema,
  bgValue: z.string(),
  closed: z.boolean(),
  createdById: z.string(),
  createdAt: dateish,
  starred: z.boolean().optional(),
});

export const boardMemberSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  userId: z.string(),
  role: boardRoleSchema,
  joinedAt: dateish,
  user: publicUserSchema.optional(),
});

export const listSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  title: z.string(),
  position: z.string(),
  archived: z.boolean(),
  createdAt: dateish,
});

export const labelSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  color: z.string(),
});

export const cardSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  listId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  position: z.string(),
  dueAt: nullableDateish,
  dueComplete: z.boolean(),
  coverType: coverTypeSchema,
  coverValue: z.string().nullable(),
  archived: z.boolean(),
  createdById: z.string(),
  createdAt: dateish,
  updatedAt: dateish,
  labelIds: z.array(z.string()).optional(),
  memberIds: z.array(z.string()).optional(),
  commentCount: z.number().optional(),
  attachmentCount: z.number().optional(),
  checklistTotal: z.number().optional(),
  checklistDone: z.number().optional(),
});

export const checklistItemSchema = z.object({
  id: z.string(),
  checklistId: z.string(),
  text: z.string(),
  completed: z.boolean(),
  position: z.string(),
  dueAt: nullableDateish,
  createdAt: dateish,
});

export const checklistSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  title: z.string(),
  position: z.string(),
  items: z.array(checklistItemSchema),
});

export const commentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  userId: z.string(),
  text: z.string(),
  editedAt: nullableDateish,
  createdAt: dateish,
  user: publicUserSchema.optional(),
});

export const attachmentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  uploaderId: z.string(),
  kind: attachmentKindSchema,
  url: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  isCover: z.boolean(),
  createdAt: dateish,
});

export const activitySchema = z.object({
  id: z.string(),
  boardId: z.string(),
  cardId: z.string().nullable(),
  userId: z.string(),
  type: z.string(),
  data: z.record(z.any()),
  createdAt: dateish,
  user: publicUserSchema.optional(),
});

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  actorId: z.string(),
  type: notificationTypeSchema,
  boardId: z.string().nullable(),
  cardId: z.string().nullable(),
  data: z.record(z.any()),
  read: z.boolean(),
  createdAt: dateish,
});

export const inviteSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  code: z.string(),
  email: z.string().nullable(),
  role: workspaceRoleSchema,
  createdById: z.string(),
  expiresAt: dateish,
  createdAt: dateish,
});

export const presenceViewerSchema = z.object({
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type Board = z.infer<typeof boardSchema>;
export type BoardMember = z.infer<typeof boardMemberSchema>;
export type List = z.infer<typeof listSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Checklist = z.infer<typeof checklistSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type Invite = z.infer<typeof inviteSchema>;
export type PresenceViewer = z.infer<typeof presenceViewerSchema>;
