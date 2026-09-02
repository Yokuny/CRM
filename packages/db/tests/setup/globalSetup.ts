import { MongoMemoryServer } from 'mongodb-memory-server';

// Sobe um MongoDB in-memory standalone (sem replica set — decisão do design) uma
// única vez por run do project "integration". A URI fica em MONGODB_URI para os
// testes conectarem via `connect()` de packages/db.
export default async function setup(): Promise<() => Promise<void>> {
  const instance = await MongoMemoryServer.create();
  process.env.MONGODB_URI = instance.getUri();

  return async () => {
    await instance.stop();
  };
}
