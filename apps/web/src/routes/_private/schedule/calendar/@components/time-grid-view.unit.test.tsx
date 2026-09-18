// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '@/query/appointment.js';
import { TimeGridView } from './time-grid-view.js';

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

const WEEK_DAYS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

describe('TimeGridView (dia/semana, spec.md SCH-29/SCH-35)', () => {
  it('renders one column per day passed in `days`', () => {
    render(<TimeGridView days={WEEK_DAYS} items={[]} onSelect={vi.fn()} />);

    for (const day of WEEK_DAYS) {
      expect(screen.getByTestId(`time-grid-day-${day}`)).toBeInTheDocument();
    }
  });

  it('renders a single column for the day view (days.length === 1)', () => {
    render(<TimeGridView days={['2026-09-16']} items={[]} onSelect={vi.fn()} />);

    expect(screen.getByTestId('time-grid-day-2026-09-16')).toBeInTheDocument();
    expect(screen.queryByTestId('time-grid-day-2026-09-17')).not.toBeInTheDocument();
  });

  // design.md/Done-when específico do T38 (herdado de WeekGrid): só passa se
  // a grade usar DISPLAY_TIMEZONE (America/Sao_Paulo, UTC-3), nunca o fuso do
  // executor de testes — 2026-09-16T00:00:00Z é 2026-09-15 21:00 em SP.
  it('places the instant 2026-09-16T00:00:00Z in the 15/09 column at 21:00 (DISPLAY_TIMEZONE, not the runner local/UTC time)', () => {
    render(<TimeGridView days={WEEK_DAYS} items={[baseAppointment]} onSelect={vi.fn()} />);

    const septemberFifteenColumn = screen.getByTestId('time-grid-day-2026-09-15');
    expect(within(septemberFifteenColumn).getByText(/21:00/)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('time-grid-day-2026-09-16')).queryByTestId('calendar-event-a1'),
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

    render(<TimeGridView days={WEEK_DAYS} items={[block]} onSelect={vi.fn()} />);

    const blockButton = screen.getByTestId('calendar-event-b1');
    expect(blockButton.className).toContain('border-dashed');
    expect(blockButton).toHaveTextContent('Folga');
  });

  it('flags a pending/confirmed appointment whose start has already passed as overdue (SCH-35)', () => {
    const overdue: AppointmentRecord = {
      ...baseAppointment,
      id: 'overdue-1',
      start: '2020-01-01T13:00:00.000Z',
      end: '2020-01-01T14:00:00.000Z',
      status: 'pending',
    };

    render(<TimeGridView days={['2020-01-01']} items={[overdue]} onSelect={vi.fn()} />);

    expect(screen.getByTestId('calendar-event-overdue-1').className).toContain('border-destructive');
  });

  it('does NOT flag a future pending/confirmed appointment as overdue', () => {
    const future: AppointmentRecord = {
      ...baseAppointment,
      id: 'future-1',
      start: '2099-01-01T13:00:00.000Z',
      end: '2099-01-01T14:00:00.000Z',
      status: 'pending',
    };

    render(<TimeGridView days={['2099-01-01']} items={[future]} onSelect={vi.fn()} />);

    expect(screen.getByTestId('calendar-event-future-1').className).not.toContain('border-destructive');
  });

  it('colors a canceled appointment as muted, and a completed one differently from a no-show one', () => {
    const canceled: AppointmentRecord = { ...baseAppointment, id: 'canceled-1', status: 'canceled_by_operator' };
    const completed: AppointmentRecord = { ...baseAppointment, id: 'completed-1', status: 'completed' };
    const noShow: AppointmentRecord = { ...baseAppointment, id: 'no-show-1', status: 'no_show' };

    render(<TimeGridView days={WEEK_DAYS} items={[canceled, completed, noShow]} onSelect={vi.fn()} />);

    expect(screen.getByTestId('calendar-event-canceled-1').className).toContain('bg-muted');
    expect(screen.getByTestId('calendar-event-completed-1').className).toContain('emerald');
    expect(screen.getByTestId('calendar-event-no-show-1').className).toContain('red');
  });

  it('positions two overlapping appointments side by side (no overlap in the layout)', () => {
    const first: AppointmentRecord = { ...baseAppointment, id: 'overlap-1' };
    const second: AppointmentRecord = {
      ...baseAppointment,
      id: 'overlap-2',
      start: '2026-09-16T00:30:00.000Z',
      end: '2026-09-16T01:30:00.000Z',
    };

    render(<TimeGridView days={WEEK_DAYS} items={[first, second]} onSelect={vi.fn()} />);

    const firstStyle = screen.getByTestId('calendar-event-overlap-1').style;
    const secondStyle = screen.getByTestId('calendar-event-overlap-2').style;
    expect(firstStyle.left).not.toBe(secondStyle.left);
    expect(firstStyle.width).toBe('50%');
    expect(secondStyle.width).toBe('50%');
  });

  describe('items that cross midnight (never overflow the day column)', () => {
    const COLUMN_HEIGHT_PX = 24 * 48;
    // Bloqueio real que estourou a grade: 18/09 00:00 -> 19/09 23:59 em SP.
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

    it('renders a multi-day block in every day it covers, each segment clamped to the column', () => {
      render(<TimeGridView days={WEEK_DAYS} items={[twoDayBlock]} onSelect={vi.fn()} />);

      for (const day of ['2026-09-18', '2026-09-19']) {
        const chip = within(screen.getByTestId(`time-grid-day-${day}`)).getByTestId('calendar-event-two-day');
        const top = Number.parseFloat(chip.style.top);
        const height = Number.parseFloat(chip.style.height);
        expect(top).toBe(0);
        expect(top + height).toBeLessThanOrEqual(COLUMN_HEIGHT_PX);
      }
      expect(
        within(screen.getByTestId('time-grid-day-2026-09-20')).queryByTestId('calendar-event-two-day'),
      ).not.toBeInTheDocument();
    });

    it('does not show an item on the next day when it ends exactly at 00:00', () => {
      const untilMidnight: AppointmentRecord = {
        ...twoDayBlock,
        id: 'until-midnight',
        start: '2026-09-18T20:00:00.000Z', // 17:00 em SP
        end: '2026-09-19T03:00:00.000Z', // 19/09 00:00 em SP
      };

      render(<TimeGridView days={WEEK_DAYS} items={[untilMidnight]} onSelect={vi.fn()} />);

      expect(
        within(screen.getByTestId('time-grid-day-2026-09-18')).getByTestId('calendar-event-until-midnight'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('time-grid-day-2026-09-19')).queryByTestId('calendar-event-until-midnight'),
      ).not.toBeInTheDocument();
    });

    it('keeps a short item at the very end of the day inside the column', () => {
      const lateShort: AppointmentRecord = {
        ...baseAppointment,
        id: 'late-short',
        start: '2026-09-19T02:55:00.000Z', // 18/09 23:55 em SP
        end: '2026-09-19T03:00:00.000Z',
      };

      render(<TimeGridView days={WEEK_DAYS} items={[lateShort]} onSelect={vi.fn()} />);

      const chip = screen.getByTestId('calendar-event-late-short');
      expect(Number.parseFloat(chip.style.top) + Number.parseFloat(chip.style.height)).toBeLessThanOrEqual(
        COLUMN_HEIGHT_PX,
      );
    });
  });

  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn();
    render(<TimeGridView days={WEEK_DAYS} items={[baseAppointment]} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('calendar-event-a1'));

    expect(onSelect).toHaveBeenCalledWith(baseAppointment);
  });
});
