import { createFieldTemplateSchema, type FieldDef } from '@crm/contracts';
import {
  AiSession,
  Appointment,
  AsaasEvent,
  AsaasIntegration,
  Board,
  Card,
  Channel,
  Conversation,
  Customer,
  connect,
  dateInDisplayTz,
  disconnect,
  encrypt,
  expandWindowsToSlots,
  FieldTemplate,
  FieldTemplateVersion,
  Invite,
  Message,
  Order,
  Payment,
  Process,
  Product,
  Professional,
  SchedulingSettings,
  Session,
  Space,
  Tenant,
  User,
  wallClockToUtc,
} from '@crm/db';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, validate } from '@crm/field-engine';
import bcrypt from 'bcrypt';
import { env } from '../src/config/env.config.js';

// Ferramenta de dev — popula um tenant de demonstração ("Studio Aurora
// Estética") com volume suficiente pra todas as telas do web aparecerem
// preenchidas: clientes, processos, catálogo, inbox, pedidos, kanban e agenda.
// Reexecutável: apaga TUDO do tenant demo (achado pelo `document`) e recria;
// nenhum outro tenant é tocado. Datas são relativas a "agora", então rodar de
// novo deixa agenda/inbox sempre atuais. PRNG com semente fixa: mesma massa
// de dados a cada execução (a menos das datas).
//
// Cuidados com os workers que rodam em paralelo (ai-gateway/crm-api):
// - mensagem de saída nunca nasce `queued`/`sending` (o outboxConsumer
//   dispararia de verdade pro WhatsApp);
// - nenhuma conversa com mais de 12 meses (o retentionPurge apagaria);
// - nenhuma AsaasIntegration, então o asaasReconcile nunca olha os
//   pagamentos `pending` daqui.

const TENANT_DOCUMENT = '42424242000142';
const TENANT_NAME = 'Studio Aurora Estética';
const PASSWORD = process.env.SEED_PASSWORD || 'aurora12345';
const BCRYPT_COST = 10;

const USERS = [
  { name: 'Ana Paula Ferreira', email: 'admin@aurora.example.com', role: 'admin' },
  { name: 'Marcos Vieira', email: 'gestor@aurora.example.com', role: 'gestor' },
  { name: 'Luana Costa', email: 'operador@aurora.example.com', role: 'operador' },
] as const;

// ---------------------------------------------------------------------------
// Aleatoriedade determinística e tempo
// ---------------------------------------------------------------------------

