// Dicionário fixo pt-BR (T28 — feature crm-web-shell fecha o SPEC_DEVIATION
// que apontava pra cá): toda string voltada ao usuário do app passa por
// `t(key)`, telas novas E existentes (auth/invite/private), sem biblioteca
// de i18n nem seletor de idioma (spec.md, Assumptions — mesmo padrão do
// `translations.json` plano do front de referência).
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
  confirm: 'Confirmar',
  back: 'Voltar',
  'date.pick': 'Escolha o dia',
  customers: 'Clientes',
  'customer.create.title': 'Novo cliente',
  'customer.create.error': 'Não foi possível criar o cliente.',
  'customer.details.title': 'Detalhe do cliente',
  'customer.processes.title': 'Processos',
  'customer.edit.error': 'Não foi possível salvar as alterações.',
  'process.create.title': 'Novo processo',
  'process.create.error': 'Não foi possível criar o processo.',
  'process.create.success': 'Processo criado com sucesso.',
  'process.template.placeholder': 'Escolha um tipo de processo',
  'process.new.action': 'Novo processo',
  'process.details.title': 'Detalhe do processo',
  'process.values.error': 'Não foi possível salvar os valores do processo.',
  'process.stage.label': 'Etapa',
  'process.stage.error': 'Não foi possível avançar a etapa do processo.',
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
  // Título da própria página de listagem (customers/list/index.tsx) — "Tabela"
  // (customers.view.table) é o rótulo curto da aba do toggle, não serve como
  // título de página/breadcrumb.
  'customers.list.title': 'Listagem',
  // Card index de customers/processes (hub de navegação, mesmo padrão do
  // settings/index.tsx de referência) — indica que não há destino genérico
  // pra Process sem escolher um cliente primeiro.
  'process.index.hint': 'Selecione um cliente para ver ou criar processos.',
  'private.role': 'Papel',
  // Usado por BreadcrumbEllipsis (apps/web/src/components/ui/breadcrumb.tsx,
  // T8) — texto de acessibilidade (sr-only) do "..." de breadcrumbs longos.
  more: 'Mais',
  home: 'Início',
  // aria-label do <nav> da dock de navegação mobile (mobile-dock.tsx) — não
  // pode ficar sem rótulo já que coexiste na tela com o <nav
  // aria-label="breadcrumb"> do Card.
  'nav.primary': 'Navegação principal',
};

export const t = (key: string): string => translations[key] ?? key;
