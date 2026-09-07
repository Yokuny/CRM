// Definições das tools enviadas ao modelo (JSON Schema literal, não derivado
// de Zod — mesma forma de assistant-tools.ts, DentalEase-BackEnd). AD-004: só
// as 4 tools do Anel A existem hoje, superfície fixa e idêntica entre
// tenants. AD-010: nenhum `input_schema` carrega tenant/canal/conversa — quem
// chama a tool sempre recebe esses dados do `ToolContext` do servidor.
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
];
