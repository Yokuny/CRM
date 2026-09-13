// AD-036: convenção de tempo do projeto — instante sempre em UTC, conversão
// para hora local só na borda de apresentação (tela e texto que a IA envia).
// Vive em packages/contracts, não em packages/db (correção da fase Tasks):
// apps/web depende de contracts mas nunca de db, e o front precisa da mesma
// constante para formatar o mesmo horário que o back-end grava, qualquer que
// seja o fuso do navegador.
export const DISPLAY_TIMEZONE = 'America/Sao_Paulo';
