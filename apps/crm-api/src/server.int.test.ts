import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

vi.mock('@crm/db', () => ({
  connect: vi.fn().mockRejectedValue(new Error('Mongo indisponível')),
  syncIndexes: vi.fn(),
}));

describe('buildApp', () => {
  it('is testable via supertest without opening a port, and GET /health responds 200 with {success:true, data:{...}}', async () => {
    const app = buildApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { service: 'crm-api' }, message: '' });
  });
});

describe('start', () => {
  it('exits the process with code 1 and logs explicitly when Mongo is unavailable at boot (FND-18)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { start } = await import('./server.js');
    await start();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('server.boot_failed');
    expect(logged.message).toContain('Mongo indisponível');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
