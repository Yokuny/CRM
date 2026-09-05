// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('../../lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
// useLocation/useMatches/useRouter: dependências do Card asPage (T8) — sem
// <RouterProvider> nestes testes isolados de página, os hooks reais do
// TanStack Router lançam. Mocks mínimos só para não quebrar o render; o
// comportamento de breadcrumb/back-button do Card não é escopo destes testes.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { AuthPage } = await import('./index.js');

describe('AuthPage', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('submits the form and redirects to the private area on a successful login (FND-10/AC2)', async () => {
    postMock.mockResolvedValue({ success: true, message: 'Login realizado com sucesso.' });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('E-mail'), 'admin@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senhaCorreta123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/signin', {
        email: 'admin@empresa.com',
        password: 'senhaCorreta123',
      });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/' }));
  });

  it("renders the backend's ApiResponse message on login failure, never a raw error (FND-10/AC4)", async () => {
    postMock.mockResolvedValue({ success: false, message: 'E-mail ou senha inválidos.' });
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.type(screen.getByLabelText('E-mail'), 'admin@empresa.com');
    await user.type(screen.getByLabelText('Senha'), 'senhaErrada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
