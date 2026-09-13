// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KanbanCardContent } from './kanban-card-content.js';

describe('KanbanCardContent (T17, spec.md P2 "Card exibe as entidades vinculadas"/KAN-24..28)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders only title/description with no reference badge when the card has none (KAN-28)', () => {
    render(<KanbanCardContent title="Tarefa livre" description="Sem vínculo nenhum" />);

    expect(screen.getByText('Tarefa livre')).toBeInTheDocument();
    expect(screen.getByText('Sem vínculo nenhum')).toBeInTheDocument();
  });

  it('shows the customer name when linked (KAN-24)', () => {
    render(<KanbanCardContent title="Card" customerName="Maria Cliente" />);

    expect(screen.getByText('Maria Cliente')).toBeInTheDocument();
  });

  it('shows the process template name + current stage when linked (KAN-25)', () => {
    render(<KanbanCardContent title="Card" processStage="Negociação" processTemplateName="Fluxo Padrão" />);

    expect(screen.getByText('Fluxo Padrão · Negociação')).toBeInTheDocument();
  });

  it('shows the order total price + status when linked (KAN-26)', () => {
    render(<KanbanCardContent title="Card" orderTotalPrice={12345} orderStatus="confirmed" />);

    expect(screen.getByText('R$ 123,45 · Confirmado')).toBeInTheDocument();
  });

  it('shows the assignee name when linked (KAN-27)', () => {
    render(<KanbanCardContent title="Card" assigneeName="Operador Bruno" />);

    expect(screen.getByText('Operador Bruno')).toBeInTheDocument();
  });

  it('renders all four badges together when every reference is present', () => {
    render(
      <KanbanCardContent
        title="Card completo"
        customerName="Maria Cliente"
        processStage="Negociação"
        processTemplateName="Fluxo Padrão"
        orderTotalPrice={100}
        orderStatus="pending_approval"
        assigneeName="Operador Bruno"
      />,
    );

    expect(screen.getByText('Maria Cliente')).toBeInTheDocument();
    expect(screen.getByText('Fluxo Padrão · Negociação')).toBeInTheDocument();
    expect(screen.getByText('R$ 1,00 · Pendente')).toBeInTheDocument();
    expect(screen.getByText('Operador Bruno')).toBeInTheDocument();
  });

  it('never renders any reference badge when there is no reference at all (KAN-28, no empty section)', () => {
    const { container } = render(<KanbanCardContent title="Só título" />);

    // Cada badge carrega um `title=` com o rótulo da referência
    // correspondente — nenhum deles existe quando o card não tem referência.
    expect(container.querySelector('[title="Cliente"]')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Processo"]')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Pedido"]')).not.toBeInTheDocument();
    expect(container.querySelector('[title="Responsável"]')).not.toBeInTheDocument();
  });
});
