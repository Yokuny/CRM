// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '@/query/appointment.js';

// Radix Select chama APIs que o jsdom não implementa — mesmo polyfill mínimo
// de processes/add/index.unit.test.tsx (primeiro precedente de um teste de
// rota usando o Select ported).
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { toast } = await import('sonner');
const { AppointmentDialog } = await import('./appointment-dialog.js');

// idSchema (@crm/contracts) exige exatamente 24 chars hex — 'c1'/'p1' curtos
// falhariam a validação real do createAppointmentSchema (não é um detalhe
// de mock: o schema é o mesmo usado em produção).
const CUSTOMER_ID = '507f1f77bcf86cd799439011';
const PROFESSIONAL_ID = '507f1f77bcf86cd799439012';
const SPACE_ID = '507f1f77bcf86cd799439013';

const CUSTOMERS = { items: [{ id: CUSTOMER_ID, name: 'João da Silva' }], total: 1 };
const PROFESSIONALS = {
  items: [{ id: PROFESSIONAL_ID, name: 'Dra. Ana', slotDurationMinutes: 60, active: true }],
  total: 1,
};
const SPACES = { items: [{ id: SPACE_ID, name: 'Sala 1', active: true }], total: 1 };

const mockLookups = () => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/customers')) return Promise.resolve({ success: true, data: CUSTOMERS });
    if (path.startsWith('/professionals')) return Promise.resolve({ success: true, data: PROFESSIONALS });
    if (path.startsWith('/spaces')) return Promise.resolve({ success: true, data: SPACES });
    return Promise.resolve({ success: true, data: { items: [], total: 0 } });
  });
};

function renderDialog(props: {
  appointment?: AppointmentRecord;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const queryClient = new QueryClient();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AppointmentDialog open={props.open ?? true} onOpenChange={onOpenChange} appointment={props.appointment} />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

const futureAppointment: AppointmentRecord = {
  id: 'a1',
  kind: 'appointment',
  professional: 'p1',
  professionalName: 'Dra. Ana',
  customer: 'c1',
  customerName: 'João da Silva',
  start: '2099-01-01T13:00:00.000Z',
  end: '2099-01-01T14:00:00.000Z',
  status: 'pending',
  source: 'operator',
  createdAt: '',
  updatedAt: '',
};

const pastAppointment: AppointmentRecord = {
  ...futureAppointment,
  id: 'a2',
  start: '2020-01-01T13:00:00.000Z',
  end: '2020-01-01T14:00:00.000Z',
};

describe('AppointmentDialog — create mode (T40, spec.md SCH-30)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('validates via createAppointmentSchema and calls createAppointmentMutation (POST /appointments) with the filled fields', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: futureAppointment });
    const user = userEvent.setup();

    renderDialog({});

    const comboboxes = await screen.findAllByRole('combobox');
    await user.click(comboboxes[0] as HTMLElement); // cliente
    await user.click(await screen.findByRole('option', { name: 'João da Silva' }));
    await user.click(comboboxes[1] as HTMLElement); // profissional
    await user.click(await screen.findByRole('option', { name: 'Dra. Ana' }));

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '10:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/appointments', {
        customerId: CUSTOMER_ID,
        professionalId: PROFESSIONAL_ID,
        date: '2026-09-16',
        time: '10:00',
        spaceId: undefined,
        notes: undefined,
      }),
    );
  });

  it('rejects submission when required fields (customerId/professionalId/date/time) are missing — POST never called', async () => {
    mockLookups();
    const user = userEvent.setup();

    renderDialog({});
    await screen.findAllByRole('combobox');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // customerId e professionalId ficam vazios ('') e falham na MESMA regra
    // (idSchema, "id inválido") — daí os 2 elementos.
    expect(await screen.findAllByText('id inválido')).toHaveLength(2);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('shows a toast when the create mutation fails (e.g. 409 overlap, SCH-30)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: false, message: 'Horário sobreposto' });
    const user = userEvent.setup();

    renderDialog({});
    const comboboxes = await screen.findAllByRole('combobox');
    await user.click(comboboxes[0] as HTMLElement);
    await user.click(await screen.findByRole('option', { name: 'João da Silva' }));
    await user.click(comboboxes[1] as HTMLElement);
    await user.click(await screen.findByRole('option', { name: 'Dra. Ana' }));
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '10:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Horário sobreposto'));
  });
});

