import { Logger } from '@nestjs/common';

import { sendToKoryo } from './koryo';

const KEY = 'kor_cap_test';

describe('sendToKoryo', () => {
  const fetchMock = jest.fn();
  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('posts the lead as JSON with the bearer key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ leadId: 'x', outcome: 'created' }), { status: 201 }));

    await sendToKoryo({ email: 'ada@acme.com', name: 'Ada' }, { key: KEY });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.koryo.app/capture');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@acme.com', name: 'Ada' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the configured URL', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    await sendToKoryo({ email: 'ada@acme.com' }, { key: KEY, url: 'http://koryo.test/capture' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://koryo.test/capture');
  });

  it('makes no call without a key', async () => {
    await sendToKoryo({ email: 'ada@acme.com' }, { key: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a 500', () => fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))],
    ['a 401', () => fetchMock.mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }))],
    ['a timeout', () => fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))],
    ['a network error', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
  ])('does not throw on %s, and never logs the key', async (_, arrange) => {
    arrange();
    await expect(sendToKoryo({ email: 'ada@acme.com' }, { key: KEY })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain(KEY);
  });
});
