import { connect, disconnect, Invite, Session, Tenant, User } from '@crm/db';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

const DEVICE = 'isolation-agent';

// Extrai o token opaco do e-mail "enviado" pelo MailProvider `log` (o único
// habilitado em ambiente de teste) — nunca lido do banco, que só guarda o
// hash (design.md: "o token nunca é gravado").
const extractInviteToken = (logSpy: ReturnType<typeof vi.spyOn>): string => {
  const call = logSpy.mock.calls.find((args) => {
    try {
      return JSON.parse(args[0] as string).event === 'mail.log_send';
    } catch {
      return false;
    }
  });
  if (!call) throw new Error('mail.log_send não foi chamado');
  const { body } = JSON.parse(call[0] as string) as { body: string };
  const match = body.match(/token=([0-9a-f]+)/);
  if (!match) throw new Error('token não encontrado no corpo do e-mail');
  return match[1];
};

const seedPlatformAdminCookie = async (app: Express): Promise<string> => {
  const hashed = await bcrypt.hash('rootPassword123', 10);
  await User.create({
    name: 'Root Admin',
    email: 'root@platform.com',
    password: hashed,
    isPlatformAdmin: true,
    role: [],
  });
  const res = await request(app)
    .post('/auth/signin')
    .set('User-Agent', DEVICE)
    .send({ email: 'root@platform.com', password: 'rootPassword123' });
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
};

const provisionAndInvite = async (
  app: Express,
  platformCookie: string,
  tenantName: string,
  document: string,
  email: string,
): Promise<{ tenantId: string; token: string }> => {
  const provisionRes = await request(app)
    .post('/platform/tenants')
    .set('Cookie', platformCookie)
    .set('User-Agent', DEVICE)
    .send({ name: tenantName, document });
  const tenantId = provisionRes.body.data.id as string;

  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await request(app)
    .post(`/platform/tenants/${tenantId}/invites`)
    .set('Cookie', platformCookie)
    .set('User-Agent', DEVICE)
    .send({ email, role: 'admin' });
  const token = extractInviteToken(logSpy);
  logSpy.mockRestore();

  return { tenantId, token };
};

const acceptInvite = async (app: Express, token: string, name: string): Promise<string> => {
  const res = await request(app)
    .post(`/invites/${token}/accept`)
    .set('User-Agent', DEVICE)
    .send({ name, password: 'senhaSegura123' });
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
};

const provisionAndAcceptAdmin = async (
  app: Express,
  platformCookie: string,
  tenantName: string,
  document: string,
  email: string,
  name: string,
): Promise<{ tenantId: string; cookie: string }> => {
  const { tenantId, token } = await provisionAndInvite(app, platformCookie, tenantName, document, email);
  const cookie = await acceptInvite(app, token, name);
  return { tenantId, cookie };
};

