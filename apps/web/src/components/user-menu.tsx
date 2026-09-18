import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';
import { type TextSize, useTextSize } from '@/hooks/useTextSize.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type SessionView, sessionKeys } from '@/query/session.js';
import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';

// Conteúdo real do menu (sessão via cache, mutation de logout, tema,
// tamanho do texto) só monta com o menu aberto — ver comentário em
// UserMenu abaixo sobre por que isso importa para os testes de página.
function UserMenuContent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { textSize, setTextSize } = useTextSize();
  const session = queryClient.getQueryData<SessionView>(sessionKeys.detail());

  const signoutMutation = useMutation({
    mutationFn: async () => {
      const res = await post('/auth/signout');
      if (!res.success) throw new Error(res.message ?? t('action_error'));
    },
    onSuccess: () => {
      // Limpa tudo — dados do tenant/usuário anterior não podem sobreviver
      // no cache para a próxima sessão (outro usuário pode logar em seguida
      // no mesmo navegador).
      queryClient.clear();
      navigate({ to: '/auth' });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      {session && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col items-start gap-0.5 py-2">
              <span className="font-medium text-foreground">{session.user.name}</span>
              <span className="text-muted-foreground">{session.user.email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}

      {/* DropdownMenuLabel (Menu.GroupLabel) só é válido dentro de
          Menu.Group/Menu.RadioGroup (MenuGroupContext) — por isso o label
          entra DENTRO do RadioGroup, não antes dele. */}
      <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
        <DropdownMenuLabel>{t('theme')}</DropdownMenuLabel>
        <DropdownMenuRadioItem value="light">
          <Sun />
          {t('light')}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <Moon />
          {t('dark')}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <Monitor />
          {t('system')}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />

      <DropdownMenuRadioGroup value={textSize} onValueChange={(value) => setTextSize(value as TextSize)}>
        <DropdownMenuLabel>{t('text_size')}</DropdownMenuLabel>
        <DropdownMenuRadioItem value="sm">{t('small')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="md">{t('medium')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="lg">{t('large')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />

      <DropdownMenuItem variant="destructive" onClick={() => signoutMutation.mutate()}>
        <LogOut />
        {t('sign_out')}
      </DropdownMenuItem>
    </>
  );
}

// No lugar do antigo CardDescription (components/ui/card.tsx) na barra de
// breadcrumb de toda `Card asPage`. `open` controlado: `UserMenuContent` só
// monta quando o menu abre, então `useQueryClient`/`useMutation` (que
// lançam sem um <QueryClientProvider> ancestral) nunca rodam nos testes de
// página que renderizam o componente isolado e nunca clicam no trigger
// (ex.: customers/index.unit.test.tsx, schedule/index.unit.test.tsx,
// processes/index.unit.test.tsx — nenhum deles envolve QueryClientProvider).
export function UserMenu() {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={<Button variant="basic" aria-label={t('user_menu')} />}>
        <UserRound />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{open && <UserMenuContent />}</DropdownMenuContent>
    </DropdownMenu>
  );
}
