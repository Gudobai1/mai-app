import type { MaiState } from './state'

/** "Mostrar concluídos" por módulo (configs.showCompletedByModule). Desligado por padrão: concluídos ficam escondidos. */
export function showCompleted(state: Pick<MaiState, 'configs'>, module: string) {
  return Boolean((state.configs.showCompletedByModule as Record<string, boolean> | undefined)?.[module])
}
