import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessageParams = Anthropic.MessageCreateParamsNonStreaming;
export type AnthropicMessage = Anthropic.Message;

export type AnthropicClient = {
  createMessage: (params: AnthropicMessageParams) => Promise<AnthropicMessage>;
};

// Lazy singleton (molde de DentalEase-BackEnd/src/use-cases/assistant-chat.use-case.ts
// getClient): a chave é checada em TODA chamada, mesmo depois do singleton já
// existir — nunca cacheia uma chave vazia atrás de um cliente já criado antes.
let client: Anthropic | null = null;

const getClient = (apiKey: string): Anthropic => {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY é obrigatório');
  if (!client) client = new Anthropic({ apiKey });
  return client;
};

// Wrapper fino e injetável: quem chama (loop.ts, T21) nunca importa
// @anthropic-ai/sdk diretamente — recebe só o objeto {createMessage}, que em
// teste vira um fake com a mesma assinatura, sem tocar o SDK real (AD-010-like
// boundary para a API do modelo).
export const createAnthropicClient = (apiKey: string): AnthropicClient => {
  const anthropic = getClient(apiKey);
  return {
    createMessage: (params) => anthropic.messages.create(params),
  };
};
