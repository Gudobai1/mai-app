import { askChoice } from './ConfirmDialog'

/** Aviso padrão quando há alterações não salvas. */
export async function askUnsaved(_what = 'item'): Promise<'save' | 'discard' | 'stay'> {
  const answer = await askChoice({
    title: 'Salvar alterações?',
    message: 'Você fez alterações que ainda não foram salvas. Quer salvar antes de sair?',
    confirmLabel: 'Salvar',
    extraLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    tone: 'default',
    icon: 'edit',
  })
  return answer === 'confirm' ? 'save' : answer === 'extra' ? 'discard' : 'stay'
}