let prngState = 20260918;
const random = (): number => {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number): boolean => random() < probability;
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
const pickWeighted = <T>(entries: ReadonlyArray<readonly [T, number]>): T => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1]?.[0] as T;
};
const sample = <T>(list: readonly T[], count: number): T[] => {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy.slice(0, count);
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = new Date();
const ago = (ms: number): Date => new Date(now.getTime() - ms);
const later = (date: Date, ms: number): Date => new Date(date.getTime() + ms);
const minDate = (a: Date, b: Date): Date => (a.getTime() < b.getTime() ? a : b);
const today = dateInDisplayTz(now);
const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const weekdayOf = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const assertValid = (fields: FieldDef[], values: Record<string, unknown>, context: string): void => {
  const result = validate(fields, values);
  if (!result.valid) throw new Error(`${context}: valores inválidos ${JSON.stringify(result.errors)}`);
};

// ---------------------------------------------------------------------------
// Templates de campos
// ---------------------------------------------------------------------------

const CUSTOMER_FIELDS: FieldDef[] = [
  {
    fieldId: 'status',
    label: 'Status',
    type: 'status',
    required: true,
    options: [
      { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
      { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
      { key: 'vip', label: 'VIP', color: '#A855F7', order: 2 },
      { key: 'inativo', label: 'Inativo', color: '#94A3B8', order: 3 },
    ],
  },
  { fieldId: 'email', label: 'E-mail', type: 'text', maxLength: 120 },
  { fieldId: 'aniversario', label: 'Aniversário', type: 'date' },
  {
    fieldId: 'origem',
    label: 'Origem',
    type: 'select',
    options: [
      { key: 'instagram', label: 'Instagram' },
      { key: 'indicacao', label: 'Indicação' },
      { key: 'google', label: 'Google' },
      { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'passante', label: 'Passante' },
    ],
  },
  { fieldId: 'ultimaVisita', label: 'Última visita', type: 'datetime' },
];

const PROCEDURES = [
  { key: 'limpeza_pele', label: 'Limpeza de pele', price: 18000 },
  { key: 'peeling', label: 'Peeling químico', price: 32000 },
  { key: 'microagulhamento', label: 'Microagulhamento', price: 45000 },
  { key: 'drenagem', label: 'Drenagem linfática', price: 15000 },
  { key: 'massagem', label: 'Massagem relaxante', price: 16000 },
  { key: 'depilacao_laser', label: 'Depilação a laser', price: 28000 },
  { key: 'botox', label: 'Toxina botulínica', price: 120000 },
] as const;

const PROCESS_TEMPLATES = [
  {
    key: 'tratamento',
    name: 'Tratamento estético',
    stages: ['Avaliação', 'Orçamento enviado', 'Em tratamento', 'Manutenção', 'Concluído'],
    fields: [
      {
        fieldId: 'procedimento',
        label: 'Procedimento',
        type: 'select',
        required: true,
        options: PROCEDURES.map(({ key, label }) => ({ key, label })),
      },
      { fieldId: 'sessoes', label: 'Sessões', type: 'number', integer: true, min: 1, max: 20 },
      { fieldId: 'valor', label: 'Valor', type: 'currency', code: 'BRL', precision: 2 },
      { fieldId: 'inicio', label: 'Início', type: 'date' },
      { fieldId: 'observacoes', label: 'Observações', type: 'text', multiline: true, maxLength: 500 },
    ] satisfies FieldDef[],
  },
  {
    key: 'assinatura',
    name: 'Assinatura de produtos',
    stages: ['Proposta', 'Ativa', 'Pausada', 'Cancelada'],
    fields: [
      {
        fieldId: 'plano',
        label: 'Plano',
        type: 'select',
        required: true,
        options: [
          { key: 'mensal', label: 'Mensal' },
          { key: 'trimestral', label: 'Trimestral' },
          { key: 'anual', label: 'Anual' },
        ],
      },
      { fieldId: 'valorMensal', label: 'Valor mensal', type: 'currency', code: 'BRL', precision: 2 },
      { fieldId: 'renovacao', label: 'Renovação', type: 'date' },
      { fieldId: 'entregaEmCasa', label: 'Entrega em casa', type: 'boolean' },
    ] satisfies FieldDef[],
  },
] as const;

// ---------------------------------------------------------------------------
// Massa de dados "de catálogo"
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Ana',
  'Beatriz',
  'Camila',
  'Daniela',
  'Eduarda',
  'Fernanda',
  'Gabriela',
  'Helena',
  'Isabela',
  'Júlia',
  'Larissa',
  'Mariana',
  'Natália',
  'Olívia',
  'Paula',
  'Rafaela',
  'Sofia',
  'Tatiana',
  'Valentina',
  'Yasmin',
  'André',
  'Bruno',
  'Carlos',
  'Diego',
  'Eduardo',
  'Felipe',
  'Gustavo',
  'Henrique',
  'Igor',
  'João',
  'Lucas',
  'Mateus',
  'Nicolas',
  'Otávio',
  'Pedro',
  'Rodrigo',
  'Samuel',
  'Thiago',
  'Vinícius',
  'William',
] as const;
const LAST_NAMES = [
  'Almeida',
  'Barbosa',
  'Cardoso',
  'Carvalho',
  'Castro',
  'Costa',
  'Dias',
  'Fernandes',
  'Ferreira',
  'Gomes',
  'Lima',
  'Lopes',
  'Martins',
  'Melo',
  'Mendes',
  'Moreira',
  'Nascimento',
  'Oliveira',
  'Pereira',
  'Pinto',
  'Ribeiro',
  'Rocha',
  'Rodrigues',
  'Santos',
  'Silva',
  'Soares',
  'Souza',
  'Teixeira',
  'Vieira',
  'Xavier',
] as const;
const DDDS = ['11', '11', '11', '21', '31', '41', '48', '51', '61', '71', '81'] as const;

const PRODUCTS = [
  ['Sérum Vitamina C 30ml', 'Antioxidante com 10% de vitamina C pura.', 18990],
  ['Protetor Solar FPS 50 Toque Seco', 'Proteção UVA/UVB para uso diário.', 8990],
  ['Hidratante Facial Ácido Hialurônico', 'Hidratação intensa para todos os tipos de pele.', 12990],
  ['Gel de Limpeza Facial 150ml', 'Limpeza suave sem ressecar.', 6990],
  ['Água Micelar 200ml', 'Remove maquiagem e impurezas.', 5490],
  ['Máscara de Argila Verde', 'Controle de oleosidade.', 7490],
  ['Tônico Adstringente', 'Equilíbrio do pH da pele.', 5990],
  ['Creme Anti-idade Noturno', 'Retinol encapsulado 0,3%.', 21990],
  ['Óleo Corporal Amêndoas', 'Nutrição e maciez para o corpo.', 7990],
  ['Esfoliante Corporal Café', 'Renovação celular com grãos de café.', 6490],
  ['Kit Home Care Pele Oleosa', 'Gel de limpeza + tônico + hidratante.', 24990],
  ['Kit Home Care Pele Seca', 'Leite de limpeza + sérum + creme nutritivo.', 26990],
  ['Kit Pós-Procedimento', 'Cicatrizante + protetor + água termal.', 19990],
  ['Água Termal 150ml', 'Calmante e descongestionante.', 6990],
  ['Balm Labial Hidratante', 'Com manteiga de karité.', 2990],
  ['Creme para Área dos Olhos', 'Reduz olheiras e bolsas.', 14990],
  ['Sabonete Líquido Íntimo', 'pH balanceado.', 3990],
  ['Vela Aromática Lavanda', 'Para a sala de massagem em casa.', 5990],
  ['Óleo Essencial Eucalipto 10ml', 'Aromaterapia.', 3490],
  ['Máscara Facial de Tecido (5 un.)', 'Hidratação express.', 4990],
  ['Pincel de Aplicação de Máscara', 'Cerdas macias sintéticas.', 2490],
  ['Faixa de Cabelo Spa', 'Microfibra.', 2990],
  ['Vale-presente R$ 150', 'Válido para qualquer procedimento.', 15000],
  ['Vale-presente R$ 300', 'Válido para qualquer procedimento.', 30000],
  ['Pacote 5 Drenagens', 'Economize 15% no pacote.', 63750],
  ['Pacote 4 Limpezas de Pele', 'Uma por mês, economize 10%.', 64800],
  ['Protetor Solar com Cor FPS 60', 'Base e proteção em um só passo.', 11990],
  ['Sérum Niacinamida 10%', 'Controle de manchas e poros.', 13990],
  ['Creme Firmador Corporal', 'Com cafeína e centella.', 15990],
  ['Gel Redutor', 'Uso com massagem modeladora.', 12990],
  ['Kit Viagem Aurora', 'Miniaturas dos best-sellers.', 9990],
  ['Rolo de Quartzo Rosa', 'Massagem facial.', 8990],
] as const;

// Roteiros de conversa (entrada = cliente, saída = bot/operador).
type Line = readonly ['in' | 'out', string];
const CONVERSATION_SCRIPTS: ReadonlyArray<ReadonlyArray<Line>> = [
  [
    ['in', 'Oi! Queria saber o valor da limpeza de pele'],
    ['out', 'Olá! A limpeza de pele completa sai por R$ 180,00 e dura cerca de 1h30. Quer agendar?'],
    ['in', 'Quero sim, tem horário na quinta à tarde?'],
    ['out', 'Tenho às 14h e às 16h com a Juliana. Qual prefere?'],
    ['in', '16h fica ótimo'],
    ['out', 'Agendado! Quinta às 16h com a Juliana. Vou te mandar um lembrete um dia antes 😊'],
  ],
  [
    ['in', 'Bom dia, vocês têm o sérum de vitamina C?'],
    ['out', 'Bom dia! Temos sim, o Sérum Vitamina C 30ml por R$ 189,90. Quer que eu separe um pra você?'],
    ['in', 'Quero 2 unidades e um protetor solar'],
    ['out', 'Perfeito! Montei o pedido: 2x Sérum Vitamina C + 1x Protetor FPS 50. Total R$ 469,70. Posso confirmar?'],
    ['in', 'Pode confirmar'],
    ['out', 'Pedido enviado pra aprovação. Assim que aprovarmos te mando o PIX.'],
  ],
  [
    ['in', 'Preciso remarcar minha massagem de amanhã'],
    ['out', 'Claro! Pra qual dia você gostaria?'],
    ['in', 'Sábado de manhã, pode ser?'],
    ['out', 'Sábado às 10h com a Patrícia está livre. Confirmo a troca?'],
    ['in', 'Confirma, obrigada!'],
  ],
  [
    ['in', 'Olá, fiz o peeling semana passada e a pele está descascando, é normal?'],
    ['out', 'Oi! É normal sim, faz parte da renovação. Use o protetor solar e o hidratante que indicamos.'],
    ['in', 'Tá ardendo um pouco também'],
    ['out', 'Vou pedir pra Dra. Camila falar com você, um minuto.'],
    ['out', 'Oi, aqui é a Dra. Camila. Pode me mandar uma foto da região?'],
    ['in', 'Mando sim, só um instante'],
  ],
  [
    ['in', 'Quanto custa o pacote de drenagem?'],
    ['out', 'O pacote com 5 sessões sai por R$ 637,50 (15% de desconto). Aceitamos PIX.'],
    ['in', 'Consigo parcelar?'],
    ['out', 'No momento só PIX à vista, mas podemos dividir o pacote em dois de 2 e 3 sessões.'],
    ['in', 'Vou pensar e te aviso'],
  ],
  [
    ['in', 'Oi, vocês abrem feriado?'],
    ['out', 'Olá! Nos feriados abrimos das 9h às 13h. Quer marcar algo?'],
    ['in', 'Não, só queria saber mesmo. Obrigado!'],
    ['out', 'Por nada! Qualquer coisa é só chamar.'],
  ],
  [
    ['in', 'Quero comprar um vale-presente pra minha mãe'],
    ['out', 'Que legal! Temos vales de R$ 150 e R$ 300, válidos pra qualquer procedimento.'],
    ['in', 'O de 300, por favor. Dá pra entregar em casa?'],
    ['out', 'Enviamos por WhatsApp em PDF, e também temos a versão impressa pra retirar aqui.'],
    ['in', 'PDF está ótimo'],
    ['out', 'Pedido criado! Assim que o pagamento cair eu te mando o vale.'],
  ],
  [
    ['in', 'Boa tarde, a depilação a laser dói?'],
    ['out', 'Boa tarde! A sensação é de um leve beliscão, bem tolerável. Usamos resfriamento na ponteira.'],
    ['in', 'Quantas sessões preciso pra axila?'],
    ['out', 'Em média de 6 a 8 sessões, com intervalo de 30 dias.'],
    ['in', 'Pode agendar uma avaliação?'],
  ],
];

const REJECTION_REASONS = [
  'Produto sem estoque no momento.',
  'Cliente desistiu da compra.',
  'Endereço fora da área de entrega.',
  'Pedido duplicado.',
] as const;
const CANCEL_REASONS = [
  'Cliente pediu para remarcar.',
  'Imprevisto de saúde.',
  'Profissional indisponível.',
  'Conflito de agenda do cliente.',
] as const;
const APPOINTMENT_NOTES = [
  'Primeira sessão — levar exames.',
  'Pele sensível, evitar ácidos.',
  'Cliente prefere sala silenciosa.',
  'Retorno de avaliação.',
  'Chegar 10 minutos antes.',
] as const;

// Grade semanal por profissional: `[weekdays, [start, end][]]`.
const PROFESSIONALS = [
  {
    name: 'Dra. Camila Rocha',
    slotDurationMinutes: 30,
    active: true,
    grid: [
      [
        [1, 2, 3, 4, 5],
        [
          ['08:00', '12:00'],
          ['13:00', '17:00'],
        ],
      ],
    ],
  },
  {
    name: 'Juliana Martins',
    slotDurationMinutes: 60,
    active: true,
    grid: [
      [
        [1, 2, 3, 4, 5],
        [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
      ],
      [[6], [['09:00', '13:00']]],
    ],
  },
  {
    name: 'Rafael Souza',
    slotDurationMinutes: 45,
    active: true,
    grid: [
      [
        [1, 3, 5],
        [
          ['09:00', '12:00'],
          ['14:00', '18:30'],
        ],
      ],
    ],
  },
  {
    name: 'Patrícia Lima',
    slotDurationMinutes: 60,
    active: true,
    grid: [
      [
        [2, 3, 4, 5, 6],
        [
          ['10:00', '13:00'],
          ['14:00', '19:00'],
        ],
      ],
    ],
  },
  {
    name: 'Bruno Carvalho',
    slotDurationMinutes: 30,
    active: false,
    grid: [[[1, 2, 3, 4, 5], [['08:00', '12:00']]]],
  },
] as const;

const SPACES = [
  ['Sala 1 — Consultório', true],
  ['Sala 2 — Estética', true],
  ['Sala 3 — Massagem', true],
  ['Sala de Fisioterapia', true],
  ['Sala 5 (em reforma)', false],
] as const;

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const wipeDemoTenant = async (): Promise<void> => {
  const existing = await Tenant.findOne({ document: TENANT_DOCUMENT }).lean();
  if (!existing) return;
  const filter = { Tenant: existing._id };
  await Promise.all([
    AiSession.deleteMany(filter),
    Appointment.deleteMany(filter),
    AsaasEvent.deleteMany(filter),
    AsaasIntegration.deleteMany(filter),
    Board.deleteMany(filter),
    Card.deleteMany(filter),
    Channel.deleteMany(filter),
    Conversation.deleteMany(filter),
    Customer.deleteMany(filter),
    FieldTemplate.deleteMany(filter),
    FieldTemplateVersion.deleteMany(filter),
    Invite.deleteMany(filter),
    Message.deleteMany(filter),
    Order.deleteMany(filter),
    Payment.deleteMany(filter),
    Process.deleteMany(filter),
    Product.deleteMany(filter),
    Professional.deleteMany(filter),
    SchedulingSettings.deleteMany(filter),
    Session.deleteMany(filter),
    Space.deleteMany(filter),
    User.deleteMany(filter),
  ]);
  await Tenant.deleteOne({ _id: existing._id });
};

const run = async (): Promise<void> => {
  await connect(env.MONGODB_URI);
  await wipeDemoTenant();

  // Tenant + usuários -------------------------------------------------------
  const tenantCreatedAt = ago(400 * DAY);
  const [tenant] = await Tenant.insertMany([
    { name: TENANT_NAME, document: TENANT_DOCUMENT, status: 'active', createdAt: tenantCreatedAt, updatedAt: now },
  ]);
  if (!tenant) throw new Error('tenant não foi criado');
  const T = tenant._id;

  const hashedPassword = await bcrypt.hash(PASSWORD, BCRYPT_COST);
  const users = await User.insertMany(
    USERS.map((user) => ({
      ...user,
      role: [user.role],
      password: hashedPassword,
      Tenant: T,
      active: true,
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    })),
  );
  const userIds = users.map((user) => user._id);

  // Templates ---------------------------------------------------------------
  createFieldTemplateSchema.parse({
    targetType: 'customer',
    key: DEFAULT_CUSTOMER_TEMPLATE_KEY,
    name: 'Cliente',
    fields: CUSTOMER_FIELDS,
  });
  for (const template of PROCESS_TEMPLATES) {
    createFieldTemplateSchema.parse({
      targetType: 'process',
      key: template.key,
      name: template.name,
      fields: template.fields,
      stages: template.stages,
    });
  }

  const [customerTemplate, ...processTemplates] = await FieldTemplate.insertMany([
    {
      Tenant: T,
      targetType: 'customer',
      key: DEFAULT_CUSTOMER_TEMPLATE_KEY,
      name: 'Cliente',
      currentVersion: 1,
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    },
    ...PROCESS_TEMPLATES.map((template) => ({
      Tenant: T,
      targetType: 'process',
      key: template.key,
      name: template.name,
      currentVersion: 1,
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    })),
  ]);
  if (!customerTemplate) throw new Error('template de cliente não foi criado');
  await FieldTemplateVersion.insertMany([
    {
      Tenant: T,
      template: customerTemplate._id,
      targetType: 'customer',
      version: 1,
      fields: CUSTOMER_FIELDS,
      createdAt: tenantCreatedAt,
    },
    ...PROCESS_TEMPLATES.map((template, index) => ({
      Tenant: T,
      template: processTemplates[index]?._id,
      targetType: 'process',
      version: 1,
      fields: template.fields,
      stages: template.stages,
      createdAt: tenantCreatedAt,
    })),
  ]);

  // Clientes ----------------------------------------------------------------
  const namePairs = sample(
    FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`)),
    140,
  );
  const customerDocs = namePairs.map((name) => {
    const status = pickWeighted([
      ['novo', 25],
      ['ativo', 45],
      ['vip', 10],
      ['inativo', 20],
    ] as const);
    const [first, last] = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(' ') as [string, string];
    const createdAt = ago(between(1, 365) * DAY + between(0, 23) * HOUR);
    const values: Record<string, unknown> = {
      status,
      email: `${first}.${last}@example.com`,
      aniversario: `${between(1962, 2004)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
      origem: pick(['instagram', 'instagram', 'indicacao', 'google', 'whatsapp', 'passante']),
    };
    if (status === 'ativo' || status === 'vip') {
      values.ultimaVisita = minDate(ago(between(1, 60) * DAY), now).toISOString();
    }
    assertValid(CUSTOMER_FIELDS, values, `cliente ${name}`);
    return {
      Tenant: T,
      name,
      phone: `55${pick(DDDS)}9${between(10_000_000, 99_999_999)}`,
      document: chance(0.6) ? String(between(10_000_000_000, 99_999_999_999)) : undefined,
      template: customerTemplate._id,
      templateVersion: 1,
      values,
      createdAt,
      updatedAt: later(createdAt, between(0, 30) * DAY),
    };
  });
  const customers = await Customer.insertMany(
    customerDocs.map((doc) => ({ ...doc, updatedAt: minDate(doc.updatedAt, now) })),
  );
  const activeCustomers = customers.filter((customer) => (customer.values as { status: string }).status !== 'inativo');

  // Processos ---------------------------------------------------------------
  const processDocs = sample(activeCustomers, 90).map((customer) => {
    const isTreatment = chance(0.7);
    const template = isTreatment ? PROCESS_TEMPLATES[0] : PROCESS_TEMPLATES[1];
    const templateDoc = isTreatment ? processTemplates[0] : processTemplates[1];
    const createdAt = later(customer.createdAt, random() * (now.getTime() - customer.createdAt.getTime()));
    let values: Record<string, unknown>;
    if (isTreatment) {
      const procedure = pick(PROCEDURES);
      const sessions = between(1, 10);
      values = {
        procedimento: procedure.key,
        sessoes: sessions,
        valor: procedure.price * sessions,
        inicio: dateInDisplayTz(later(createdAt, between(1, 14) * DAY)),
      };
      if (chance(0.4)) values.observacoes = pick(APPOINTMENT_NOTES);
    } else {
      values = {
        plano: pick(['mensal', 'trimestral', 'anual']),
        valorMensal: pick([9990, 14990, 19990, 24990]),
        renovacao: dateInDisplayTz(later(createdAt, between(20, 360) * DAY)),
        entregaEmCasa: chance(0.5),
      };
    }
    assertValid(template.fields, values, `processo ${template.key}`);
    return {
      Tenant: T,
      customer: customer._id,
      template: templateDoc?._id,
      templateVersion: 1,
      stage: pick(template.stages),
      values,
      createdAt,
      updatedAt: minDate(later(createdAt, between(0, 20) * DAY), now),
    };
  });
  const processes = await Process.insertMany(processDocs);

  // Catálogo ----------------------------------------------------------------
  const products = await Product.insertMany(
    PRODUCTS.map(([name, description, price], index) => {
      const createdAt = ago(between(30, 380) * DAY);
      return {
        Tenant: T,
        name,
        description,
        sku: `AUR-${String(index + 1).padStart(3, '0')}`,
        price,
        stock: chance(0.1) ? 0 : between(3, 120),
        active: index < PRODUCTS.length - 3,
        createdAt,
        updatedAt: minDate(later(createdAt, between(0, 30) * DAY), now),
      };
    }),
  );
  const sellableProducts = products.filter((product) => product.active && product.stock > 0);

  // Canal + conversas + mensagens -------------------------------------------
  const [channel] = await Channel.insertMany([
    {
      Tenant: T,
      phoneNumberId: 'demo-aurora-000001',
      wabaId: 'demo-aurora-waba',
      displayPhoneNumber: '+55 11 4000-2026',
      accessTokenEnc: encrypt('demo-token-sem-validade', env.CHANNEL_ENC_KEY),
      status: 'active',
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    },
  ]);
  if (!channel) throw new Error('canal não foi criado');

  const conversationCustomers = sample(activeCustomers, 48);
  const conversationDocs: Array<Record<string, unknown>> = [];
  // Referências tipadas (o retorno do insertMany herda o tipo solto dos docs).
  const conversationRefs: Array<{
    _id: (typeof customers)[number]['_id'];
    Customer: (typeof customers)[number]['_id'];
  }> = [];
  const messageDocs: Array<Record<string, unknown>> = [];
  let wamidCounter = 0;

  conversationCustomers.forEach((customer, index) => {
    // Última atividade: 8 na última hora, 14 hoje, o resto nos últimos 60 dias.
    const lastAt =
      index < 8 ? ago(between(2, 55) * MINUTE) : index < 22 ? ago(between(1, 10) * HOUR) : ago(between(1, 60) * DAY);
    // Às vezes a conversa tem um assunto anterior — sempre um roteiro diferente.
    const [script, previous] = sample(CONVERSATION_SCRIPTS, 2) as [ReadonlyArray<Line>, ReadonlyArray<Line>];
    const lines = chance(0.3) ? [...previous, ...script] : [...script];
    const times: Date[] = [];
    let cursor = lastAt;
    for (let line = lines.length - 1; line >= 0; line--) {
      times[line] = cursor;
      cursor = new Date(cursor.getTime() - between(1, 25) * MINUTE);
    }
    const conversationId = new Conversation()._id;
    conversationRefs.push({ _id: conversationId, Customer: customer._id });
    const isHuman = index < 6 || chance(0.15);
    const recent = now.getTime() - lastAt.getTime() < 6 * HOUR;

    lines.forEach(([direction, text], line) => {
      const createdAt = times[line] as Date;
      const isLast = line === lines.length - 1;
      const status =
        direction === 'in'
          ? undefined
          : isLast && recent
            ? pick(['sent', 'delivered'] as const)
            : chance(0.04)
              ? 'failed'
              : 'read';
      messageDocs.push({
        Tenant: T,
        Conversation: conversationId,
        Channel: channel._id,
        Customer: customer._id,
        direction,
        type: 'text',
        status,
        text,
        wamid: status === 'failed' ? undefined : `wamid.DEMO${String(++wamidCounter).padStart(8, '0')}`,
        error: status === 'failed' ? 'Falha no envio (131047): janela de 24h expirada.' : undefined,
        createdAt,
        updatedAt: createdAt,
      });
    });

    const inboundTimes = lines.flatMap(([direction], line) => (direction === 'in' ? [times[line] as Date] : []));
    const lastInboundAt = inboundTimes[inboundTimes.length - 1];
    const lastLineIsInbound = lines[lines.length - 1]?.[0] === 'in';
    // Não lida = chegou mensagem do cliente depois da última atividade
    // registrada (isUnread: lastInboundAt > lastActivityAt).
    const unread = lastLineIsInbound && chance(0.7);
    const lastActivityAt = unread ? (times[lines.length - 2] ?? lastAt) : lastAt;

    conversationDocs.push({
      _id: conversationId,
      Tenant: T,
      Channel: channel._id,
      Customer: customer._id,
      mode: isHuman ? 'human' : 'bot',
      assignee: isHuman ? pick(userIds) : undefined,
      lastInboundAt,
      windowExpiresAt: lastInboundAt ? later(lastInboundAt, DAY) : undefined,
      lastActivityAt,
      createdAt: times[0],
      updatedAt: lastAt,
    });
  });
  await Conversation.insertMany(conversationDocs);
  await Message.insertMany(messageDocs);
  const conversations = conversationRefs;

  // Pedidos + pagamentos ----------------------------------------------------
  const orderStatuses = [
    ...Array<'pending_approval'>(14).fill('pending_approval'),
    ...Array<'confirmed'>(26).fill('confirmed'),
    ...Array<'rejected'>(9).fill('rejected'),
    ...Array<'payment_expired'>(6).fill('payment_expired'),
  ];
  const orderDocs = orderStatuses.map((status, index) => {
    const conversation = pick(conversations);
    const items = sample(sellableProducts, between(1, 4)).map((product) => ({
      product: product._id,
      name: product.name,
      unitPrice: product.price,
      quantity: between(1, 3),
    }));
    const createdAt = status === 'pending_approval' ? ago(between(5, 72 * 60) * MINUTE) : ago(between(1, 90) * DAY);
    const approver = pick(userIds.slice(0, 2));
    const approvedAt = later(createdAt, between(10, 180) * MINUTE);
    return {
      Tenant: T,
      conversation: conversation._id,
      customer: conversation.Customer,
      items,
      totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      status,
      idempotencyKey: `seed-${index + 1}`,
      customerConfirmed: status !== 'pending_approval' || chance(0.7),
      operatorApproved: status === 'confirmed' || status === 'payment_expired',
      ...(status === 'confirmed' || status === 'payment_expired' ? { approvedBy: approver, approvedAt } : {}),
      ...(status === 'rejected'
        ? { rejectedBy: approver, rejectedAt: approvedAt, rejectionReason: pick(REJECTION_REASONS) }
        : {}),
      createdAt,
      updatedAt: status === 'pending_approval' ? createdAt : approvedAt,
    };
  });
  const orders = await Order.insertMany(orderDocs);

  const payableOrders = orders.filter((order) => order.status === 'confirmed' || order.status === 'payment_expired');
  await Payment.insertMany(
    payableOrders.map((order, index) => {
      const status = order.status === 'payment_expired' ? 'expired' : chance(0.8) ? 'paid' : 'pending';
      const createdAt = order.approvedAt ?? order.createdAt;
      return {
        Tenant: T,
        order: order._id,
        asaasChargeId: `pay_demo_${String(index + 1).padStart(6, '0')}`,
        asaasCustomerId: `cus_demo_${order.customer.toString().slice(-8)}`,
        billingType: 'PIX',
        value: order.totalPrice,
        status,
        asaasStatus: status === 'paid' ? 'RECEIVED' : status === 'expired' ? 'OVERDUE' : 'PENDING',
        // Copia-e-cola fictício (não é um BR Code válido) só pra cobrança
        // aberta — é o que a tela de detalhe do pedido oferece pra copiar.
        pixPayload: status === 'pending' ? `00020126DEMO.PIX.AURORA${String(index + 1).padStart(6, '0')}` : undefined,
        pixExpirationDate: later(createdAt, DAY),
        createdAt,
        updatedAt: minDate(later(createdAt, between(5, 600) * MINUTE), now),
      };
    }),
  );

  // Kanban ------------------------------------------------------------------
  const BOARDS = [
    {
      name: 'Pós-venda',
      description: 'Acompanhamento das clientes depois do atendimento.',
      columns: [
        ['Contato inicial', '#3B82F6'],
        ['Aguardando retorno', '#F59E0B'],
        ['Reagendado', '#8B5CF6'],
        ['Concluído', '#22C55E'],
      ],
    },
    {
      name: 'Separação de pedidos',
      description: 'Do pedido confirmado até a entrega.',
      columns: [
        ['A separar', '#EF4444'],
        ['Embalando', '#F59E0B'],
        ['Enviado', '#3B82F6'],
        ['Entregue', '#22C55E'],
      ],
    },
    {
      name: 'Marketing',
      description: 'Campanhas e conteúdo para as redes.',
      columns: [
        ['Ideias', '#94A3B8'],
        ['Em produção', '#F59E0B'],
        ['Agendado', '#8B5CF6'],
        ['Publicado', '#22C55E'],
      ],
    },
  ] as const;
  await Board.insertMany(
    BOARDS.map((board) => {
      const createdAt = ago(between(60, 200) * DAY);
      return {
        Tenant: T,
        name: board.name,
        description: board.description,
        columns: board.columns.map(([label, color], order) => ({ label, color, order })),
        createdAt,
        updatedAt: ago(between(0, 3) * DAY),
      };
    }),
  );

  // Relido do banco: só assim as colunas vêm com o `_id` gerado (e tipado).
  const boards = await Board.find({ Tenant: T }).lean();
  const boardNamed = (name: string) => {
    const board = boards.find((candidate) => candidate.name === name);
    if (!board) throw new Error(`quadro ${name} não foi criado`);
    return board;
  };
  const afterSales = boardNamed('Pós-venda');
  const picking = boardNamed('Separação de pedidos');
  const marketing = boardNamed('Marketing');

  const positions = new Map<string, number>();
  const nextPosition = (columnId: string): number => {
    const position = positions.get(columnId) ?? 0;
    positions.set(columnId, position + 1);
    return position;
  };
  const cardDocs: Array<Record<string, unknown>> = [];

  for (const process of sample(processes, 18)) {
    const column = pick(afterSales.columns);
    const customer = customers.find((candidate) => candidate._id.equals(process.customer));
    const createdAt = ago(between(0, 40) * DAY + between(0, 23) * HOUR);
    cardDocs.push({
      Tenant: T,
      board: afterSales._id,
      column: column._id,
      title: `Retorno — ${customer?.name ?? 'cliente'}`,
      description: `Ligar para saber como foi o procedimento (${process.stage}).`,
      position: nextPosition(column._id.toString()),
      customer: process.customer,
      process: process._id,
      assignee: chance(0.7) ? pick(userIds) : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  }
  for (const order of orders.filter((candidate) => candidate.status === 'confirmed').slice(0, 16)) {
    const column = pick(picking.columns);
    const createdAt = order.approvedAt ?? order.createdAt;
    cardDocs.push({
      Tenant: T,
      board: picking._id,
      column: column._id,
      title: `Pedido de ${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}`,
      description: order.items.map((item) => `${item.quantity}x ${item.name}`).join('\n'),
      position: nextPosition(column._id.toString()),
      customer: order.customer,
      order: order._id,
      assignee: pick(userIds),
      createdAt,
      updatedAt: createdAt,
    });
  }
  const MARKETING_CARDS = [
    'Post: antes e depois do microagulhamento',
    'Reels: rotina de skincare noturna',
    'Campanha Dia das Mães — vale-presente',
    'E-mail: clientes inativas há 90 dias',
    'Parceria com academia do bairro',
    'Stories: bastidores da sala de massagem',
    'Sorteio de 1 limpeza de pele',
    'Guia: protetor solar no inverno',
    'Depoimentos de clientes VIP',
    'Black Friday: kits com 20% off',
    'Live com a Dra. Camila sobre manchas',
    'Calendário de conteúdo do próximo mês',
  ];
  for (const title of MARKETING_CARDS) {
    const column = pick(marketing.columns);
    const createdAt = ago(between(0, 45) * DAY);
    cardDocs.push({
      Tenant: T,
      board: marketing._id,
      column: column._id,
      title,
      position: nextPosition(column._id.toString()),
      assignee: chance(0.6) ? pick(userIds) : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  }
  await Card.insertMany(cardDocs);

  // Agenda ------------------------------------------------------------------
  await SchedulingSettings.insertMany([
    { Tenant: T, maxSlotsPerResponse: 12, createdAt: tenantCreatedAt, updatedAt: tenantCreatedAt },
  ]);
  const spaces = await Space.insertMany(
    SPACES.map(([name, active]) => ({
      Tenant: T,
      name,
      active,
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    })),
  );
  const activeSpaces = spaces.filter((space) => space.active);
  const professionals = await Professional.insertMany(
    PROFESSIONALS.map((professional) => ({
      Tenant: T,
      name: professional.name,
      slotDurationMinutes: professional.slotDurationMinutes,
      active: professional.active,
      weeklySchedule: professional.grid.flatMap(([weekdays, windows]) =>
        weekdays.flatMap((weekday) => windows.map(([start, end]) => ({ weekday, start, end }))),
      ),
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    })),
  );

  const RANGE_START = addDays(today, -35);
  const RANGE_END = addDays(today, 45);
  const appointmentDocs: Array<Record<string, unknown>> = [];

  // Bloqueios primeiro — os horários que caem neles ficam sem agendamento.
  const blockDocs: Array<{ professional: (typeof professionals)[number]; start: Date; end: Date; title: string }> = [];
  const [camila, juliana, rafael, patricia] = professionals;
  if (!camila || !juliana || !rafael || !patricia) throw new Error('profissionais não foram criados');
  const nextMonday = addDays(today, ((8 - weekdayOf(today)) % 7) + 7);
  blockDocs.push({
    professional: juliana,
    start: wallClockToUtc(addDays(nextMonday, 2), '00:00'),
    end: wallClockToUtc(addDays(nextMonday, 4), '23:59'),
    title: 'Férias',
  });
  blockDocs.push({
    professional: camila,
    start: wallClockToUtc(addDays(today, -12), '00:00'),
    end: wallClockToUtc(addDays(today, -11), '23:59'),
    title: 'Congresso de dermatologia',
  });
  for (let date = RANGE_START; date <= RANGE_END; date = addDays(date, 1)) {
    if (weekdayOf(date) === 3) {
      blockDocs.push({
        professional: rafael,
        start: wallClockToUtc(date, '09:00'),
        end: wallClockToUtc(date, '10:30'),
        title: 'Reunião de equipe',
      });
    }
  }
  blockDocs.push({
    professional: patricia,
    start: wallClockToUtc(addDays(today, 3), '14:00'),
    end: wallClockToUtc(addDays(today, 3), '17:00'),
    title: 'Manutenção da maca',
  });
  for (const block of blockDocs) {
    const createdAt = minDate(new Date(block.start.getTime() - between(3, 20) * DAY), now);
    appointmentDocs.push({
      Tenant: T,
      kind: 'block',
      professional: block.professional._id,
      title: block.title,
      start: block.start,
      end: block.end,
      status: 'confirmed',
      source: 'operator',
      createdAt,
      updatedAt: createdAt,
    });
  }

  const conversationByCustomer = new Map(
    conversations.map((conversation) => [conversation.Customer.toString(), conversation]),
  );
  for (const professional of professionals.filter((candidate) => candidate.active)) {
    for (let date = RANGE_START; date <= RANGE_END; date = addDays(date, 1)) {
      const slots = expandWindowsToSlots(professional.weeklySchedule, professional.slotDurationMinutes, date);
      for (const slot of slots) {
        const blocked = blockDocs.some(
          (block) =>
            block.professional._id.equals(professional._id) && slot.start < block.end && block.start < slot.end,
        );
        if (blocked) continue;

        const isPast = slot.end.getTime() < now.getTime();
        const daysAhead = (slot.start.getTime() - now.getTime()) / DAY;
        const occupancy = isPast ? 0.5 : daysAhead < 14 ? 0.45 : 0.2;
        if (!chance(occupancy)) continue;

        const customer = pick(activeCustomers);
        const recentPast = isPast && now.getTime() - slot.end.getTime() < 3 * DAY;
        const status = isPast
          ? recentPast && chance(0.3)
            ? pick(['pending', 'confirmed'] as const)
            : pickWeighted([
                ['completed', 78],
                ['no_show', 9],
                ['canceled_by_customer', 8],
                ['canceled_by_operator', 5],
              ] as const)
          : pickWeighted([
              ['confirmed', 45],
              ['pending', 45],
              ['canceled_by_customer', 7],
              ['canceled_by_operator', 3],
            ] as const);
        const conversation = conversationByCustomer.get(customer._id.toString());
        const source = conversation && chance(0.6) ? 'ai' : 'operator';
        const createdAt = minDate(new Date(slot.start.getTime() - between(1, 20) * DAY), now);
        const operator = pick(userIds);
        const isCanceled = status === 'canceled_by_customer' || status === 'canceled_by_operator';
        const attendanceMarked = status === 'completed' || status === 'no_show';
        const canceledAt = minDate(later(createdAt, between(1, 48) * HOUR), now);

        appointmentDocs.push({
          Tenant: T,
          kind: 'appointment',
          professional: professional._id,
          space: chance(0.75) ? pick(activeSpaces)._id : undefined,
          customer: customer._id,
          conversation: source === 'ai' ? conversation?._id : undefined,
          notes: chance(0.15) ? pick(APPOINTMENT_NOTES) : undefined,
          start: slot.start,
          end: slot.end,
          status,
          source,
          ...(status === 'confirmed' ? { confirmedAt: minDate(later(createdAt, between(1, 24) * HOUR), now) } : {}),
          ...(isCanceled
            ? {
                canceledAt,
                cancelReason: pick(CANCEL_REASONS),
                ...(status === 'canceled_by_operator' ? { canceledBy: operator } : {}),
              }
            : {}),
          ...(attendanceMarked
            ? { attendanceMarkedAt: later(slot.end, between(5, 120) * MINUTE), attendanceMarkedBy: operator }
            : {}),
          createdAt,
          updatedAt: attendanceMarked ? later(slot.end, between(5, 120) * MINUTE) : isCanceled ? canceledAt : createdAt,
        });
      }
    }
  }
  await Appointment.insertMany(appointmentDocs);

  console.log(
    JSON.stringify({
      event: 'seed.demo.done',
      tenant: TENANT_NAME,
      logins: USERS.map((user) => user.email),
      password: PASSWORD,
      counts: {
        customers: customers.length,
        processes: processes.length,
        products: products.length,
        conversations: conversations.length,
        messages: messageDocs.length,
        orders: orders.length,
        payments: payableOrders.length,
        boards: boards.length,
        cards: cardDocs.length,
        professionals: professionals.length,
        spaces: spaces.length,
        appointments: appointmentDocs.length,
      },
    }),
  );
  await disconnect();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnect();
  process.exit(1);
});
