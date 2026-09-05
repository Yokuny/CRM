// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const navigateMock = vi.fn();
const searchMock = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => navigateMock, useSearch: () => searchMock() };
});

const { InvitePage } = await import('./index.js');

const renderInvitePage = () => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <InvitePage />
    </QueryClientProvider>,
  );
};

describe('InvitePage', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it('shows a fallback message without crashing when the token search param is missing (FND-10/AC1)', () => {
    searchMock.mockReturnValue({});

    renderInvitePage();

    expect(screen.getByText('Link de convite inválido.')).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('renders the 410 message from the ApiResponse for an invalid/expired token, without breaking the screen', async () => {
    searchMock.mockReturnValue({ token: 'expired-token' });
    getMock.mockResolvedValue({ success: false, message: 'Este convite expirou.' });

    renderInvitePage();

    expect(await screen.findByText('Este convite expirou.')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/invites/expired-token');
  });

  it('shows the tenant name and email from GET /invites/:token before rendering the form, for a valid token (FND-10/AC1)', async () => {
    searchMock.mockReturnValue({ token: 'valid-token' });
    getMock.mockResolvedValue({
      success: true,
      data: { tenantName: 'Empresa X', email: 'convidado@empresa.com' },
      message: '',
    });

    renderInvitePage();

    expect(await screen.findByText(/Empresa X/)).toBeInTheDocument();
    expect(screen.getByText('convidado@empresa.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });
});
