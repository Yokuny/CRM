// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { weeklyScheduleSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Control } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Form } from '@/components/ui/form.js';
import { WeeklyScheduleEditor } from './weekly-schedule-editor.js';

type Window = { weekday: number; start: string; end: string };

const wrapperSchema = z.object({ weeklySchedule: weeklyScheduleSchema });

// T33 Done when: exercita o editor dentro de um `useForm` mínimo com
// `zodResolver(weeklyScheduleSchema)` (spec.md/design.md apontam
// `createProfessionalSchema`, T10 — usar só o pedaço `weeklyScheduleSchema`
// é mais simples e cobre a MESMA validação, já que é o schema exportado que
// o editor de fato precisa satisfazer).
function Wrapper({ defaultValues }: { defaultValues: Window[] }) {
  const form = useForm<{ weeklySchedule: Window[] }>({
    resolver: zodResolver(wrapperSchema),
    defaultValues: { weeklySchedule: defaultValues },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <WeeklyScheduleEditor control={form.control as unknown as Control} name="weeklySchedule" />
        <button type="submit">Validar</button>
      </form>
    </Form>
  );
}

function renderEditor(defaultValues: Window[] = []) {
  return render(<Wrapper defaultValues={defaultValues} />);
}

describe('WeeklyScheduleEditor (T33, spec.md SCH-02/SCH-03/SCH-08)', () => {
  afterEach(() => cleanup());

  it('groups windows under their own weekday (Segunda-feira x Quarta-feira, each showing only its own window)', () => {
    renderEditor([
      { weekday: 1, start: '09:00', end: '12:00' },
      { weekday: 3, start: '14:00', end: '18:00' },
    ]);

    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    const wednesdayGroup = screen.getByTestId('weekly-schedule-weekday-3');

    expect(within(mondayGroup).getByText('Segunda-feira')).toBeInTheDocument();
    expect(within(mondayGroup).getAllByLabelText('Início')[0]).toHaveValue('09:00');
    expect(within(mondayGroup).getAllByLabelText('Fim')[0]).toHaveValue('12:00');
    expect(within(mondayGroup).queryByDisplayValue('14:00')).not.toBeInTheDocument();

    expect(within(wednesdayGroup).getByText('Quarta-feira')).toBeInTheDocument();
    expect(within(wednesdayGroup).getAllByLabelText('Início')[0]).toHaveValue('14:00');
    expect(within(wednesdayGroup).getAllByLabelText('Fim')[0]).toHaveValue('18:00');
  });

  it('adding a window via a weekday group\'s "Adicionar" button appends an empty HH:mm row under that weekday', async () => {
    const user = userEvent.setup();
    renderEditor([]);

    const tuesdayGroup = screen.getByTestId('weekly-schedule-weekday-2');
    expect(within(tuesdayGroup).queryAllByLabelText('Início')).toHaveLength(0);

    await user.click(within(tuesdayGroup).getByRole('button', { name: 'Adicionar' }));

    expect(within(tuesdayGroup).getAllByLabelText('Início')).toHaveLength(1);
    expect(within(tuesdayGroup).getAllByLabelText('Início')[0]).toHaveValue('');
    expect(within(tuesdayGroup).getAllByLabelText('Fim')[0]).toHaveValue('');
  });

  it('removing a window via its "Remover" button drops that row from the weekday group', async () => {
    const user = userEvent.setup();
    renderEditor([{ weekday: 1, start: '09:00', end: '12:00' }]);

    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    expect(within(mondayGroup).getAllByLabelText('Início')).toHaveLength(1);

    await user.click(within(mondayGroup).getByRole('button', { name: 'Remover' }));

    expect(within(mondayGroup).queryAllByLabelText('Início')).toHaveLength(0);
  });

  it("start/end inputs are wired to the array item (editing start updates that window's value)", () => {
    renderEditor([{ weekday: 1, start: '09:00', end: '12:00' }]);

    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    fireEvent.change(within(mondayGroup).getAllByLabelText('Início')[0] as HTMLElement, {
      target: { value: '10:00' },
    });

    expect(within(mondayGroup).getAllByLabelText('Início')[0]).toHaveValue('10:00');
  });

  it('T10 overlap superRefine: two overlapping windows on the same weekday render "janelas sobrepostas no mesmo weekday" via FormMessage', async () => {
    const user = userEvent.setup();
    renderEditor([
      { weekday: 1, start: '09:00', end: '12:00' },
      { weekday: 1, start: '11:00', end: '13:00' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('janelas sobrepostas no mesmo weekday')).toBeInTheDocument();
  });

  it('T10 format refine: end <= start on a single window renders "end deve ser maior que start" via FormMessage', async () => {
    const user = userEvent.setup();
    renderEditor([{ weekday: 1, start: '12:00', end: '09:00' }]);

    await user.click(screen.getByRole('button', { name: 'Validar' }));

    await waitFor(() => expect(screen.getByText('end deve ser maior que start')).toBeInTheDocument());
  });
});
