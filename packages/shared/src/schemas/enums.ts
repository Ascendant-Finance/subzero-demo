import { z } from 'zod';

export const workspaceRoleSchema = z.enum(['admin', 'member']);
export const boardRoleSchema = z.enum(['admin', 'member', 'observer']);
export const boardVisibilitySchema = z.enum(['private', 'workspace', 'public']);
export const coverTypeSchema = z.enum(['none', 'color', 'image']);
export const attachmentKindSchema = z.enum(['file', 'link']);
export const notificationTypeSchema = z.enum(['mention', 'assigned', 'due_soon', 'added_to_board']);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type BoardRole = z.infer<typeof boardRoleSchema>;
export type BoardVisibility = z.infer<typeof boardVisibilitySchema>;
export type CoverType = z.infer<typeof coverTypeSchema>;
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
