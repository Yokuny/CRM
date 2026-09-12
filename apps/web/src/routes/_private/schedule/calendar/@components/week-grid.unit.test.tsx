// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '@/query/appointment.js';
import { WeekGrid } from './week-grid.js';

afterEach(cleanup);

const baseAppointment: AppointmentRecord = {
  id: 'a1',
  kind: 'appointment',
  professional: 'p1',
  professionalName: 'Dra. Ana',
  customer: 'c1',
  customerName: 'João',
  start: '2026-09-16T00:00:00.000Z',
  end: '2026-09-16T01:00:00.000Z',
  status: 'pending',
  source: 'operator',
  createdAt: '',
  updatedAt: '',
};

describe('WeekGrid (T38, spec.md SCH-29/SCH-35)', () => {
  it('renders 7 day columns starting from weekStart', () => {
    render(<WeekGrid weekStart="2026-09-14" items={[]} onSelect={vi.fn()} />);

    const expectedDays = [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ];
    for (const day of expectedDays) {
      expect(screen.getByTestId(`week-grid-day-${day}`)).toBeInTheDocument();
    }
  });

  // design.md/Done-when específico do T38: só passa se a grade usar
  // DISPLAY_TIMEZONE (America/Sao_Paulo, UTC-3), nunca o fuso do executor de
  // testes (a CI roda em UTC) — 2026-09-16T00:00:00Z é 2026-09-15 21:00 em SP.
  it('places the instant 2026-09-16T00:00:00Z in the 15/09 column at 21:00 (DISPLAY_TIMEZONE, not the runner local/UTC time)', () => {
    render(<WeekGrid weekStart="2026-09-14" items={[baseAppointment]} onSelect={vi.fn()} />);

    const septemberFifteenColumn = screen.getByTestId('week-grid-day-2026-09-15');
    expect(within(septemberFifteenColumn).getByText(/21:00/)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('week-grid-day-2026-09-16')).queryByTestId('week-grid-item-a1'),
    ).not.toBeInTheDocument();
  });

  it('renders a block (kind:"block") with a visually distinct style from a real appointment', () => {
    const block: AppointmentRecord = {
      ...baseAppointment,
      id: 'b1',
      kind: 'block',
      customer: undefined,
      customerName: undefined,
      title: 'Folga',
    };

    render(<WeekGrid weekStart="2026-09-14" items={[block]} onSelect={vi.fn()} />);

    const blockButton = screen.getByTestId('week-grid-item-b1');
    expect(blockButton.className).toContain('border-dashed');
    expect(blockButton).toHaveTextContent('Folga');
  });

  it('flags a pending/confirmed appointment whose start has already passed as overdue (SCH-35)', () => {
    const overdue: AppointmentRecord = {
      ...baseAppointment,
      id: 'overdue-1',
      start: '2020-01-01T13:00:00.000Z', // 2020-01-01 10:00 em SP — muito no passado
      end: '2020-01-01T14:00:00.000Z',
      status: 'pending',
    };

    render(<WeekGrid weekStart="2020-01-01" items={[overdue]} onSelect={vi.fn()} />);

    const overdueButton = screen.getByTestId('week-grid-item-overdue-1');
    expect(overdueButton.className).toContain('border-destructive');
  });

  it('does NOT flag a future pending/confirmed appointment as overdue', () => {
    const future: AppointmentRecord = {
      ...baseAppointment,
      id: 'future-1',
      start: '2099-01-01T13:00:00.000Z',
      end: '2099-01-01T14:00:00.000Z',
      status: 'pending',
    };

    render(<WeekGrid weekStart="2099-01-01" items={[future]} onSelect={vi.fn()} />);

    const futureButton = screen.getByTestId('week-grid-item-future-1');
    expect(futureButton.className).not.toContain('border-destructive');
  });

  it('does NOT flag an overdue-but-terminal appointment (e.g. already completed) as overdue', () => {
    const completed: AppointmentRecord = {
      ...baseAppointment,
      id: 'completed-1',
      start: '2020-01-01T13:00:00.000Z',
      end: '2020-01-01T14:00:00.000Z',
      status: 'completed',
    };

    render(<WeekGrid weekStart="2020-01-01" items={[completed]} onSelect={vi.fn()} />);

    const completedButton = screen.getByTestId('week-grid-item-completed-1');
    expect(completedButton.className).not.toContain('border-destructive');
  });

  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn();
    render(<WeekGrid weekStart="2026-09-14" items={[baseAppointment]} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('week-grid-item-a1'));

    expect(onSelect).toHaveBeenCalledWith(baseAppointment);
  });
});
