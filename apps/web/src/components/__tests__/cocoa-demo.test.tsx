import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CocoaDemo } from '../cocoa-demo';
const api = vi.hoisted(() => ({ cocoa: vi.fn(), startCocoa: vi.fn(), previewCocoa: vi.fn() }));
vi.mock('@/lib/api', () => ({ trello: { demo: api } }));
vi.mock('@/lib/api-client', () => ({ ApiError: class extends Error {} }));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
it('starts a guided run without credentials and shows verified evidence and preview control', async () => {
  api.cocoa.mockResolvedValue({
    available: true,
    incidentReady: true,
    attemptsRemaining: 2,
    run: null,
  });
  api.startCocoa.mockResolvedValue({
    available: true,
    incidentReady: true,
    attemptsRemaining: 1,
    run: {
      id: 'one',
      status: 'verified',
      stage: 'verified',
      ticketCode: 'D1-1',
      cause: 'Null was treated as text.',
      summary: 'Preserve null.',
      patch: '[]',
      verification: { baselineFailed: true, fixedPassed: true },
      previewAvailable: true,
    },
  });
  render(<CocoaDemo />);
  fireEvent.click(await screen.findByRole('button', { name: 'Let Cocoa fix this' }));
  await screen.findByText('The fix passed verification. Try it below.');
  expect(api.startCocoa).toHaveBeenCalledOnce();
  expect(screen.getByText(/shared demo app has not been modified/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clear the sample card’s description' })).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('an unavailable runner offers no start button', async () => {
  api.cocoa.mockResolvedValue({
    available: false,
    incidentReady: false,
    attemptsRemaining: 2,
    run: null,
  });
  render(<CocoaDemo />);
  await screen.findByText(/Hosted demos are currently unavailable/);
  expect(screen.queryByRole('button', { name: 'Let Cocoa fix this' })).toBeNull();
});
it('shows an exhausted allowance without promising an unlimited retry', async () => {
  api.cocoa.mockResolvedValue({
    available: true,
    incidentReady: true,
    attemptsRemaining: 0,
    run: { status: 'failed', stage: 'failed', ticketCode: 'D1-1', error: 'Verification failed' },
  });
  render(<CocoaDemo />);
  await screen.findByText(/Your free attempts have been used/);
  expect(api.startCocoa).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Try Cocoa once more' })).toBeNull(),
  );
});

it('waits for the incident instead of inviting a premature start', async () => {
  api.cocoa.mockResolvedValue({
    available: true,
    incidentReady: false,
    attemptsRemaining: 2,
    run: null,
  });
  render(<CocoaDemo />);
  await screen.findByText(/Preparing your sample incident/);
  expect(screen.queryByRole('button', { name: 'Let Cocoa fix this' })).toBeNull();
});
