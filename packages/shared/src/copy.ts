/** Locked copy strings. Spec section 8.4. These are exact and final. */
export const COPY = {
  'board.addList': 'Add another list',
  'board.addList.placeholder': 'Enter list title',
  'list.addCard': 'Add a card',
  'list.addCard.placeholder': 'Enter a title for this card',
  'card.description.placeholder': 'Add a more detailed description',
  'card.comment.placeholder': 'Write a comment',
  'card.due.label': 'Due date',
  'card.checklist.add': 'Add checklist',
  'card.attachment.add': 'Attach a file or link',
  'card.archived': 'This card is archived.',
  'board.members.invite': 'Invite',
  'board.visibility.private': 'Private',
  'board.visibility.workspace': 'Workspace',
  'board.visibility.public': 'Public',
  'activity.empty': 'No activity yet.',
  'search.placeholder': 'Search cards on this board',
  'search.empty': 'No cards match your filters.',
  'notifications.empty': 'You have no notifications.',
  'auth.register.cta': 'Sign up',
  'auth.login.cta': 'Log in',
  'error.generic': 'Something went wrong. Try again.',
  'board.presence.viewing': 'Viewing now',
} as const;

export type CopyKey = keyof typeof COPY;
