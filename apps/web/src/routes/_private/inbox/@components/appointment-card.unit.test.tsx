// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock }));

const { AppointmentCard } = await import('./appointment-card.js');

const UPCOMING_APPOINTMENT = {
  id: 'a1',
  kind: 'appointment',
  professional: 'p1',
  professionalName: 'Dra. Ana',
  customer: 'cust1',
  start: '2099-01-01T13:00:00.000Z',
  end: '2099-01-01T14:00:00.000Z',
  status: 'confirmed',
  source: 'operator',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderCard(customerId = 'cust1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AppointmentCard customerId={customerId} />
      </QueryClientProvider>,
    ),
  };
}

describe('AppointmentCard (T46, spec.md P2 "Agendamento visível no Inbox"/SCH-38)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
  });

  it('Done when: renders nothing when the customer has no upcoming active Appointment', async () => {
    getMock.mockResolvedValue({ success: true, data: null });

    const { container } = renderCard('cust1');

    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the query resolves (no loading flash for this secondary widget)', () => {
    getMock.mockReturnValue(new Promise(() => {})); // never resolves during this test

    const { container } = renderCard('cust1');

    expect(container).toBeEmptyDOMElement();
  });

  it('SCH-38: uses upcomingAppointmentQuery(customerId) and shows date, time, professional and status', async () => {
    getMock.mockResolvedValue({ success: true, data: UPCOMING_APPOINTMENT });

    renderCard('cust1');

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments/upcoming?customer=cust1'));
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText(/2099-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });
});
