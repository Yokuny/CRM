import { connect, disconnect, hashToken, Invite, Session, Tenant, User } from '@crm/db';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { inviteRouter } from './invite.router.js';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/invites', inviteRouter);
  app.use(errorHandler);
  return app;
};

const future = (days = 7) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const past = (days = 1) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe('invite routes (public)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([Session.deleteMany({}), Invite.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  const seedTenant = async (name = 'Empresa Convite') =>
    Tenant.create({ name, document: `${Math.floor(Math.random() * 1e14)}`.padStart(14, '1'), status: 'provisioned' });

  const seedInvite = async (params: {
    tenant: string;
    token: string;
    status?: 'pending' | 'accepted' | 'revoked';
    expiresAt?: Date;
    email?: string;
  }) => {
    const invitedBy = await User.create({
      name: 'Root',
      email: `root-${params.token}@platform.com`,
      password: 'h',
      isPlatformAdmin: true,
      role: [],
    });
    return Invite.create({
      Tenant: params.tenant,
      email: params.email ?? 'convidado@empresa.com',
      role: 'admin',
      tokenHash: hashToken(params.token),
      status: params.status ?? 'pending',
      expiresAt: params.expiresAt ?? future(),
      invitedBy: invitedBy._id,
    });
  };

  describe('GET /invites/:token', () => {
    it('returns tenantName and email for a pending, non-expired token, without requiring authentication (FND-03/AC1)', async () => {
      const tenant = await seedTenant('Empresa Peek');
      await seedInvite({ tenant: tenant.id, token: 'token-valido', email: 'peek@empresa.com' });

      const res = await request(buildTestApp()).get('/invites/token-valido');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ tenantName: 'Empresa Peek', email: 'peek@empresa.com' });
    });

    it('responds 410 with a distinct message for an expired token, never echoing the e-mail (FND-03/AC3)', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'token-expirado', expiresAt: past(), email: 'segredo@empresa.com' });

      const res = await request(buildTestApp()).get('/invites/token-expirado');

      expect(res.status).toBe(410);
      expect(res.body.message).toMatch(/expir/i);
      expect(JSON.stringify(res.body)).not.toContain('segredo@empresa.com');
    });

    it('responds 410 with a distinct message for an already-accepted token, never echoing the e-mail (FND-03/AC3)', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'token-aceito', status: 'accepted', email: 'segredo2@empresa.com' });

      const res = await request(buildTestApp()).get('/invites/token-aceito');

      expect(res.status).toBe(410);
      expect(res.body.message).toMatch(/já foi utilizado/i);
      expect(JSON.stringify(res.body)).not.toContain('segredo2@empresa.com');
    });

    it('responds 410 with a distinct message for a nonexistent token (FND-03/AC3)', async () => {
      const res = await request(buildTestApp()).get('/invites/token-que-nunca-existiu');

      expect(res.status).toBe(410);
      expect(res.body.message).toMatch(/inválido/i);
    });

    it('uses 3 pairwise-distinct 410 messages across expired/accepted/nonexistent', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'exp-a', expiresAt: past() });
      await seedInvite({ tenant: tenant.id, token: 'acc-a', status: 'accepted', email: 'outro@empresa.com' });

      const app = buildTestApp();
      const expired = await request(app).get('/invites/exp-a');
      const accepted = await request(app).get('/invites/acc-a');
      const missing = await request(app).get('/invites/nao-existe');

      const messages = [expired.body.message, accepted.body.message, missing.body.message];
      expect(new Set(messages).size).toBe(3);
    });
  });

  describe('POST /invites/:token/accept', () => {
    it('creates the User with the invite role/tenant, marks the invite accepted, activates the tenant and opens a session (FND-03/AC2)', async () => {
      const tenant = await seedTenant('Empresa Aceite');
      await seedInvite({ tenant: tenant.id, token: 'aceitar-1', email: 'novo@empresa.com' });

      const res = await request(buildTestApp())
        .post('/invites/aceitar-1/accept')
        .send({ name: 'Fulano Novo', password: 'senhaSegura123' });

      expect(res.status).toBe(201);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie?.[0]).toMatch(/refreshToken=/);
      expect(setCookie?.[0]).toMatch(/HttpOnly/i);

      const user = await User.findOne({ email: 'novo@empresa.com' }).lean();
      expect(user).not.toBeNull();
      expect(user?.name).toBe('Fulano Novo');
      expect(user?.Tenant?.toString()).toBe(tenant.id);
      expect(user?.role).toEqual(['admin']);
      expect(user?.password).not.toBe('senhaSegura123');

      const invite = await Invite.findOne({ tokenHash: hashToken('aceitar-1') }).lean();
      expect(invite?.status).toBe('accepted');

      const reloadedTenant = await Tenant.findById(tenant.id).lean();
      expect(reloadedTenant?.status).toBe('active');

      const session = await Session.findOne({ user: user?._id }).lean();
      expect(session).not.toBeNull();
      expect(session?.Tenant?.toString()).toBe(tenant.id);
    });

    it('responds 400 and creates no user when the password is under 8 characters (FND-03/AC4)', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'senha-curta', email: 'curta@empresa.com' });

      const res = await request(buildTestApp())
        .post('/invites/senha-curta/accept')
        .send({ name: 'Fulano', password: '1234567' });

      expect(res.status).toBe(400);
      expect(await User.countDocuments({ email: 'curta@empresa.com' })).toBe(0);
    });

    it('responds 410 and creates no second user when the same token is reused after acceptance', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'reuso-1', email: 'reuso@empresa.com' });
      const app = buildTestApp();

      const first = await request(app)
        .post('/invites/reuso-1/accept')
        .send({ name: 'Primeiro', password: 'senhaSegura123' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/invites/reuso-1/accept')
        .send({ name: 'Segundo', password: 'outraSenha123' });
      expect(second.status).toBe(410);
      expect(await User.countDocuments({ email: 'reuso@empresa.com' })).toBe(1);
    });

    it('creates exactly one User when the same token is accepted concurrently — the loser gets 410 (FND-15)', async () => {
      const tenant = await seedTenant();
      await seedInvite({ tenant: tenant.id, token: 'corrida-1', email: 'corrida@empresa.com' });
      const app = buildTestApp();

      const [res1, res2] = await Promise.all([
        request(app).post('/invites/corrida-1/accept').send({ name: 'Corredor A', password: 'senhaSegura123' }),
        request(app).post('/invites/corrida-1/accept').send({ name: 'Corredor B', password: 'senhaSegura456' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 410]);
      expect(await User.countDocuments({ email: 'corrida@empresa.com' })).toBe(1);
      expect(await Session.countDocuments({})).toBe(1);
    });
  });
});
