import { t } from '../lib/helpers/translate.helper.js';

// SPEC_DEVIATION: versão mínima de <DefaultLoading /> — sem spinner/animação
// do design system completo (feature 4, fora de escopo). Só a convenção:
// todo estado de requisição pendente usa este componente, nunca um texto ad
// hoc por tela.
export function DefaultLoading() {
  return <p role="status">{t('loading')}</p>;
}
