'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COPY, type CardDetailResponse } from '@trello-clone/shared';
import {
  Archive,
  CheckSquare,
  Clock,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CommentBox } from '@/components/board/comment-box';
import { Markdown } from '@/components/board/markdown';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { trello } from '@/lib/api';
import { useBoardStore } from '@/stores/board-store';

interface CardModalProps {
  cardId: string;
  canEdit: boolean;
  canComment: boolean;
  onClose: () => void;
}

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CardModal({ cardId, canEdit, canComment, onClose }: CardModalProps) {
  const queryClient = useQueryClient();
  const labels = useBoardStore((state) => state.labels);
  const members = useBoardStore((state) => state.members);

  const { data, isLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => trello.cards.detail(cardId),
  });

  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [checklistTitle, setChecklistTitle] = useState('');
  const [panel, setPanel] = useState<'labels' | 'members' | 'attachment' | null>(null);

  useEffect(() => {
    if (!data) return;
    setDescription(data.card.description ?? '');
    setTitle(data.card.title);
  }, [data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['card', cardId] });

  const updateCard = useMutation({
    mutationFn: (body: Record<string, unknown>) => trello.cards.update(cardId, body),
    onSuccess: refresh,
  });
  const toggleLabel = useMutation({
    mutationFn: ({ labelId, on }: { labelId: string; on: boolean }) =>
      on ? trello.cards.addLabel(cardId, labelId) : trello.cards.removeLabel(cardId, labelId),
    onSuccess: refresh,
  });
  const toggleMember = useMutation({
    mutationFn: ({ userId, on }: { userId: string; on: boolean }) =>
      on ? trello.cards.addMember(cardId, userId) : trello.cards.removeMember(cardId, userId),
    onSuccess: refresh,
  });
  const addChecklist = useMutation({
    mutationFn: (value: string) => trello.checklists.create(cardId, value),
    onSuccess: () => {
      setChecklistTitle('');
      refresh();
    },
  });
  const addItem = useMutation({
    mutationFn: ({ checklistId, text }: { checklistId: string; text: string }) =>
      trello.checklists.createItem(checklistId, text),
    onSuccess: refresh,
  });
  const toggleItem = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      trello.checklists.updateItem(id, { completed }),
    // Ticking an item responds immediately rather than waiting for the round
    // trip, so the checkbox never flicks back to its old state.
    onMutate: ({ id, completed }) => {
      // Written synchronously so the tick lands in the same render as the
      // click; an in flight refetch is cancelled straight after.
      const previous = queryClient.getQueryData<CardDetailResponse>(['card', cardId]);
      if (previous) {
        queryClient.setQueryData<CardDetailResponse>(['card', cardId], {
          ...previous,
          checklists: previous.checklists.map((checklist) => ({
            ...checklist,
            items: checklist.items.map((item) =>
              item.id === id ? { ...item, completed } : item,
            ),
          })),
        });
      }
      void queryClient.cancelQueries({ queryKey: ['card', cardId] });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['card', cardId], context.previous);
    },
    onSettled: refresh,
  });
  const removeChecklist = useMutation({
    mutationFn: (id: string) => trello.checklists.remove(id),
    onSuccess: refresh,
  });
  const addComment = useMutation({
    mutationFn: (text: string) => trello.comments.create(cardId, text),
    onSuccess: refresh,
  });
  const addLink = useMutation({
    mutationFn: (url: string) =>
      trello.attachments.create(cardId, { kind: 'link', url, name: url }),
    onSuccess: () => {
      setLinkUrl('');
      refresh();
    },
  });
  const setCover = useMutation({
    mutationFn: (attachmentId: string) => trello.attachments.setCover(cardId, attachmentId),
    onSuccess: refresh,
  });
  const removeAttachment = useMutation({
    mutationFn: (id: string) => trello.attachments.remove(id),
    onSuccess: refresh,
  });

  /** Presign, PUT straight to object storage, then link the attachment. */
  async function uploadFile(file: File) {
    const presigned = await trello.attachments.presign(cardId, {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    await fetch(presigned.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    await trello.attachments.create(cardId, {
      kind: 'file',
      url: presigned.publicUrl,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      attachmentId: presigned.attachmentId,
    });
    refresh();
  }

  const card = data?.card;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card?.title ?? 'Card'}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-10"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="mx-auto w-full max-w-3xl rounded-[var(--radius)] bg-[var(--color-surface)] shadow-xl">
        {isLoading || !card || !data ? (
          <Spinner label="Loading card" />
        ) : (
          <>
            {card.coverType === 'image' && card.coverValue && (
              <img
                src={card.coverValue}
                alt=""
                className="max-h-56 w-full rounded-t-[var(--radius)] object-cover"
              />
            )}

            <div className="flex items-start gap-3 p-5 pb-2">
              <div className="min-w-0 flex-1">
                {canEdit ? (
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => title.trim() && title !== card.title && updateCard.mutate({ title })}
                    className="w-full rounded-[var(--radius-sm)] border border-transparent px-1 py-0.5 text-lg font-semibold outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]"
                  />
                ) : (
                  <h2 className="text-lg font-semibold">{card.title}</h2>
                )}
                {card.archived && (
                  <p className="mt-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                    {COPY['card.archived']}
                  </p>
                )}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-black/10">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-6 p-5 pt-2 sm:grid-cols-[1fr_180px]">
              <div className="min-w-0">
                {(data.labels.length > 0 || data.members.length > 0 || card.dueAt) && (
                  <div className="mb-5 flex flex-wrap gap-4">
                    {data.labels.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Labels</p>
                        <div className="flex flex-wrap gap-1">
                          {data.labels.map((label) => (
                            <span
                              key={label.id}
                              className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-white"
                              style={{ background: label.color }}
                            >
                              {label.name || ' '}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {data.members.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Members</p>
                        <div className="flex gap-1">
                          {data.members.map((user) => (
                            <Avatar key={user.id} name={user.name} avatarUrl={user.avatarUrl} />
                          ))}
                        </div>
                      </div>
                    )}

                    {card.dueAt && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">
                          {COPY['card.due.label']}
                        </p>
                        <label className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={card.dueComplete}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateCard.mutate({ dueComplete: event.target.checked })
                            }
                          />
                          {new Date(card.dueAt).toLocaleString()}
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <section className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold">Description</h3>
                  {editingDescription && canEdit ? (
                    <>
                      <div className="mb-1 flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setPreview(false)}
                          className={!preview ? 'font-semibold text-[var(--color-accent)]' : ''}
                        >
                          Write
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreview(true)}
                          className={preview ? 'font-semibold text-[var(--color-accent)]' : ''}
                        >
                          Preview
                        </button>
                      </div>
                      {preview ? (
                        <div className="min-h-24 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                          <Markdown>{description || '_Nothing yet_'}</Markdown>
                        </div>
                      ) : (
                        <textarea
                          autoFocus
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          rows={6}
                          placeholder={COPY['card.description.placeholder']}
                          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-sm outline-none focus:border-[var(--color-accent)]"
                        />
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            updateCard.mutate({ description });
                            setEditingDescription(false);
                          }}
                          className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDescription(card.description ?? '');
                            setEditingDescription(false);
                          }}
                          className="px-2 text-sm text-[var(--color-text-muted)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => canEdit && setEditingDescription(true)}
                      className="w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-3 text-left"
                    >
                      {card.description ? (
                        <Markdown>{card.description}</Markdown>
                      ) : (
                        <span className="text-sm text-[var(--color-text-muted)]">
                          {COPY['card.description.placeholder']}
                        </span>
                      )}
                    </button>
                  )}
                </section>

                <section className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold">Checklists</h3>
                  {data.checklists.map((checklist) => {
                    const done = checklist.items.filter((item) => item.completed).length;
                    const percent = checklist.items.length
                      ? Math.round((done / checklist.items.length) * 100)
                      : 0;
                    return (
                      <div key={checklist.id} className="mb-4">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium">{checklist.title}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{percent}%</span>
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Delete ${checklist.title}`}
                              onClick={() => removeChecklist.mutate(checklist.id)}
                              className="ml-auto rounded p-1 text-[var(--color-text-muted)] hover:bg-black/10"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="mb-2 h-1.5 w-full rounded-full bg-[var(--color-surface-2)]">
                          <div
                            className="h-1.5 rounded-full bg-[var(--color-success)] transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <ul className="mb-2">
                          {checklist.items.map((item) => (
                            <li key={item.id} className="flex items-center gap-2 py-0.5 text-sm">
                              <input
                                type="checkbox"
                                checked={item.completed}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  toggleItem.mutate({ id: item.id, completed: event.target.checked })
                                }
                              />
                              <span className={item.completed ? 'text-[var(--color-text-muted)] line-through' : ''}>
                                {item.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {canEdit && (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              const input = event.currentTarget.elements.namedItem(
                                'item',
                              ) as HTMLInputElement;
                              if (input.value.trim()) {
                                addItem.mutate({ checklistId: checklist.id, text: input.value.trim() });
                                input.value = '';
                              }
                            }}
                          >
                            <input
                              name="item"
                              placeholder="Add an item"
                              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                            />
                          </form>
                        )}
                      </div>
                    );
                  })}
                  {canEdit && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (checklistTitle.trim()) addChecklist.mutate(checklistTitle.trim());
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={checklistTitle}
                        onChange={(event) => setChecklistTitle(event.target.value)}
                        placeholder={COPY['card.checklist.add']}
                        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                      />
                      <button type="submit" className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 text-sm">
                        Add
                      </button>
                    </form>
                  )}
                </section>

                {data.attachments.length > 0 && (
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold">Attachments</h3>
                    <ul className="flex flex-col gap-2">
                      {data.attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
                        >
                          <Paperclip size={14} />
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-[var(--color-accent)] underline"
                          >
                            {attachment.name}
                          </a>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => setCover.mutate(attachment.id)}
                                title="Make cover"
                                className="rounded p-1 hover:bg-black/10"
                              >
                                <ImageIcon size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeAttachment.mutate(attachment.id)}
                                title="Remove"
                                className="rounded p-1 hover:bg-black/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Comments</h3>
                  {canComment && <CommentBox onSubmit={async (text) => {
                      await addComment.mutateAsync(text);
                    }} />}
                  <ul className="mt-4 flex flex-col gap-3">
                    {data.comments.map((comment) => (
                      <li key={comment.id} className="flex gap-2">
                        <Avatar
                          name={comment.user?.name ?? 'Someone'}
                          avatarUrl={comment.user?.avatarUrl}
                        />
                        <div className="min-w-0 flex-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-2">
                          <p className="mb-1 text-xs text-[var(--color-text-muted)]">
                            {comment.user?.name ?? 'Someone'} at{' '}
                            {new Date(comment.createdAt).toLocaleString()}
                          </p>
                          <Markdown>{comment.text}</Markdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {canEdit && (
                <aside className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-[var(--color-text-muted)]">Add to card</p>

                  <button
                    type="button"
                    onClick={() => setPanel(panel === 'labels' ? null : 'labels')}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-border)]"
                  >
                    <Tag size={14} /> Labels
                  </button>
                  {panel === 'labels' && (
                    <div className="mb-2 flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                      {labels.map((label) => {
                        const on = data.labels.some((item) => item.id === label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            onClick={() => toggleLabel.mutate({ labelId: label.id, on: !on })}
                            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-xs text-white"
                            style={{ background: label.color, opacity: on ? 1 : 0.55 }}
                          >
                            {on ? '✓' : ''} {label.name || label.color}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setPanel(panel === 'members' ? null : 'members')}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-border)]"
                  >
                    <User size={14} /> Members
                  </button>
                  {panel === 'members' && (
                    <div className="mb-2 flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                      {members.map((member) => {
                        const on = data.members.some((user) => user.id === member.userId);
                        return (
                          <button
                            key={member.userId}
                            type="button"
                            onClick={() => toggleMember.mutate({ userId: member.userId, on: !on })}
                            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left text-xs hover:bg-[var(--color-surface-2)]"
                          >
                            <Avatar name={member.user?.name ?? 'User'} size={20} />
                            <span className="truncate">{member.user?.name}</span>
                            {on && <span className="ml-auto">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-border)]">
                    <Clock size={14} /> {COPY['card.due.label']}
                    <input
                      type="datetime-local"
                      className="sr-only"
                      value={toLocalInput(card.dueAt)}
                      onChange={(event) =>
                        updateCard.mutate({
                          dueAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setPanel(panel === 'attachment' ? null : 'attachment')}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-border)]"
                  >
                    <Paperclip size={14} /> {COPY['card.attachment.add']}
                  </button>
                  {panel === 'attachment' && (
                    <div className="mb-2 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2">
                      <input
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadFile(file);
                        }}
                        className="text-xs"
                      />
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (linkUrl.trim()) addLink.mutate(linkUrl.trim());
                        }}
                        className="flex gap-1"
                      >
                        <input
                          value={linkUrl}
                          onChange={(event) => setLinkUrl(event.target.value)}
                          placeholder="https://"
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs outline-none"
                        />
                        <button type="submit" aria-label="Attach link" className="rounded p-1 hover:bg-black/10">
                          <Link2 size={14} />
                        </button>
                      </form>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => updateCard.mutate({ archived: !card.archived })}
                    className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm hover:bg-[var(--color-border)]"
                  >
                    <Archive size={14} /> {card.archived ? 'Unarchive' : 'Archive'}
                  </button>

                  <p className="mt-3 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                    <CheckSquare size={12} /> {card.checklistDone ?? 0}/{card.checklistTotal ?? 0} done
                  </p>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
