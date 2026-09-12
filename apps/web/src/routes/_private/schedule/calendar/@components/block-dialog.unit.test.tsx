// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppointmentRecord } from '@/query/appointment.js';

// Radix Select chama APIs que o jsdom não implementa — mesmo polyfill mínimo
// de appointment-dialog.unit.test.tsx (T40)/processes/add/index.unit.test.tsx.
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
const delMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock, del: delMock }));

const { toast } = await import('sonner');
const { BlockDialog } = await import('./block-dialog.js');

// idSchema (@crm/contracts) exige exatamente 24 chars hex — mesmo cuidado de
// appointment-dialog.unit.test.tsx (T40): um id curto tipo 'p1' falharia a
// validação real do createBlockSchema.
const PROFESSIONAL_ID = '507f1f77bcf86cd799439012';
const PROFESSIONALS = { items: [{ id: PROFESSIONAL_ID, name: 'Dra. Ana', slotDurationMinutes: 60, active: true }], total: 1 };

const mockLookups = () => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/professionals')) return Promise.resolve({ success: true, data: PROFESSIONALS });
    return Promise.resolve({ success: true, data: { items: [], total: 0 } });
  });
};

function renderDialog(props: { block?: AppointmentRecord; onOpenChange?: (open: boolean) => void }) {
  const queryClient = new QueryClient();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <BlockDialog open onOpenChange={onOpenChange} block={props.block} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const existingBlock: AppointmentRecord = {
  id: 'b1',
  kind: 'block',
  professional: PROFESSIONAL_ID,
  professionalName: 'Dra. Ana',
  title: 'Almoço',
  start: '2026-09-16T15:00:00.000Z',
  end: '2026-09-16T16:00:00.000Z',
  status: 'confirmed',
  source: 'operator',
  createdAt: '',
  updatedAt: '',
};

describe('BlockDialog — create mode (T41, spec.md SCH-33)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    delMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('creates a block via zodResolver(createBlockSchema) and createBlockMutation (POST /appointments/blocks)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: existingBlock });
    const user = userEvent.setup();

    renderDialog({});

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Dra. Ana' }));
    await user.type(screen.getByLabelText('Título'), 'Almoço');
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de início'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Data de fim'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de fim'), { target: { value: '13:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/appointments/blocks', {
        professionalId: PROFESSIONAL_ID,
        title: 'Almoço',
        startDate: '2026-09-16',
        startTime: '12:00',
        endDate: '2026-09-16',
        endTime: '13:00',
      }),
    );
  });

  it('rejects an end before the start (createBlockSchema refine) — POST never called', async () => {
    mockLookups();
    const user = userEvent.setup();

    renderDialog({});

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Dra. Ana' }));
    await user.type(screen.getByLabelText('Título'), 'Almoço');
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de início'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('Data de fim'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de fim'), { target: { value: '12:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('o fim do bloqueio deve ser depois do início')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('shows a toast when the create mutation fails (e.g. 409 overlap)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: false, message: 'Horário sobreposto' });
    const user = userEvent.setup();

    renderDialog({});

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Dra. Ana' }));
    await user.type(screen.getByLabelText('Título'), 'Almoço');
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de início'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Data de fim'), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText('Hora de fim'), { target: { value: '13:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Horário sobreposto'));
  });
});

describe('BlockDialog — existing block mode (T41, spec.md SCH-33)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    delMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('shows the block info (title, date/time, professional)', () => {
    mockLookups();

    renderDialog({ block: existingBlock });

    expect(screen.getByRole('heading', { name: 'Almoço' })).toBeInTheDocument();
    expect(screen.getByText(/2026-09-16/)).toBeInTheDocument();
    expect(screen.getByText(/12:00–13:00/)).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
  });

  it('removes the block via deleteBlockMutation (DELETE /appointments/blocks/:id)', async () => {
    mockLookups();
    delMock.mockResolvedValue({ success: true, data: { deleted: true } });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderDialog({ block: existingBlock, onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Remover bloqueio' }));

    await waitFor(() => expect(delMock).toHaveBeenCalledWith('/appointments/blocks/b1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows a toast when the delete mutation fails', async () => {
    mockLookups();
    delMock.mockResolvedValue({ success: false, message: 'Bloqueio não encontrado' });
    const user = userEvent.setup();

    renderDialog({ block: existingBlock });

    await user.click(screen.getByRole('button', { name: 'Remover bloqueio' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bloqueio não encontrado'));
  });
});
