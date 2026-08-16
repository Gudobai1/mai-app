# MAI — port fiel para Vercel + Supabase

Esta versão preserva a interface original do MAI. O `public/mai.html` usa uma ponte compatível com `google.script.run`, mantém o CRUD instantâneo no navegador e sincroniza o estado com o Supabase.

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Supabase

1. Crie um projeto Supabase.
2. Execute as migrations da pasta `supabase/migrations`.
3. Copie `.env.example` para `.env.local` e preencha as chaves.
4. Entre em `/login` para obter uma sessão e sincronizar o estado.

## Google Drive e Google Agenda

A integração real usa OAuth 2.0 server-side. Os tokens ficam criptografados em cookie HTTP-only e nunca são enviados ao JavaScript do MAI nem salvos no GitHub.

### Google Cloud

1. Crie ou selecione um projeto no Google Cloud Console.
2. Ative **Google Drive API** e **Google Calendar API**.
3. Configure a tela de consentimento OAuth como uso externo em modo de teste.
4. Adicione somente sua conta Google em **Test users**.
5. Crie um cliente OAuth do tipo **Web application**.
6. Cadastre a URI autorizada:
   `https://SEU-DOMINIO.vercel.app/api/google/callback`

### Vercel

Cadastre estas Environment Variables para Production, Preview e Development:

- `NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO.vercel.app`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Gere `GOOGLE_TOKEN_ENCRYPTION_KEY` com um valor longo e aleatório. Nunca salve os valores reais em arquivos versionados.

Depois de publicar, abra o MAI e clique em **Conectar Google Drive e Agenda**. O Google solicitará acesso uma vez e devolverá um refresh token para uso contínuo.

## Arquitetura de dados

- Tarefas, hábitos, notas, finanças, metas e saúde: Supabase + cache local.
- Arquivos e pastas: Google Drive real.
- Compromissos: Google Agenda real.
- Interface e APIs: Vercel.
- Código e histórico: GitHub.

## Compatibilidade

`public/web-rpc-adapter.js` mantém a interface RPC usada pelo app original. `public/google-rpc-overrides.js` substitui somente os métodos de Drive e Agenda após o carregamento, permitindo migrar sem redesenhar o sistema inteiro.
