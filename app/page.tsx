import { MaiV2ParityShell } from './v2/MaiV2ParityShell'

// A entrada é decidida no navegador (sessão guardada em MaiV2ParityShell). Antes o servidor mandava para /login sempre que o cookie
// do Google faltava; no app Android esse cookie podia não estar lá e o usuário caía num ciclo de login. Sem o cookie só os recursos
// do Google (Drive e Agenda) pedem para reconectar, nas configurações.
export default function Page() {
  return <MaiV2ParityShell />
}