describe('cross-tenant isolation (FND-07, FND-09)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([Session.deleteMany({}), Invite.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('never returns Tenant B data on a session authenticated in Tenant A, across platform/invite/auth routes (FND-09)', async () => {
    const app = buildApp();
    const platformCookie = await seedPlatformAdminCookie(app);

    const adminA = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant A',
      '11111111000101',
      'admin-a@empresa-a.com',
      'Admin A',
    );
    const adminB = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant B',
      '22222222000102',
      'admin-b@empresa-b.com',
      'Admin B',
    );

    const sessionA = await request(app).get('/auth/session').set('Cookie', adminA.cookie).set('User-Agent', DEVICE);
    expect(sessionA.status).toBe(200);
    expect(sessionA.body.data.tenant.id).toBe(adminA.tenantId);
    expect(sessionA.body.data.tenant.name).toBe('Tenant A');
    expect(sessionA.body.data.tenant.id).not.toBe(adminB.tenantId);
    expect(sessionA.body.data.user.email).toBe('admin-a@empresa-a.com');

    const sessionB = await request(app).get('/auth/session').set('Cookie', adminB.cookie).set('User-Agent', DEVICE);
    expect(sessionB.status).toBe(200);
    expect(sessionB.body.data.tenant.id).toBe(adminB.tenantId);
    expect(sessionB.body.data.tenant.name).toBe('Tenant B');
    expect(sessionB.body.data.tenant.id).not.toBe(adminA.tenantId);
    expect(sessionB.body.data.user.email).toBe('admin-b@empresa-b.com');

    expect(await Invite.countDocuments({ Tenant: adminA.tenantId })).toBe(1);
    expect(await Invite.countDocuments({ Tenant: adminB.tenantId })).toBe(1);

    const userA = await User.findOne({ email: 'admin-a@empresa-a.com' }).lean();
    const userB = await User.findOne({ email: 'admin-b@empresa-b.com' }).lean();
    expect(userA?.Tenant?.toString()).toBe(adminA.tenantId);
    expect(userA?.Tenant?.toString()).not.toBe(adminB.tenantId);
    expect(userB?.Tenant?.toString()).toBe(adminB.tenantId);
    expect(userB?.Tenant?.toString()).not.toBe(adminA.tenantId);
  });

  it("GET /invites/:token always returns the invite's own tenant name, never the other mirrored tenant's", async () => {
    const app = buildApp();
    const platformCookie = await seedPlatformAdminCookie(app);

    const inviteA = await provisionAndInvite(
      app,
      platformCookie,
      'Tenant Peek A',
      '33333333000133',
      'peek-a@empresa-a.com',
    );
    const inviteB = await provisionAndInvite(
      app,
      platformCookie,
      'Tenant Peek B',
      '44444444000144',
      'peek-b@empresa-b.com',
    );

    const peekA = await request(app).get(`/invites/${inviteA.token}`);
    expect(peekA.body.data).toEqual({ tenantName: 'Tenant Peek A', email: 'peek-a@empresa-a.com' });

    const peekB = await request(app).get(`/invites/${inviteB.token}`);
    expect(peekB.body.data).toEqual({ tenantName: 'Tenant Peek B', email: 'peek-b@empresa-b.com' });
  });

  // Nenhuma rota deste batch tem um tenant de SESSÃO usado para escrita (a
  // única sessão sem tenant é a de isPlatformAdmin, que provisiona por :id de
  // URL). Toda entrada Zod é `.strict()` (T6/AD-010), então um campo forjado
  // de TENANT_FORBIDDEN_KEYS nunca chega a ser considerado — a requisição
  // inteira é rejeitada antes do controller, o que é uma garantia MAIS forte
  // que "ignorado silenciosamente": o valor forjado tem efeito zero sobre
  // qual tenant acaba sendo usado, para o Tenant A (da URL) e para o B
  // (forjado no body).
  it('rejects a request body carrying a forged tenantId, with zero effect on which tenant ends up written (FND-07)', async () => {
    const app = buildApp();
    const platformCookie = await seedPlatformAdminCookie(app);

    const tenantA = await request(app)
      .post('/platform/tenants')
      .set('Cookie', platformCookie)
      .set('User-Agent', DEVICE)
      .send({ name: 'Tenant Forge A', document: '55555555000155' });
    const tenantB = await request(app)
      .post('/platform/tenants')
      .set('Cookie', platformCookie)
      .set('User-Agent', DEVICE)
      .send({ name: 'Tenant Forge B', document: '66666666000166' });
    const tenantAId = tenantA.body.data.id as string;
    const tenantBId = tenantB.body.data.id as string;

    const res = await request(app)
      .post(`/platform/tenants/${tenantAId}/invites`)
      .set('Cookie', platformCookie)
      .set('User-Agent', DEVICE)
      .send({ email: 'forjado@empresa.com', role: 'admin', tenantId: tenantBId });

    expect(res.status).toBe(400);
    expect(await Invite.countDocuments({ email: 'forjado@empresa.com' })).toBe(0);
    expect(await Invite.countDocuments({ Tenant: tenantAId })).toBe(0);
    expect(await Invite.countDocuments({ Tenant: tenantBId })).toBe(0);
  });
});
