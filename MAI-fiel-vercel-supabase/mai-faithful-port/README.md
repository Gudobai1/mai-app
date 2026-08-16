# MAI — port fiel para Vercel + Supabase

Esta versão tem uma regra deliberada: **não redesenhar o MAI**. O `public/mai.html` é montado a partir dos arquivos originais enviados (Index, Design, Tarefas, Agenda, Hábitos, Metas, Finanças, Saúde, Notas e Drive). A mudança principal está na ponte de dados: em vez de `google.script.run` chamar Apps Script, `public/web-rpc-adapter.js` fornece a mesma interface e persiste o estado instantaneamente no navegador, com sincronização opcional para Supabase.

## Testar agora

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem Supabase configurado, o aplicativo funciona em modo local e mantém os dados no navegador. Isso é intencional para permitir testar aparência, navegação e fluxos sem bloquear a UI por rede.

## Supabase

1. Crie um projeto Supabase.
2. Execute `supabase/migrations/0001_mai_state.sql`.
3. Copie `.env.example` para `.env.local` e preencha as chaves.
4. Quando houver token de sessão em `localStorage['mai-supabase-access-token']`, `/api/state` sincroniza o snapshot do MAI com a linha do usuário.

A tabela `mai_state` é uma camada de compatibilidade. Ela preserva o formato atual primeiro. A normalização em tabelas relacionais deve acontecer depois da paridade funcional, módulo por módulo.

## Arquivos originais preservados

A aparência e o JavaScript dos módulos foram incorporados ao HTML consolidado sem reescrever os componentes. Isso evita repetir o erro do primeiro protótipo, que substituiu a identidade e os fluxos do sistema por uma interface genérica.

## Limites desta primeira transferência

As integrações que dependem de APIs Google (Google Calendar real e Google Drive real) continuam visualmente presentes, mas o adaptador local usa agenda/arquivos internos enquanto OAuth do Google não estiver configurado. O restante dos módulos usa a interface RPC compatível para CRUD local imediato.
