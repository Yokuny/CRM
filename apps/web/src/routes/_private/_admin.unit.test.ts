import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((opts: { to: string }) => ({ isRedirect: true as const, ...opts }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, redirect: redirectMock };
});

const { beforeLoad } = await import('./_admin.js');

const sessionWithRoles = (role: string[]) => ({ user: { id: '1', name: 'A', email: 'a@b.com' }, role }) as never;

describe('_admin beforeLoad guard', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('lets an admin through', async () => {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'ensureQueryData').mockResolvedValue(sessionWithRoles(['gestor', 'admin']));

    await expect(beforeLoad({ context: { queryClient } })).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([[['gestor']], [['operador']], [[]]])('redirects a non-admin (%j) to the home page', async (role) => {
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'ensureQueryData').mockResolvedValue(sessionWithRoles(role));

    await expect(beforeLoad({ context: { queryClient } })).rejects.toEqual({ isRedirect: true, to: '/' });
    expect(redirectMock).toHaveBeenCalledWith({ to: '/' });
  });
});
