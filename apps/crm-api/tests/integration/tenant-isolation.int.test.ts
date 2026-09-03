import type { FieldDef } from '@crm/contracts';
import { connect, disconnect, FieldTemplate, FieldTemplateVersion, Invite, Session, Tenant, User } from '@crm/db';
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
    await Promise.all([
      FieldTemplateVersion.deleteMany({}),
      FieldTemplate.deleteMany({}),
      Session.deleteMany({}),
      Invite.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
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

  // Campo opcional novo = mudança aditiva: o bump não pede plano de migração,
  // então cada tenant customiza o próprio template com uma única chamada.
  const NOTA_A: FieldDef = { fieldId: 'notaA', label: 'Nota do Tenant A', type: 'text', maxLength: 200 };
  const NOTA_B: FieldDef = { fieldId: 'notaB', label: 'Nota do Tenant B', type: 'text', maxLength: 200 };

  it('keeps each tenant customized customer field template private to its own session, by targetType+key and by id (FLD-09)', async () => {
    const app = buildApp();
    const platformCookie = await seedPlatformAdminCookie(app);

    const adminA = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant Field A',
      '77777777000177',
      'field-a@empresa-a.com',
      'Admin A',
    );
    const adminB = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant Field B',
      '88888888000188',
      'field-b@empresa-b.com',
      'Admin B',
    );

    const currentTemplate = (cookie: string) =>
      request(app)
        .get('/field-templates/current')
        .query({ targetType: 'customer', key: 'default' })
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

    const bump = (cookie: string, templateId: string, body: object) =>
      request(app)
        .post(`/field-templates/${templateId}/versions`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send(body);

    // Ponto de partida espelhado: os dois tenants nascem com o mesmo template
    // semeado na provisão, então toda diferença adiante vem exclusivamente da
    // customização de cada um — e nunca de vazamento.
    const seededA = await currentTemplate(adminA.cookie);
    const seededB = await currentTemplate(adminB.cookie);
    expect(seededA.status).toBe(200);
    expect(seededB.status).toBe(200);
    expect(seededA.body.data.fields.map((field: FieldDef) => field.fieldId)).toEqual(['status']);
    expect(seededB.body.data.fields.map((field: FieldDef) => field.fieldId)).toEqual(['status']);

    const templateAId = seededA.body.data.template.id as string;
    const templateBId = seededB.body.data.template.id as string;
    expect(templateAId).not.toBe(templateBId);

    const bumpA = await bump(adminA.cookie, templateAId, {
      expectedVersion: 1,
      fields: [...seededA.body.data.fields, NOTA_A],
    });
    const bumpB = await bump(adminB.cookie, templateBId, {
      expectedVersion: 1,
      fields: [...seededB.body.data.fields, NOTA_B],
    });
    expect(bumpA.status).toBe(200);
    expect(bumpB.status).toBe(200);

    const afterA = await currentTemplate(adminA.cookie);
    expect(afterA.body.data.template.id).toBe(templateAId);
    expect(afterA.body.data.template.currentVersion).toBe(2);
    expect(afterA.body.data.fields).toEqual([...seededA.body.data.fields, NOTA_A]);
    expect(afterA.body.data.fields).not.toContainEqual(NOTA_B);

    const afterB = await currentTemplate(adminB.cookie);
    expect(afterB.body.data.template.id).toBe(templateBId);
    expect(afterB.body.data.template.currentVersion).toBe(2);
    expect(afterB.body.data.fields).toEqual([...seededB.body.data.fields, NOTA_B]);
    expect(afterB.body.data.fields).not.toContainEqual(NOTA_A);

    // Ler/mutar pelo id do outro tenant também não vaza: o filtro do
    // repositório carrega o Tenant da sessão (AD-010), então o template de B
    // simplesmente não existe para A — 404, e a versão de B fica intacta.
    const crossBump = await bump(adminA.cookie, templateBId, {
      expectedVersion: 2,
      fields: [...seededB.body.data.fields, NOTA_A],
    });
    expect(crossBump.status).toBe(404);

    const templateB = await FieldTemplate.findById(templateBId).lean();
    expect(templateB?.currentVersion).toBe(2);
    expect(await FieldTemplateVersion.countDocuments({ template: templateBId })).toBe(2);
    expect(await FieldTemplate.countDocuments({ Tenant: adminA.tenantId })).toBe(1);
    expect(await FieldTemplate.countDocuments({ Tenant: adminB.tenantId })).toBe(1);
  });
});
