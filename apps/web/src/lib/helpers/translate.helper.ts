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
  close: 'Fechar',
  back: 'Voltar',
  'date.pick': 'Escolha o dia',
  customers: 'Clientes',
  'customer.create.title': 'Novo cliente',
  'customer.create.error': 'Não foi possível criar o cliente.',
  // Seções de customers/add/index.tsx (DefaultFormLayout).
  'customer.create.section.identification': 'Identificação',
  'customer.create.section.identification_description': 'Dados básicos para identificar e contatar o cliente.',
  'customer.create.section.details': 'Detalhes adicionais',
  'customer.create.section.details_description':
    'Campos extras que sua empresa configurou para o cadastro de clientes.',
  'customer.create.field.name_placeholder': 'Ex.: Maria Silva',
  'customer.create.field.phone_placeholder': 'Ex.: 11999999999',
  'customer.create.field.document_placeholder': 'Ex.: 000.000.000-00',
  'customer.details.title': 'Detalhe do cliente',
  'customer.processes.title': 'Processos',
  'customer.edit.error': 'Não foi possível salvar as alterações.',
  'process.create.title': 'Novo processo',
  'process.create.error': 'Não foi possível criar o processo.',
  'process.create.success': 'Processo criado com sucesso.',
  'process.template.placeholder': 'Escolha um tipo de processo',
  'process.new.action': 'Novo processo',
  // Seção de processes/add/index.tsx (DefaultFormLayout).
  'process.create.section.template': 'Tipo de processo',
  'process.create.section.template_description': 'Escolha o modelo de processo que será criado para este cliente.',
  'process.details.title': 'Detalhe do processo',
  'process.values.error': 'Não foi possível salvar os valores do processo.',
  // Seção de processes/details.tsx (DefaultFormLayout, ProcessValuesForm).
  'process.details.section.values': 'Valores do processo',
  'process.details.section.values_description': 'Campos configurados no template deste processo.',
  'process.stage.label': 'Etapa',
  'process.stage.error': 'Não foi possível avançar a etapa do processo.',
  'auth.signin.title': 'Entrar',
  // Seção de auth/index.tsx (DefaultFormLayout).
  'auth.signin.section_info': 'Credenciais de acesso',
  'auth.signin.section_info_description': 'Informe seu e-mail e senha cadastrados.',
  'auth.signin.submit': 'Entrar',
  'auth.signin.error': 'Não foi possível entrar.',
  'invite.accept.title': 'Aceitar convite',
  // Seção de invite/index.tsx (DefaultFormLayout).
  'invite.accept.section_info': 'Seus dados',
  'invite.accept.section_info_description': 'Defina seu nome e senha para concluir o cadastro.',
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
  // T20 — products/add/index.tsx.
  'product.create.title': 'Novo produto',
  'product.create.error': 'Não foi possível criar o produto.',
  // Seção de products/add/index.tsx (DefaultFormLayout).
  'product.create.section.info': 'Informações do produto',
  'product.create.section.info_description': 'Dados usados no catálogo e na conferência de estoque.',
  'product.create.field.name_placeholder': 'Ex.: Camiseta Branca P',
  'product.create.field.sku_placeholder': 'Ex.: CAM-BR-P',
  'product.create.field.stock_placeholder': 'Ex.: 10',
  'product.create.field.description_placeholder': 'Ex.: Descrição curta do produto',
  'product.sku': 'SKU',
  'product.description': 'Descrição',
  // T21 — products/details.tsx.
  'product.details.title': 'Detalhe do produto',
  // Fila/histórico de Pedidos (feature catalog-orders, Fase 10) — chaves
  // novas usadas por routes/_private/orders/index.tsx (T23) e pelo card
  // inline do Inbox (order-card.tsx, T24).
  'order.list.title': 'Pedidos',
  'order.column.customer': 'Cliente',
  'order.column.items': 'Itens',
  'order.column.total': 'Total',
  'order.status.pending_approval': 'Pendente',
  'order.status.confirmed': 'Confirmado',
  'order.status.rejected': 'Rejeitado',
  'order.approve.action': 'Aprovar',
  'order.approve.error': 'Não foi possível aprovar o pedido.',
  'order.reject.action': 'Rejeitar',
  'order.reject.error': 'Não foi possível rejeitar o pedido.',
  // Status de pagamento (feature payments-asaas, P2/T31) — read-only,
  // ao lado do status do Order na tela de Pedidos (spec.md P2 AC1).
  'order.status.payment_expired': 'Pagamento expirado',
  'order.column.payment': 'Pagamento',
  'order.payment.pending': 'Pagamento pendente',
  'order.payment.paid': 'Pago',
  'order.payment.expired': 'Cobrança expirada',
  'order.payment.refunded': 'Reembolsado',
  'order.payment.canceled': 'Cancelado',
  // Grade semanal de Professional (feature scheduling, Fase 7/T33) —
  // weekday-editor.tsx agrupa `weeklySchedule` por dia da semana.
  'weekday.0': 'Domingo',
  'weekday.1': 'Segunda-feira',
  'weekday.2': 'Terça-feira',
  'weekday.3': 'Quarta-feira',
  'weekday.4': 'Quinta-feira',
  'weekday.5': 'Sexta-feira',
  'weekday.6': 'Sábado',
  'schedule.window.start': 'Início',
  'schedule.window.end': 'Fim',
  // Telas de Profissional (feature scheduling, Fase 7/T34) — routes/_private/
  // schedule/professionals/**. Chave crua `professionals` é o fallback de
  // breadcrumb (card.tsx, PageBreadcrumb) pro segmento intermediário da URL
  // quando a página aberta é `add`/`details` (rota-irmã de `index.tsx`, sem
  // staticData própria pro prefixo) — mesmo padrão de `customers`/`schedule`.
  professionals: 'Profissionais',
  'professional.list.title': 'Profissionais',
  'professional.create.title': 'Novo profissional',
  'professional.details.title': 'Detalhe do profissional',
  'professional.slot_duration': 'Duração do horário (min)',
  'professional.weekly_schedule': 'Grade semanal',
  'professional.status.active': 'Ativo',
  'professional.status.inactive': 'Inativo',
  'professional.filter.show_inactive': 'Mostrar inativos',
  // Seções de schedule/professionals/add/index.tsx (DefaultFormLayout).
  'professional.create.section.info': 'Informações do profissional',
  'professional.create.section.info_description': 'Nome e duração padrão dos horários de atendimento.',
  'professional.create.section.schedule': 'Grade semanal',
  'professional.create.section.schedule_description':
    'Defina os horários em que o profissional está disponível para agendamentos.',
  'professional.create.field.name_placeholder': 'Ex.: Dra. Ana Souza',
  'professional.slot_duration_placeholder': 'Ex.: 30',
  // Telas de Ambiente (feature scheduling, Fase 7/T35) — routes/_private/
  // schedule/spaces/**. Chave crua `spaces` é o mesmo fallback de breadcrumb
  // de `professionals` acima.
  spaces: 'Ambientes',
  'space.list.title': 'Ambientes',
  'space.create.title': 'Novo ambiente',
  'space.details.title': 'Detalhe do ambiente',
  'space.status.active': 'Ativo',
  'space.status.inactive': 'Inativo',
  'space.filter.show_inactive': 'Mostrar inativos',
  // Seção de schedule/spaces/add/index.tsx (DefaultFormLayout).
  'space.create.section.info': 'Informações do ambiente',
  'space.create.section.info_description': 'Nome do ambiente usado nos agendamentos.',
  'space.create.field.name_placeholder': 'Ex.: Sala 1',
  // Configuração da agenda (feature scheduling, Fase 7/T36) — routes/
  // _private/schedule/settings/index.tsx.
  'scheduling_settings.title': 'Configuração da agenda',
  'scheduling_settings.max_slots': 'Máximo de horários por resposta',
  'scheduling_settings.max_slots_placeholder': 'Ex.: 16',
  // Seção de schedule/settings/index.tsx (DefaultFormLayout).
  'scheduling_settings.section.info': 'Limite de horários',
  'scheduling_settings.section.info_description':
    'Quantidade máxima de horários sugeridos em cada resposta automática do agendamento.',
  // Calendário da agenda (feature scheduling, Fase 8/T39) — routes/_private/
  // schedule/calendar/index.tsx.
  'calendar.title': 'Calendário',
  'calendar.previous_week': 'Semana anterior',
  'calendar.next_week': 'Próxima semana',
  'calendar.filter.professional': 'Profissional',
  'calendar.filter.all_professionals': 'Todos os profissionais',
  'calendar.filter.space': 'Ambiente',
  'calendar.filter.all_spaces': 'Todos os ambientes',
  'calendar.new_appointment': 'Novo agendamento',
  'calendar.new_block': 'Novo bloqueio',
  // Diálogo de agendamento (feature scheduling, Fase 8/T40) — routes/_private/
  // schedule/calendar/@components/appointment-dialog.tsx.
  'appointment.create.title': 'Novo agendamento',
  // Seções de appointment-panel.tsx (DefaultFormLayout).
  'appointment.create.section.info': 'Detalhes do agendamento',
  'appointment.create.section.info_description': 'Escolha cliente, profissional, data e horário do atendimento.',
  'appointment.reschedule.section_description': 'Escolha a nova data, horário e, se necessário, o profissional.',
  'appointment.detail.title': 'Agendamento',
  'appointment.field.customer': 'Cliente',
  'appointment.field.professional': 'Profissional',
  'appointment.field.date': 'Data',
  'appointment.field.time': 'Hora',
  'appointment.field.space': 'Ambiente',
  'appointment.field.space_none': 'Sem ambiente',
  'appointment.field.notes': 'Observações',
  'appointment.status.pending': 'Pendente',
  'appointment.status.confirmed': 'Confirmado',
  'appointment.status.completed': 'Concluído',
  'appointment.status.no_show': 'Não compareceu',
  'appointment.status.canceled_by_customer': 'Cancelado pelo cliente',
  'appointment.status.canceled_by_operator': 'Cancelado pelo operador',
  'appointment.action.cancel': 'Cancelar agendamento',
  'appointment.cancel.reason_placeholder': 'Motivo (opcional)',
  'appointment.action.reschedule': 'Remarcar',
  'appointment.attendance.completed': 'Compareceu',
  'appointment.attendance.no_show': 'Não compareceu',
  'appointment.action.request_confirmation': 'Pedir confirmação',
  'appointment.notice.queued': 'Cliente avisado.',
  'appointment.notice.wa_me_button': 'Avisar pelo WhatsApp',
  'block.detail.title': 'Bloqueio',
  // Seção de block-panel.tsx/BlockCreateForm (DefaultFormLayout).
  'block.create.section.info': 'Bloqueio de horário',
  'block.create.section.info_description': 'Impede novos agendamentos deste profissional durante o período informado.',
  'block.field.title_placeholder': 'Ex.: Feriado, folga ou reunião',
  'block.field.start_date_placeholder': 'dd/mm/aaaa',
  'block.field.start_time_placeholder': 'hh:mm',
  'block.field.end_date_placeholder': 'dd/mm/aaaa',
  'block.field.end_time_placeholder': 'hh:mm',
  'block.field.title': 'Título',
  'block.field.start_date': 'Data de início',
  'block.field.start_time': 'Hora de início',
  'block.field.end_date': 'Data de fim',
  'block.field.end_time': 'Hora de fim',
  'block.action.remove': 'Remover bloqueio',
  // Página pública de confirmação (feature scheduling, Fase 8/T42) —
  // routes/_public/appointment/**, sem sessão, anônima (SCH-28).
  'appointment_confirmation.title': 'Confirmação de agendamento',
  'appointment_confirmation.description': 'Revise os detalhes do seu agendamento e confirme sua presença.',
  'appointment_confirmation.missing_token': 'Link de confirmação inválido.',
  'appointment_confirmation.not_found': 'Link de confirmação não encontrado.',
  'appointment_confirmation.expired': 'Link de confirmação expirado.',
  'appointment_confirmation.error': 'Não foi possível carregar seu agendamento.',
  'appointment_confirmation.confirm_action': 'Confirmar presença',
  'appointment_confirmation.cancel_action': 'Não vou comparecer',
  'appointment_confirmation.footer_note': 'Em caso de dúvidas, entre em contato com o estabelecimento.',
  // Hub da agenda (feature scheduling, Fase 8/T43) — routes/_private/
  // schedule/index.tsx + card "Agenda" na home (routes/_private/index.tsx).
  schedule: 'Agenda',
  // Kanban livre (feature kanban-tool, Fase 4/T15) — routes/_private/kanban/
  // index.tsx (hub de boards).
  'kanban.board.list.title': 'Quadros',
  'kanban.card.singular': 'card',
  'kanban.card.plural': 'cards',
  // T16 — routes/_private/kanban/add/index.tsx (criação de board).
  'kanban.board.create.title': 'Novo quadro',
  'kanban.board.field.description': 'Descrição',
  'kanban.board.columns.label': 'Colunas iniciais',
  'kanban.board.columns.column_label': 'Nome da coluna',
  'kanban.board.columns.add': 'Adicionar coluna',
  // Seções de kanban/add/index.tsx (DefaultFormLayout).
  'kanban.board.create.section.info': 'Informações do quadro',
  'kanban.board.create.section.info_description': 'Nome e descrição do quadro Kanban.',
  'kanban.board.create.section.columns': 'Colunas',
  'kanban.board.create.section.columns_description':
    'Defina as colunas iniciais do quadro — é possível ajustar depois.',
  'kanban.board.create.field.name_placeholder': 'Ex.: Vendas',
  'kanban.board.field.description_placeholder': 'Ex.: Quadro para acompanhar vendas em andamento',
  'kanban.board.columns.column_label_placeholder': 'Ex.: A fazer',
  // T17 — routes/_private/kanban/details/@components/kanban-card-content.tsx
  // (badges de referência do card: cliente/processo/pedido/responsável).
  'kanban.card.field.customer': 'Cliente',
  'kanban.card.field.process': 'Processo',
  'kanban.card.field.order': 'Pedido',
  'kanban.card.field.assignee': 'Responsável',
  // T18 — routes/_private/kanban/details/@components/card-panel.tsx (painel
  // inline de criar/editar/apagar card, AD-037).
  'kanban.card.create.title': 'Novo card',
  // Seção de card-panel.tsx (DefaultFormLayout, criar e editar).
  'kanban.card.section.info': 'Detalhes do card',
  'kanban.card.section.info_description':
    'Título, descrição e referências opcionais (cliente, processo, pedido, responsável).',
  'kanban.card.detail.title': 'Card',
  'kanban.card.field.title': 'Título',
  'kanban.card.field.description': 'Descrição',
  'kanban.card.field.none': 'Nenhum',
  'kanban.card.create.error': 'Não foi possível criar o card.',
  'kanban.card.update.error': 'Não foi possível salvar o card.',
  'kanban.card.delete.action': 'Remover card',
  'kanban.card.delete.error': 'Não foi possível remover o card.',
  // T19 — routes/_private/kanban/details/@components/column-manager-panel.tsx
  // (painel inline de gerenciar colunas, AD-037).
  'kanban.column_manager.title': 'Gerenciar colunas',
  // Seção de column-manager-panel.tsx (DefaultFormLayout).
  'kanban.column_manager.section_title': 'Colunas',
  'kanban.column_manager.section_description': 'Renomeie, defina uma cor, reordene ou remova as colunas deste quadro.',
  'kanban.column_manager.move_up': 'Mover para cima',
  'kanban.column_manager.move_down': 'Mover para baixo',
  'kanban.column.field.color': 'Cor',
  // T20 — routes/_private/kanban/details.tsx (tela do board, drag-and-drop).
  'kanban.board.details.title': 'Detalhe do quadro',
  'kanban.column_manager.action': 'Colunas',
  'kanban.board.edit.error': 'Não foi possível salvar as alterações do quadro.',
  'kanban.card.move.error': 'Não foi possível mover o card. Tente novamente.',
};

export const t = (key: string): string => translations[key] ?? key;