describe('AppointmentDialog — detail/action mode (T40, spec.md SCH-31/32/34/37)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('shows the appointment info: customer, professional, date/time (DISPLAY_TIMEZONE) and status', async () => {
    mockLookups();

    renderDialog({ appointment: futureAppointment });

    // O nome do cliente vira o próprio título do diálogo (customerName), não
    // se repete no bloco de info. O bloco de info é escopado (data-testid)
    // porque o Select de remarcação também renderiza o nome do profissional
    // atual como rótulo do valor selecionado ("manter o mesmo") — sem
    // escopo, `getByText('Dra. Ana')` bateria em 2 elementos.
    expect(screen.getByRole('heading', { name: 'João da Silva' })).toBeInTheDocument();
    const info = within(screen.getByTestId('appointment-detail-info'));
    expect(info.getByText('Dra. Ana')).toBeInTheDocument();
    expect(info.getByText(/2099-01-01/)).toBeInTheDocument();
    expect(info.getByText(/10:00–11:00/)).toBeInTheDocument();
    expect(info.getByText('Pendente')).toBeInTheDocument();
  });

  it('cancels the appointment with the optional reason via cancelAppointmentMutation (POST /appointments/:id/cancel)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: { ...futureAppointment, status: 'canceled_by_operator' } });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderDialog({ appointment: futureAppointment, onOpenChange });

    await user.type(screen.getByPlaceholderText('Motivo (opcional)'), 'Cliente pediu para remarcar');
    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Cliente pediu para remarcar' }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('reschedules the appointment via rescheduleAppointmentMutation (POST /appointments/:id/reschedule), zodResolver(rescheduleAppointmentSchema)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: futureAppointment });
    const user = userEvent.setup();

    renderDialog({ appointment: futureAppointment });

    // O único par data/hora editável da tela é o do form de remarcação (o
    // bloco de info acima é texto puro, não <input>) — já vem pré-preenchido
    // com o horário atual do agendamento (formatDisplayDate/Time, T38).
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2099-02-01' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '11:00' } });

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/appointments/a1/reschedule', { date: '2099-02-01', time: '11:00' }),
    );
  });

  it('disables the attendance controls when the appointment start is still in the future (SCH-34)', async () => {
    mockLookups();

    renderDialog({ appointment: futureAppointment });

    expect(screen.getByRole('button', { name: 'Compareceu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Não compareceu' })).toBeDisabled();
  });

  it('enables the attendance controls once the appointment start has passed, and marks attendance via markAttendanceMutation', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: { ...pastAppointment, status: 'completed' } });
    const user = userEvent.setup();

    renderDialog({ appointment: pastAppointment });

    const completedButton = screen.getByRole('button', { name: 'Compareceu' });
    expect(completedButton).not.toBeDisabled();

    await user.click(completedButton);

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/appointments/a2/attendance', { status: 'completed' }));
  });

  it('requests a confirmation link and opens the returned wa.me URL in a new tab (SCH-37)', async () => {
    mockLookups();
    postMock.mockResolvedValue({
      success: true,
      data: {
        confirmationUrl: 'https://app.example.com/appointment?token=abc',
        waMeUrl: 'https://wa.me/5511999999999?text=oi',
      },
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    renderDialog({ appointment: futureAppointment });

    await user.click(screen.getByRole('button', { name: 'Pedir confirmação' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/appointments/a1/confirmation-link'));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://wa.me/5511999999999?text=oi', '_blank', 'noreferrer'),
    );
    openSpy.mockRestore();
  });

  it('shows a toast on a 409-shaped mutation failure (e.g. cancel on a terminal appointment)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: false, message: 'Agendamento em estado terminal' });
    const user = userEvent.setup();

    renderDialog({ appointment: futureAppointment });

    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Agendamento em estado terminal'));
  });
});
