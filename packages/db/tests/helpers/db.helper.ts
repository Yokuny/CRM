import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { connect, disconnect } from '../../src/connection.js';

// Remove todos os documentos das collections já registradas neste arquivo de
// teste, sem dropar estrutura/índices — mantém o estado limpo entre testes.
export const clearCollections = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};

// Chame no topo do describe: conecta ao MongoMemoryServer (URI injetada pelo
// globalSetup), limpa collections entre testes e desconecta ao final da suíte.
export const useTestDb = (): void => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await clearCollections();
  });

  afterAll(async () => {
    await disconnect();
  });
};
