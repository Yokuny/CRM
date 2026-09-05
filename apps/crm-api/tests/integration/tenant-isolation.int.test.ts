import type { FieldDef } from '@crm/contracts';
import {
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  Invite,
  Process,
  Session,
  Tenant,
  User,
} from '@crm/db';
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

// `email` é opcional (default preserva os 5 call sites já existentes acima):
// signinRateLimit é por e-mail+IP (FND-14), então os testes do WEB-14 mais
// abaixo — que rodam DEPOIS desses 5 no mesmo processo/janela de 15min —
// precisam de um e-mail próprio para não estourar o mesmo orçamento de
// tentativas do 'root@platform.com'. `isPlatformAdmin` não depende de e-mail
// específico (authorization.middleware.ts só olha o boolean).
const seedPlatformAdminCookie = async (app: Express, email = 'root@platform.com'): Promise<string> => {
  const hashed = await bcrypt.hash('rootPassword123', 10);
  await User.create({
    name: 'Root Admin',
    email,
    password: hashed,
    isPlatformAdmin: true,
    role: [],
  });
  const res = await request(app)
    .post('/auth/signin')
    .set('User-Agent', DEVICE)
    .send({ email, password: 'rootPassword123' });
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
      Process.deleteMany({}),
      Customer.deleteMany({}),
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

  // CORE-05 (estende FND-09): mesma prova de espelhamento acima, agora sobre
  // Customer/Process (crm-core, feature 3) — dois tenants com registros de
  // mesmo nome/telefone, e nenhuma chamada (listagem OU mutação por id)
  // enxerga o registro do outro.
  const OBS_FIELD: FieldDef = { fieldId: 'obs', label: 'Observação', type: 'text', maxLength: 200 };
  const PROCESS_STAGES = ['aberto', 'concluido'];

  it("keeps each tenant's Customer/Process private to its own session, through listing, filtering and mutation by id (CORE-05)", async () => {
    const app = buildApp();
    const platformCookie = await seedPlatformAdminCookie(app);

    const adminA = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant Core A',
      '99999999000199',
      'core-a@empresa-a.com',
      'Admin A',
    );
    const adminB = await provisionAndAcceptAdmin(
      app,
      platformCookie,
      'Tenant Core B',
      '10101010000110',
      'core-b@empresa-b.com',
      'Admin B',
    );

    const createProcessTemplate = (cookie: string) =>
      request(app)
        .post('/field-templates')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          targetType: 'process',
          key: 'negociacao',
          name: 'Negociação',
          fields: [OBS_FIELD],
          stages: PROCESS_STAGES,
        });

    const createCustomer = (cookie: string) =>
      request(app)
        .post('/customers')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Cliente Espelhado', phone: '11955555555', values: { status: 'novo' } });

    const createProcess = (cookie: string, customerId: string) =>
      request(app)
        .post('/processes')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ templateKey: 'negociacao', customerId });

    const listCustomers = (cookie: string) =>
      request(app).get('/customers').set('Cookie', cookie).set('User-Agent', DEVICE);

    const listProcessesByCustomer = (cookie: string, customerId: string) =>
      request(app).get('/processes').query({ customerId }).set('Cookie', cookie).set('User-Agent', DEVICE);

    const patchStage = (cookie: string, processId: string) =>
      request(app)
        .patch(`/processes/${processId}/stage`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stage: 'concluido' });

    await createProcessTemplate(adminA.cookie);
    await createProcessTemplate(adminB.cookie);

    const customerA = await createCustomer(adminA.cookie);
    const customerB = await createCustomer(adminB.cookie);
    expect(customerA.status).toBe(201);
    expect(customerB.status).toBe(201);
    expect(customerA.body.data.id).not.toBe(customerB.body.data.id);

    const processA = await createProcess(adminA.cookie, customerA.body.data.id);
    const processB = await createProcess(adminB.cookie, customerB.body.data.id);
    expect(processA.status).toBe(201);
    expect(processB.status).toBe(201);

    // Listagem: cada sessão só enxerga o próprio Customer, mesmo com nome e
    // telefone espelhados no outro tenant.
    const listedA = await listCustomers(adminA.cookie);
    const listedB = await listCustomers(adminB.cookie);
    expect(listedA.body.data.total).toBe(1);
    expect(listedA.body.data.items[0].id).toBe(customerA.body.data.id);
    expect(listedB.body.data.total).toBe(1);
    expect(listedB.body.data.items[0].id).toBe(customerB.body.data.id);
    expect(await Customer.countDocuments({})).toBe(2);

    // Filtro por Customer (P2): pedir o histórico do Customer de A usando a
    // sessão de B devolve lista vazia — o filtro por Tenant da sessão nunca
    // casa com o customerId forjado/estrangeiro.
    const crossListProcesses = await listProcessesByCustomer(adminB.cookie, customerA.body.data.id);
    expect(crossListProcesses.status).toBe(200);
    expect(crossListProcesses.body.data.items).toEqual([]);
    const ownListProcesses = await listProcessesByCustomer(adminA.cookie, customerA.body.data.id);
    expect(ownListProcesses.body.data.items).toHaveLength(1);
    expect(await Process.countDocuments({})).toBe(2);

    // Mutar pelo id do outro tenant também não vaza (mesmo idioma do
    // crossBump de field-template acima): o Process de A é invisível para a
    // sessão de B — 404, e o stage de A fica intacto.
    const crossStage = await patchStage(adminB.cookie, processA.body.data.id);
    expect(crossStage.status).toBe(404);

    const processADoc = await Process.findById(processA.body.data.id).lean();
    expect(processADoc?.stage).toBe('aberto');
    expect(processADoc?.Tenant.toString()).toBe(adminA.tenantId);
  });

  // WEB-14: os 3 endpoints novos desta feature (crm-web-shell) seguem o mesmo
  // precedente que CORE-05 já fixou acima para Customer/Process — cada um,
  // chamado com a sessão do Tenant B contra um id/recurso do Tenant A, devolve
  // 404/vazio, nunca o dado do Tenant A.
  describe('cross-tenant isolation — crm-web-shell new endpoints (WEB-14)', () => {
    const setupTwoTenants = async (
      app: Express,
      platformCookie: string,
    ): Promise<{
      adminA: { tenantId: string; cookie: string };
      adminB: { tenantId: string; cookie: string };
    }> => {
      const adminA = await provisionAndAcceptAdmin(
        app,
        platformCookie,
        'Tenant Shell A',
        '12121212000112',
        'shell-a@empresa-a.com',
        'Admin A',
      );
      const adminB = await provisionAndAcceptAdmin(
        app,
        platformCookie,
        'Tenant Shell B',
        '13131313000113',
        'shell-b@empresa-b.com',
        'Admin B',
      );
      return { adminA, adminB };
    };

    it("GET /customers/:id responds 404 for tenant B against tenant A's customer id", async () => {
      const app = buildApp();
      const platformCookie = await seedPlatformAdminCookie(app, 'root-shell-get@platform.com');
      const { adminA, adminB } = await setupTwoTenants(app, platformCookie);
      const customerA = await request(app)
        .post('/customers')
        .set('Cookie', adminA.cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Cliente A', phone: '11955555555', values: { status: 'novo' } });

      const res = await request(app)
        .get(`/customers/${customerA.body.data.id}`)
        .set('Cookie', adminB.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it("PATCH /customers/:id responds 404 for tenant B against tenant A's customer id, leaving it untouched", async () => {
      const app = buildApp();
      const platformCookie = await seedPlatformAdminCookie(app, 'root-shell-patch@platform.com');
      const { adminA, adminB } = await setupTwoTenants(app, platformCookie);
      const customerA = await request(app)
        .post('/customers')
        .set('Cookie', adminA.cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Cliente A', phone: '11955555555', values: { status: 'novo' } });

      const res = await request(app)
        .patch(`/customers/${customerA.body.data.id}`)
        .set('Cookie', adminB.cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Nome Forjado' });

      expect(res.status).toBe(404);
      const persisted = await Customer.findById(customerA.body.data.id).lean();
      expect(persisted?.name).toBe('Cliente A');
    });

    it("GET /field-templates never lists tenant A's process templates for tenant B", async () => {
      const app = buildApp();
      const platformCookie = await seedPlatformAdminCookie(app, 'root-shell-templates@platform.com');
      const { adminA, adminB } = await setupTwoTenants(app, platformCookie);
      await request(app)
        .post('/field-templates')
        .set('Cookie', adminA.cookie)
        .set('User-Agent', DEVICE)
        .send({
          targetType: 'process',
          key: 'negociacao',
          name: 'Negociação A',
          fields: [OBS_FIELD],
          stages: PROCESS_STAGES,
        });

      const res = await request(app)
        .get('/field-templates')
        .query({ targetType: 'process' })
        .set('Cookie', adminB.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });

    // T25B (added 2026-09-05): mesmo precedente das 3 rotas acima, agora para
    // o endpoint adicionado depois delas (GET /field-templates/:id/versions/:version).
    it("GET /field-templates/:id/versions/:version responds 404 for tenant B against tenant A's template id", async () => {
      const app = buildApp();
      const platformCookie = await seedPlatformAdminCookie(app, 'root-shell-version@platform.com');
      const { adminA, adminB } = await setupTwoTenants(app, platformCookie);
      const templateA = await request(app)
        .post('/field-templates')
        .set('Cookie', adminA.cookie)
        .set('User-Agent', DEVICE)
        .send({
          targetType: 'process',
          key: 'negociacao',
          name: 'Negociação A',
          fields: [OBS_FIELD],
          stages: PROCESS_STAGES,
        });

      const res = await request(app)
        .get(`/field-templates/${templateA.body.data.id}/versions/1`)
        .set('Cookie', adminB.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });
  });
});
