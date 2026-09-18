// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '@/query/appointment.js';
import { MonthView } from './month-view.js';

afterEach(cleanup);

const baseAppointment: AppointmentRecord = {
  id: 'a1',
  kind: 'appointment',
  professional: 'p1',
  professionalName: 'Dra. Ana',
  customer: 'c1',
  customerName: 'João',
  start: '2026-09-16T13:00:00.000Z',
  end: '2026-09-16T14:00:00.000Z',
  status: 'pending',
  source: 'operator',
  createdAt: '',
  updatedAt: '',
};

describe('MonthView (spec.md SCH-29, migração do calendário)', () => {
  it('renders a 6x7 grid (42 day cells) covering September 2026', () => {
    render(<MonthView month="2026-09-16" items={[]} onSelect={vi.fn()} />);

    // Setembro/2026 começa numa terça — a grade (segunda-first) começa em
    // 31/08 e cobre até 11/10 pra fechar 6 semanas completas.
    expect(screen.getByTestId('month-view-day-2026-08-31')).toBeInTheDocument();
    expect(screen.getByTestId('month-view-day-2026-09-16')).toBeInTheDocument();
    expect(screen.getByTestId('month-view-day-2026-10-11')).toBeInTheDocument();
  });

  it('labels the columns starting on Monday, matching the grid (31/08/2026 is a Monday)', () => {
    render(<MonthView month="2026-09-16" items={[]} onSelect={vi.fn()} />);

    const labels = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    const headerCells = screen.getAllByText(new RegExp(`^(${labels.join('|')})$`));
    expect(headerCells.map((cell) => cell.textContent)).toEqual(labels);
  });

  it('shows a multi-day block in every day cell it covers', () => {
    const twoDayBlock: AppointmentRecord = {
      ...baseAppointment,
      id: 'two-day',
      kind: 'block',
      customer: undefined,
      customerName: undefined,
      title: 'Folga',
      start: '2026-09-18T03:00:00.000Z',
      end: '2026-09-20T02:59:00.000Z',
    };

    render(<MonthView month="2026-09-16" items={[twoDayBlock]} onSelect={vi.fn()} />);

    expect(
      within(screen.getByTestId('month-view-day-2026-09-18')).getByTestId('calendar-event-two-day'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('month-view-day-2026-09-19')).getByTestId('calendar-event-two-day'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('month-view-day-2026-09-20')).queryByTestId('calendar-event-two-day'),
    ).not.toBeInTheDocument();
  });

  it('dims days that fall outside the displayed month', () => {
    render(<MonthView month="2026-09-16" items={[]} onSelect={vi.fn()} />);

    expect(screen.getByTestId('month-view-day-2026-08-31').className).toContain('text-muted-foreground');
    expect(screen.getByTestId('month-view-day-2026-09-16').className).not.toContain('text-muted-foreground');
  });

  it('places an item in the cell matching its display-timezone date', () => {
    render(<MonthView month="2026-09-16" items={[baseAppointment]} onSelect={vi.fn()} />);

    expect(
      within(screen.getByTestId('month-view-day-2026-09-16')).getByTestId('calendar-event-a1'),
    ).toBeInTheDocument();
  });

  it('shows only up to 3 events per day and puts the rest behind a "+N" popover', async () => {
    const items: AppointmentRecord[] = Array.from({ length: 4 }, (_, index) => ({
      ...baseAppointment,
      id: `item-${index}`,
      start: `2026-09-16T${10 + index}:00:00.000Z`,
      end: `2026-09-16T${11 + index}:00:00.000Z`,
    }));

    render(<MonthView month="2026-09-16" items={items} onSelect={vi.fn()} />);
    const dayCell = screen.getByTestId('month-view-day-2026-09-16');

    expect(within(dayCell).getAllByTestId(/calendar-event-item-/)).toHaveLength(3);
    const overflowTrigger = within(dayCell).getByText('+1 Mais');

    const user = userEvent.setup();
    await user.click(overflowTrigger);

    expect(await screen.findByTestId('calendar-event-item-3')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn();
    render(<MonthView month="2026-09-16" items={[baseAppointment]} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('calendar-event-a1'));

    expect(onSelect).toHaveBeenCalledWith(baseAppointment);
  });
});
