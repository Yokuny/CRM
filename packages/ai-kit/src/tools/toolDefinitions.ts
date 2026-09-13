// Definições das tools enviadas ao modelo (JSON Schema literal, não derivado
// de Zod — mesma forma de assistant-tools.ts, DentalEase-BackEnd). AD-004:
// superfície fixa e idêntica entre tenants — as 4 tools originais do Anel A
// mais search_products/get_order_status (Anel A), create_order (1ª tool do
// Anel B, AD-009, catalog-orders/T14) e issue_payment_link (2ª tool do Anel
// B, AD-009, payments-asaas/T20). AD-010: nenhum `input_schema` carrega
// tenant/canal/conversa — quem chama a tool sempre recebe esses dados do
// `ToolContext` do servidor.
export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_process_template',
    description:
      'Consulta os campos e as etapas (stages) do template de processo corrente do tenant, pelo key do template. Use antes de abrir um processo para saber quais campos preencher.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Chave (key) do template de processo desejado.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'find_or_create_customer',
    description:
      'Busca um cliente pelo telefone; se não existir, cadastra um novo. Use antes de abrir um processo para garantir que o cliente exista.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome completo do cliente (usado só na criação).' },
        phone: { type: 'string', description: 'Telefone do cliente (mesmo número da conversa do WhatsApp).' },
        document: { type: 'string', description: 'Documento do cliente, quando informado (usado só na criação).' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'open_process',
    description:
      'Abre um novo processo para um cliente já cadastrado, a partir de um template de processo. Use depois de find_or_create_customer e get_process_template.',
    input_schema: {
      type: 'object',
      properties: {
        templateKey: { type: 'string', description: 'Chave (key) do template de processo a usar.' },
        customerId: { type: 'string', description: 'ID do cliente dono do processo (de find_or_create_customer).' },
        values: {
          type: 'object',
          description: 'Valores iniciais dos campos do processo, já coletados com o cliente.',
        },
      },
      required: ['templateKey', 'customerId'],
    },
  },
  {
    name: 'set_process_fields',
    description:
      'Atualiza os valores dos campos de um processo já aberto. Use conforme o cliente for fornecendo mais informações durante a conversa.',
    input_schema: {
      type: 'object',
      properties: {
        processId: { type: 'string', description: 'ID do processo a atualizar (de open_process).' },
        values: { type: 'object', description: 'Valores dos campos a gravar no processo.' },
      },
      required: ['processId', 'values'],
    },
  },
  {
    name: 'search_products',
    description:
      'Busca produtos ativos do catálogo do tenant por nome. Use para responder o que o cliente pergunta sobre produtos disponíveis e preços — nunca cite preço sem antes chamar esta tool.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Busca opcional por parte do nome do produto. Sem isso, os 5 mais recentes.',
        },
      },
    },
  },
  {
    name: 'get_order_status',
    description:
      'Consulta o status, itens e total de um pedido do cliente desta conversa. Use para responder perguntas sobre o andamento de um pedido já feito.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'ID do pedido (de create_order). Sem isso, o pedido mais recente desta conversa.',
        },
      },
    },
  },
  {
    name: 'create_order',
    description:
      'Monta um pedido a partir dos itens escolhidos pelo cliente (1ª chamada) e, depois, registra a confirmação explícita do cliente sobre o MESMO pedido (2ª chamada, mesma idempotencyKey, customerConfirmed:true). O pedido só é liberado (confirmed) depois da confirmação do cliente E da aprovação do operador.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Itens do pedido, na ordem que o cliente escolheu.',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', description: 'ID do produto (de search_products).' },
              quantity: { type: 'number', description: 'Quantidade desejada (inteiro, 1 a 100).' },
            },
            required: ['productId', 'quantity'],
          },
        },
        idempotencyKey: {
          type: 'string',
          description: 'Chave estável para este pedido — a MESMA nas duas chamadas (criação e confirmação).',
        },
        customerConfirmed: {
          type: 'boolean',
          description: 'true só na 2ª chamada, depois do cliente confirmar explicitamente o pedido resumido.',
        },
      },
      required: ['items', 'idempotencyKey'],
    },
  },
  {
    name: 'issue_payment_link',
    description:
      'Emite uma cobrança PIX para um pedido já confirmado (status confirmed) e devolve o payload copia-e-cola/QR Code para o cliente pagar. Se o pedido já tiver uma cobrança, devolve a mesma cobrança em vez de criar outra.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'ID do pedido confirmado (de create_order/get_order_status).' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_available_slots',
    description:
      'Consulta os horários livres de uma data para agendamento, com a lista de profissionais disponíveis em cada um, mais os agendamentos futuros já ativos deste cliente. Use antes de oferecer horário ao cliente — nunca invente um horário.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data no formato YYYY-MM-DD, de hoje até 90 dias à frente.' },
        professionalId: {
          type: 'string',
          description: 'ID de um profissional específico, para filtrar só os horários dele.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description:
      'Reserva um horário de agendamento para o cliente desta conversa, com o profissional escolhido. Use SEMPRE o valor de `start` exatamente como devolvido por get_available_slots, nunca um horário calculado ou digitado. Depois de reservar, repasse ao cliente o `confirmationUrl` devolvido, palavra por palavra — é o link para ele confirmar presença ou cancelar.',
    input_schema: {
      type: 'object',
      properties: {
        professionalId: { type: 'string', description: 'ID do profissional escolhido (de get_available_slots).' },
        start: {
          type: 'string',
          description: 'Horário exato do slot escolhido, EXATAMENTE como devolvido por get_available_slots.',
        },
        spaceId: { type: 'string', description: 'ID do ambiente de atendimento escolhido, se houver.' },
      },
      required: ['professionalId', 'start'],
    },
  },
];
