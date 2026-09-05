// SPEC_DEVIATION: i18n completo é escopo da feature 4 (crm-web-shell;
// spec.md, Out of Scope: "i18n completo"). Esta é a forma mínima da
// convenção obrigatória (t() em toda string voltada ao usuário — CLAUDE.md
// do front de referência): um dicionário fixo pt-BR só com as chaves que as
// telas desta feature usam, sem troca de idioma.
const translations: Record<string, string> = {
  email: 'E-mail',
  password: 'Senha',
  name: 'Nome',
  phone: 'Telefone',
  document: 'Documento',
  status: 'Status',
  save: 'Salvar',
  cancel: 'Cancelar',
  edit: 'Editar',
  customers: 'Clientes',
  'customer.create.title': 'Novo cliente',
  'customer.create.error': 'Não foi possível criar o cliente.',
  'customer.details.title': 'Detalhe do cliente',
  'customer.processes.title': 'Processos',
  'customer.edit.error': 'Não foi possível salvar as alterações.',
  'auth.signin.title': 'Entrar',
  'auth.signin.submit': 'Entrar',
  'auth.signin.error': 'Não foi possível entrar.',
  'invite.accept.title': 'Aceitar convite',
  'invite.accept.submit': 'Criar conta',
  'invite.accept.missing_token': 'Link de convite inválido.',
  'invite.accept.invited_to': 'Convite para',
  'invite.accept.error': 'Não foi possível concluir o cadastro.',
  'invite.accept.invalid': 'Convite inválido.',
  loading: 'Carregando…',
  add: 'Adicionar',
  remove: 'Remover',
  'not.found': 'Nenhum registro encontrado.',
  'not.found.description': 'Ajuste os filtros ou tente outro termo de busca.',
  'search.placeholder': 'Buscar…',
  'table.page': 'Página',
  'previous.page': 'Página anterior',
  'next.page': 'Próxima página',
  'customer.status.none': 'Sem status',
  'kanban.move.error': 'Não foi possível mover o cliente. Tente novamente.',
  'customers.view.table': 'Tabela',
  'customers.view.kanban': 'Kanban',
  'private.role': 'Papel',
  // Usado por BreadcrumbEllipsis (apps/web/src/components/ui/breadcrumb.tsx,
  // T8) — texto de acessibilidade (sr-only) do "..." de breadcrumbs longos.
  more: 'Mais',
};

export const t = (key: string): string => translations[key] ?? key;
