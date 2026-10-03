import { z } from 'zod';
import {
  activitySchema,
  cardSchema,
  checklistSchema,
  commentSchema,
  labelSchema,
  listSchema,
  notificationSchema,
  presenceViewerSchema,
  publicUserSchema,
} from './entities.js';
import { moveCardBodySchema, moveListBodySchema, updateCardBodySchema } from './rest.js';

const id = z.string().min(1);

/* --------------------------------------------------- client to server */

export const wsBoardOpenSchema = z.object({ boardId: id });
export const wsBoardCloseSchema = z.object({ boardId: id });
export const wsCardMoveSchema = moveCardBodySchema.extend({ cardId: id });
export const wsListMoveSchema = moveListBodySchema.extend({ listId: id });
export const wsCardUpdateSchema = z.object({ cardId: id, patch: updateCardBodySchema });
export const wsPresencePingSchema = z.object({ boardId: id });

/* --------------------------------------------------- server to client */

export const wsCardCreatedSchema = z.object({ card: cardSchema });
export const wsCardUpdatedSchema = z.object({ card: cardSchema });
export const wsCardMovedSchema = z.object({ cardId: id, listId: id, position: z.string() });
export const wsCardDeletedSchema = z.object({ cardId: id });
export const wsListCreatedSchema = z.object({ list: listSchema });
export const wsListUpdatedSchema = z.object({ list: listSchema });
export const wsListMovedSchema = z.object({ listId: id, position: z.string() });
export const wsListReorderedSchema = z.object({ listId: id, orderedCardIds: z.array(id) });
export const wsBoardListsReorderedSchema = z.object({ orderedListIds: z.array(id) });
export const wsLabelChangedSchema = z.object({ cardId: id, labels: z.array(labelSchema) });
export const wsMemberChangedSchema = z.object({ cardId: id, members: z.array(publicUserSchema) });
export const wsChecklistChangedSchema = z.object({
  cardId: id,
  checklists: z.array(checklistSchema),
});
export const wsCommentCreatedSchema = z.object({ comment: commentSchema });
export const wsActivityNewSchema = z.object({ activity: activitySchema });
export const wsPresenceUpdatedSchema = z.object({
  boardId: id,
  viewers: z.array(presenceViewerSchema),
});
export const wsNotificationNewSchema = z.object({ notification: notificationSchema });
export const wsErrorSchema = z.object({ code: z.string(), message: z.string() });

export type WsBoardOpen = z.infer<typeof wsBoardOpenSchema>;
export type WsCardMove = z.infer<typeof wsCardMoveSchema>;
export type WsListMove = z.infer<typeof wsListMoveSchema>;
export type WsCardUpdate = z.infer<typeof wsCardUpdateSchema>;
export type WsCardMoved = z.infer<typeof wsCardMovedSchema>;
export type WsListMoved = z.infer<typeof wsListMovedSchema>;
export type WsListReordered = z.infer<typeof wsListReorderedSchema>;
export type WsBoardListsReordered = z.infer<typeof wsBoardListsReorderedSchema>;
export type WsPresenceUpdated = z.infer<typeof wsPresenceUpdatedSchema>;
export type WsLabelChanged = z.infer<typeof wsLabelChangedSchema>;
export type WsMemberChanged = z.infer<typeof wsMemberChangedSchema>;
export type WsChecklistChanged = z.infer<typeof wsChecklistChangedSchema>;
