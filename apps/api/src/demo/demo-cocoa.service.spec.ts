import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DemoCocoaService } from './demo-cocoa.service';
describe('Cocoa demo proxy', () => {
  const fetcher = jest.fn();
  const original = global.fetch;
  beforeEach(() => {
    fetcher.mockReset();
    global.fetch = fetcher;
  });
  afterAll(() => {
    global.fetch = original;
  });
  function service(expiresAt = new Date(Date.now() + 60000)) {
    const findUnique = jest.fn().mockResolvedValue({ subzeroProjectKey: 'DOWNED', expiresAt });
    const config = new ConfigService({
      DEMO_PROVISION_SECRET: 's'.repeat(32),
      SUBZERO_DEMO_PROVISION_URL: 'https://api.example.test/demo/provision',
    });
    return {
      proxy: new DemoCocoaService(
        { demoTenant: { findUnique } } as unknown as PrismaService,
        config,
      ),
      findUnique,
    };
  }
  it('derives the remote project from the authenticated user and keeps the secret server-side', async () => {
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, attemptsRemaining: 2, run: null }),
    });
    const { proxy, findUnique } = service();
    const result = await proxy.request('local-user', 'start');
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'local-user' } });
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/demo/cocoa/DOWNED/start');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(JSON.stringify(result)).not.toContain('s'.repeat(32));
  });
  it('rejects expired demos before any remote request', async () => {
    await expect(service(new Date(0)).proxy.request('expired', 'status')).rejects.toThrow(
      'expired',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
