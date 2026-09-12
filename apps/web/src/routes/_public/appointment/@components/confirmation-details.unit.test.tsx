// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentConfirmationRecord } from '@/query/appointmentConfirmation.js';
import { ConfirmationDetails } from './confirmation-details.js';

afterEach(cleanup);

const baseRecord: AppointmentConfirmationRecord = {
  date: '2026-09-15',
  time: '14:00',
  professionalName: 'Dra. Ana',
  spaceName: 'Sala 1',
  customerName: 'João da Silva',
  status: 'pending',
};

describe('ConfirmationDetails (T42, spec.md SCH-22/SCH-28)', () => {
  it('renders date (with weekday, calendar-only math — never re-interpreting the wall-clock date as a UTC instant), time, professional, space, customer and status', () => {
    render(<ConfirmationDetails record={baseRecord} onConfirm={vi.fn()} onCancel={vi.fn()} isConfirming={false} isCanceling={false} />);

    // 2026-09-15 é uma terça-feira — provado independentemente em
    // displayTime.helper.unit.test.ts (weekdayIndexOfDisplayDate).
    expect(screen.getByText('Terça-feira, 2026-09-15')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('Sala 1')).toBeInTheDocument();
    expect(screen.getByText('João da Silva')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('omits professional/space/customer rows when absent (never renders an empty row)', () => {
    render(
      <ConfirmationDetails
        record={{ date: '2026-09-15', time: '14:00', status: 'pending' }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isConfirming={false}
        isCanceling={false}
      />,
    );

    expect(screen.queryByText('Dra. Ana')).not.toBeInTheDocument();
  });

  it('calls onConfirm/onCancel when the respective button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmationDetails record={baseRecord} onConfirm={onConfirm} onCancel={onCancel} isConfirming={false} isCanceling={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar presença' }));
    fireEvent.click(screen.getByRole('button', { name: 'Não vou comparecer' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both action buttons while a confirm or cancel mutation is pending', () => {
    render(<ConfirmationDetails record={baseRecord} onConfirm={vi.fn()} onCancel={vi.fn()} isConfirming isCanceling={false} />);

    expect(screen.getByRole('button', { name: 'Confirmar presença' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Não vou comparecer' })).toBeDisabled();
  });

  it.each(['completed', 'no_show', 'canceled_by_customer', 'canceled_by_operator'] as const)(
    'hides the action buttons once the status is terminal (%s) — the appointment is no longer actionable',
    (status) => {
      render(
        <ConfirmationDetails
          record={{ ...baseRecord, status }}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isConfirming={false}
          isCanceling={false}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Confirmar presença' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Não vou comparecer' })).not.toBeInTheDocument();
    },
  );

  it('keeps the action buttons visible when the status is already confirmed (confirm is idempotent, cancel still valid, SCH-25/26)', () => {
    render(
      <ConfirmationDetails
        record={{ ...baseRecord, status: 'confirmed' }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isConfirming={false}
        isCanceling={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirmar presença' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não vou comparecer' })).toBeInTheDocument();
  });
});
