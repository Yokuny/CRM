import { connect, disconnect, User } from '@crm/db';
import bcrypt from 'bcrypt';
import { env } from '../src/config/env.config.js';

// Ferramenta de dev/ops — não é rota. `isPlatformAdmin` nunca é aceito por
// requisição HTTP (design.md, Tech Decisions: "a flag nunca é aceita por
// rota (só seed/script)"); este é o script. Idempotente: upsert por e-mail.
const BCRYPT_COST = 10;

const email = process.env.SEED_EMAIL || 'admin@platform.local';
const password = process.env.SEED_PASSWORD || 'plataforma123';
const name = process.env.SEED_NAME || 'Platform Admin';

const run = async (): Promise<void> => {
  await connect(env.MONGODB_URI);

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
  await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { name, email, password: hashedPassword, isPlatformAdmin: true, role: [], active: true },
    { upsert: true, setDefaultsOnInsert: true },
  );

  console.log(JSON.stringify({ event: 'seed.platform_admin.done', email }));
  await disconnect();
};

void run();
