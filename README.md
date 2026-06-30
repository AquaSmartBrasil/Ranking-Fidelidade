# Conta Azul Dashboard

App privado para conectar com a API da Conta Azul via OAuth 2.0, sincronizar dados de vendas e financeiro no Supabase e exibir um dashboard atualizado.

## Stack

- Next.js 15 + App Router + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth)
- Vercel (deploy)
- Conta Azul API (OAuth 2.0)

## Fase atual

**Fase 1 — Backend e conexão OAuth**

O objetivo desta fase é:

```
Conectar → Salvar token → Verificar status → Preparar sync → Depois criar dashboard
```

## Setup rápido

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o `.env.example` e preencha:

```bash
cp .env.example .env.local
```

Preencha os valores no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

CONTA_AZUL_CLIENT_ID=xxxxx
CONTA_AZUL_CLIENT_SECRET=xxxxx
CONTA_AZUL_REDIRECT_URI=http://localhost:3000/api/conta-azul/callback

CONTA_AZUL_AUTH_URL=xxxxx
CONTA_AZUL_TOKEN_URL=xxxxx
CONTA_AZUL_API_BASE_URL=xxxxx

APP_URL=http://localhost:3000
```

### 3. Criar banco no Supabase

Execute o arquivo `db/schema.sql` no SQL Editor do Supabase.

### 4. Rodar localmente

```bash
npm run dev
```

Abra: [http://localhost:3000/integrations](http://localhost:3000/integrations)

## Segurança

**Nunca exponha no front-end:**
- `SUPABASE_SERVICE_ROLE_KEY`
- `CONTA_AZUL_CLIENT_SECRET`
- `access_token`
- `refresh_token`

**Nunca commite:**
- `.env.local`
- `.env.production`
- `.env.development`

## Rotas disponíveis

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/conta-azul/connect` | GET | Inicia OAuth com Conta Azul |
| `/api/conta-azul/callback` | GET | Recebe code e salva token |
| `/api/conta-azul/status` | GET | Verifica se está conectado |
| `/api/conta-azul/refresh` | POST | Renova o access_token |
| `/api/sync/all` | POST | Placeholder — sync completa |
| `/api/sync/customers` | POST | Placeholder — sync clientes |
| `/api/sync/products` | POST | Placeholder — sync produtos |
| `/api/sync/sales` | POST | Placeholder — sync vendas |
| `/api/sync/receivables` | POST | Placeholder — sync recebíveis |

## Fases do projeto

1. **Fase 1** ✅ — Backend e conexão OAuth
2. **Fase 2** — Sync manual real (clientes, produtos, vendas, recebíveis)
3. **Fase 3** — Dashboard simples com cards
4. **Fase 4** — Tela de conciliação
5. **Fase 5** — Automação (cron, alertas, retries)

## Documentação

- [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
- [docs/SETUP_CHECKLIST.md](docs/SETUP_CHECKLIST.md)
- [docs/API_CREDENTIALS_TEMPLATE.md](docs/API_CREDENTIALS_TEMPLATE.md)
