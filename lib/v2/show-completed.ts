import type { MaiState } from './state'

/** Módulos em que o concluído permanece no lugar por padrão (o usuário pode desligar no menu). */
const KEEP_BY_DEFAULT = new Set(['today', 'upcoming'])

/** "Mostrar concluídos" por módulo (configs.showCompletedByModule). Desligado por padrão, exceto Hoje e Em breve. */
export function showCompleted(state: Pick<MaiState, 'configs'>, module: string) {
  const value = (state.configs.showCompletedByModule as Record<string, boolean> | undefined)?.[module]
  return value === undefined ? KEEP_BY_DEFAULT.has(module) : Boolean(value)
}
