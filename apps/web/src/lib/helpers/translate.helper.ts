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
  // Inbox (feature inbox-realtime, Fase 11) — chaves novas usadas por
  // routes/_private/inbox/** (index.tsx + @components/*).
  'inbox.title': 'Caixa de entrada',
  'inbox.queue.title': 'Fila de conversas',
  'inbox.thread.select_hint': 'Selecione uma conversa na fila para ver o histórico.',
  'inbox.thread.not_found': 'Conversa não encontrada nesta página da fila. Ajuste os filtros ou a paginação.',
  'inbox.column.customer': 'Cliente',
  'inbox.column.mode': 'Modo',
  'inbox.column.assignee': 'Responsável',
  'inbox.column.last_activity': 'Última atividade',
  'inbox.column.unread': 'Não lida',
  'inbox.column.window': 'Janela 24h',
  'inbox.mode.bot': 'Bot',
  'inbox.mode.human': 'Humano',
  'inbox.assignee.you': 'Você',
  'inbox.assignee.other': 'Outro operador',
  'inbox.unread.yes': 'Nova',
  'inbox.window.open': 'Aberta',
  'inbox.window.closed': 'Fechada',
  'inbox.filter.mode.all': 'Todas',
  'inbox.thread.empty': 'Nenhuma mensagem ainda.',
  'inbox.message.unsupported': 'Tipo de mensagem não suportado nesta tela.',
  'inbox.message.failed': 'Falhou',
  'inbox.media.view': 'Ver',
  'inbox.media.download': 'Baixar',
  'inbox.media.loading': 'Carregando mídia…',
  'inbox.media.error': 'Não foi possível carregar essa mídia agora.',
  'inbox.composer.window_closed': 'A janela de 24h está fechada. Continue a conversa pelo seu WhatsApp.',
  'inbox.composer.open_whatsapp': 'Abrir no WhatsApp',
  'inbox.composer.placeholder': 'Escreva uma mensagem…',
  'inbox.composer.send': 'Enviar',
  'inbox.composer.error': 'Não foi possível enviar a mensagem.',
  'inbox.resend.action': 'Reenviar',
  'inbox.takeover.action': 'Assumir',
  'inbox.takeover.error': 'Não foi possível assumir esta conversa.',
  'inbox.release.action': 'Liberar',
  'inbox.release.error': 'Não foi possível liberar esta conversa.',
  // Catálogo de produtos (feature catalog-orders, Fase 9) — chaves novas
  // usadas por routes/_private/products/** (T19).
  'product.list.title': 'Catálogo',
  'product.price': 'Preço',
  'product.stock': 'Estoque',
  'product.status.active': 'Ativo',
  'product.status.inactive': 'Inativo',
};

export const t = (key: string): string => translations[key] ?? key;
