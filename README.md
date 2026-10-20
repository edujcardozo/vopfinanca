# VPO · Você Precisa de um Orçamento

## Publicação independente no Netlify

O repositório de publicação é [edujcardozo/vopfinanca](https://github.com/edujcardozo/vopfinanca), branch `main`. O `netlify.toml` executa `npm test && npm run build:standalone`, publica `dist-independent` e inclui `netlify/functions`. A versão independente usa login por e-mail e Supabase; confira [a configuração](standalone/README.md) e [as assinaturas Asaas](standalone/ASSINATURAS.md).

`standalone/deployment.json` registra o destino e o estado verificado da publicação automática. `scripts/export-github.mjs` prepara somente os arquivos rastreados para o conector autenticado, com hashes de conteúdo e sem a identidade interna da hospedagem anterior. Nenhuma credencial de GitHub, Netlify ou Asaas faz parte desse export. Atualizações neste projeto devem ser enviadas à branch `main` desse repositório após as verificações, para o Netlify publicar quando o vínculo estiver ativo.

O vínculo ao Netlify ainda está pendente. O SMTP e a homologação do Asaas continuam necessários antes de liberar o uso comercial. A configuração atual é R$ 12,90/mês após 15 dias grátis, com cobranças desativadas.

A tela independente agora separa entrar, criar conta e aceitar convite. Novos planos pessoais aguardam liberação manual em Ajustes; a fila de avisos para `edujcardozo@gmail.com` usa funções Netlify e Resend, ainda dependentes da configuração privada do envio. Consulte [cadastros e aprovação](standalone/CADASTROS.md).

Para começar sem domínio próprio, os avisos também aceitam Gmail SMTP com senha de app. A configuração continua privada nas funções, preserva a fila de aprovação e está descrita em [envio pelo Gmail](standalone/GMAIL.md). Não há envio real ativado sem configurar as credenciais nos painéis seguros.

An independent Portuguese-language design study based on the current YNAB marketing website, with a usable account-synced budget planner. Created for Edu on 2026-10-18. It is not affiliated with YNAB and does not collect credentials or connect to the official service.

## Experience

- Responsive marketing page, real navigation and interactive category/planning preview.
- Dedicated mobile budget layout: bottom navigation, bottom-sheet forms, 16px inputs, safe-area support and quick transaction entry.
- Manual income and expense entries with a payee, optional memo, a persistent synced payee registry with accent-insensitive searchable combobox and remembered category suggestions, editing, editable monthly category allocations, automatic allocation, monthly navigation and carryover.
- A fixed-width, accessible native date-picker overlay with Brazilian date display and Today/Yesterday shortcuts; existing records and version-1 backups remain compatible.
- Reflect-style reports: income vs expenses, spending breakdown, stacked spending trends, manually completed net worth, disclosed cash-age estimate, planned spending progress and CSV export. Period and group filters, exact tables, keyboard/touch selection and hidden-amount handling are included.
- Touch/mouse drag handles in Organizar mode reorder entire groups and categories, including moving categories between groups. Live insertion preview, edge scrolling, reduced-motion support, Escape/pointer cancellation, and keyboard arrows are included. Ordering saves through the existing account sync.
- Balance visibility toggle and undo for transaction deletion.
- Editable category groups with stable identifiers: create, rename, add categories directly into a group and move existing categories between groups without altering their transaction history. Legacy plans automatically receive the three original groups; custom and empty groups survive export/import.
- Validated JSON backup import/export; automatic account synchronization with a local offline queue. No bank integration.
- Desktop transaction entry opens directly above the transaction list, with date/payee/category/value columns, optional memo, Cancel/Save/Save and add another, and logical keyboard order. Mobile retains the bottom sheet. Explicit payees from legacy plans are migrated without treating old descriptions as invented stores. Saved payees survive deletion of their last transaction and sync as independent entries.
- Native web app manifest and home screen icons. Network access is required to load the site; offline availability is not promised.

## Implementation

HTML/CSS/native ES modules, embedded in a lightweight ESM Worker. No production JavaScript dependencies, analytics, tracking, external fonts at runtime, account signup or subscription. Money is stored and calculated as integer centavos. Incoming backups are validated and reconstructed from allowed fields. User-provided text is escaped before rendering.

Frontend source is in `web/`; API is in `server/`, Worker entrypoint in `worker/`. Run `npm run build` to embed assets into `dist/server/index.js`. Hosting identity and D1 binding are declared in `.openai/hosting.json`. Drizzle schema-only migrations are committed in `drizzle/` and applied by Sites during deployment. Deployment uses the Sites source workflow.

## Verification

Run `npm test`, `node --check web/app.js` and `npm run build`.

Covered: Brazilian amount parsing, precise ledger arithmetic, allocation conservation, negative balances, overspending coverage, monthly carryover, backup validation and calendar boundaries. Local HTML anchors, asset paths, duplicate IDs and CSS brace balance were checked. Browser visual and device QA were unavailable in this session; they remain unverified.

## Privacy and backups

The platform-provided stable authenticated user ID identifies each account. D1 memberships authorize the active personal or shared plan; document fields cannot grant access or choose an arbitrary owner. Revision checks prevent stale overwrites; independent changes merge by stable record IDs, while conflicting edits pause for review and keep recovery copies. Mutations are idempotent, and document hashes detect incomplete cloud data.

The browser retains its plan under `ynab-edu-plan-v1`, plus a durable pending queue. Changes upload automatically and active devices check a lightweight revision endpoint every two seconds and on focus/reconnection. Open the original device first to migrate existing local entries; wait for “Sincronizado” before clearing browser data. Other devices use the same Site URL. The same account opens its active plan; a second account must accept an explicit sharing invitation to access the same data. An already populated unrelated browser plan requires a choice instead of silently replacing either copy. Hidden-balance preference remains device-local. JSON backups remain available.

Visual assets and source references are documented in `SOURCES.md`.

## Reports and metric limits

Reports use actual stored entries, never generated history. Group filters affect only spending charts. Income and expenses are all manual cash-style entries; the app has no credit-card/transfer/starting-balance account taxonomy. Net worth is unavailable until the user explicitly records external assets and debt. It then combines those snapshots with the plan cash balance, carrying snapshots forward until replaced and treating a negative plan balance as a liability. Snapshot changes never create income or expenses.

Cash age is clearly marked as an estimate: FIFO income buckets fund outflows, each outflow gets an amount-weighted elapsed age, and the last ten fully explained outflows are averaged. It is not a certified reproduction of YNAB Age of Money, and all recorded transactions are treated as cash. Unexplained funding prevents the indicator from appearing.

Synchronization tests exercise the API against SQLite with the real generated migration, including user isolation, stale revisions, retries after lost responses, Unicode chunk integrity, offline restart recovery and two-device convergence. Browser/device end-to-end QA remains unverified.

## Typography and input verification · 2026-10-19

The public YNAB marketing CSS declares Figtree variable (300–900) and Wishfarm. Retained fonts are now served as WOFF2 with the same glyph outlines, Portuguese characters and variable weight axis, totaling 60,016 bytes instead of 124,916 bytes. UI labels use Figtree at readable sizes; decorative display type remains on the landing page. No forced antialiasing or CSS scaling is used.

DOM unit tests cover pointer capture on the stationary list, moving groups/categories across parents, cancellation, combobox keyboard and click selection, text escaping, desktop/mobile form selection, category suggestion and save-and-add-another without duplicate entries. Native browser/device visual and touch QA remains unavailable.

## Automatic category icons · 2026-10-19

Category icons are inferred locally from Portuguese category names (accent/case insensitive, whole-word matching). Existing categories display the inferred icon consistently in budget, transactions, selectors and reports; new and renamed categories save the inferred icon. Create/edit forms show a live preview. More specific terms such as insurance and fuel take priority over generic car terms; an explicit emoji in the category name wins. Unrecognized names use a neutral folder. No category data is sent to an external inference service.

Payee suggestions remain closed until at least three letters are typed and a saved name matches. Removing letters below the threshold closes and clears the list. Unknown names can still be saved directly. Desktop input/select/date heights and action buttons use consistent fixed heights.

## Category spending bars · 2026-10-19

Budget rows always show target and monthly assigned values, including overspent categories. Monthly spending bars distinguish funded spending (pale), remaining funds (strong), uncovered spending (red) and unfunded target (grey). The scale includes the target, effective funding and overspending; carryover is accounted for and future-month transactions are excluded. Hidden balances also suppress visual ratios and accessible amounts. The category editor contains the monthly assigned field. Its target input and fill-from-target shortcut were removed; saving this form preserves any existing target. No existing assignments are changed during loading or rendering.

## Planned-only budgeting · 2026-10-19

Target controls, target labels, automatic target-based funding, and the target report are removed from the app. New categories accept the amount planned for the selected month directly. Budget bars and the overview “Consumo do planejado” card use only monthly assignment, spending and carryover. The legacy `target` field is accepted in backups for compatibility but does not influence the current UI or spending calculations. Existing assignments, transactions and account history remain unchanged.

## Searchable transaction categories · 2026-10-19

The transaction category field is an editable combobox on desktop and mobile. It searches category and group names without accents, shows icons and group labels, and supports mouse/touch or arrow/Enter selection. The selected stable category ID is stored separately from the search text; editing the text clears stale selections, duplicate names require explicit selection, and unknown text cannot create a transaction category silently. Choosing a category manually prevents later payee suggestions from replacing it. Payee suggestions retain their three-letter threshold.

## Nosso acerto

Despesas podem registrar `sharing: {paidBy: "edu" | "larissa", eduPercent: 0..100}`. Lançamentos antigos ficam sem pagador; receitas não têm divisão. Os percentuais são inteiros, e a parte de Edu é arredondada ao centavo; a parte de Larissa é o restante, conservando o total. Despesas pessoais pagas pela própria pessoa ficam fora do acerto.

As transferências efetivamente feitas ficam em `household: {version: 1, settlements: [{id, from, amount, date, memo}]}` e não são receitas ou despesas no orçamento. Saldo positivo significa que Larissa transfere para Edu; negativo significa o inverso. A pendência de meses anteriores é recalculada a partir das despesas e transferências, incluindo meses sem movimentos. Acertos parciais, edições, exclusões e pagamentos a maior preservam o histórico do orçamento.

A validação mantém esses dados nos backups e no servidor. A sincronização combina registros por ID e pede revisão para conflitos no mesmo campo. Abas antigas sem suporte a `household` têm suas gravações recusadas com 426 quando o plano já contém divisões ou acertos, preservando os dados do servidor até a página ser atualizada. Identificar um pagador não cria nem compartilha acessos. O acesso entre contas é concedido separadamente em Ajustes.

## Popups sem rolagem

`dialog-pages.js` divide conteúdo longo em etapas conforme a altura visível (inclusive com teclado do celular). Os campos mantêm o mesmo nó DOM e seus valores ao avançar e voltar; os controles não são desabilitados para paginar. A validação nativa revela a etapa do campo inválido. O resumo do acerto tem links para despesas, transferências e cálculo, e listas longas usam a mesma paginação. O seletor de período usa atalhos em dropdown em telas pequenas e alterna início/fim em telas muito baixas.

## Compartilhamento entre contas · 2026-10-19

Ajustes oferece um convite pessoal de uso único, válido por 24 horas, para um segundo editor. O link usa um fragmento com 256 bits aleatórios; somente o hash do token fica no D1. A pessoa convidada entra pela própria conta do ChatGPT, vê o convite e aceita explicitamente. O site mantém sua audiência existente: o convite do plano não concede acesso ao portão do Sites. Se necessário, o dono adiciona a conta convidada pelo Compartilhar do site.

`plan_members`, `plan_invites` e `plan_preferences` mantêm permissões fora do JSON do orçamento. O plano original continua nas mesmas tabelas `sync_*`, sem migrar lançamentos. A preferência de plano ativo é por conta; trocar em um aparelho também muda o plano ativo dos outros aparelhos dessa conta. O plano pessoal do convidado permanece separado e pode ser reaberto em Ajustes. Só o dono gera/cancela convites ou remove o editor; remover acesso preserva lançamentos e não apaga cópias já armazenadas no outro aparelho.

Cada GET e PUT resolve a permissão no servidor. PUTs enviam o identificador do plano ativo e verificam a preferência e a associação novamente dentro do CAS, impedindo gravações após troca ou revogação concorrente. Abas antigas sem esse identificador são recusadas quando a conta já usa preferências de compartilhamento. A fila, a base e as recuperações locais são separadas por conta e plano. Trocas preservam cópia e não mesclam planos distintos.

A atualização automática usa `/api/plan/head` a cada dois segundos enquanto a página está visível; o documento completo só é buscado quando muda ou há alterações pendentes. Não é WebSocket. Mudanças remotas aguardam o término de um formulário em edição; gastos independentes são combinados por ID e conflitos no mesmo campo exigem revisão. Testes com duas identidades cobrem concorrência, convites expirados/cancelados/consumidos, CSRF, troca de plano, filas locais e revogação durante uma gravação. O fluxo de Ajustes tem testes DOM para celular e desktop; revisão visual no navegador continua indisponível.

## Marca VPO · 2026-10-19

O app se chama Você Precisa de um Orçamento (VPO). Títulos de navegação, metadados, marca vetorial e manifesto usam o novo nome. Ícone de dólar vetorial com fundo roxo e símbolo verde; PNGs opacos de 180, 192, 512 e 1024 pixels e favicons de 32 e 48 pixels. O conteúdo principal do ícone fica dentro da área circular segura para máscaras do Android. O arquivo de 180 pixels é declarado como apple-touch-icon, com título VPO. Novos caminhos de recursos e versões de cache permitem buscar os ícones atualizados; atalhos já instalados no iOS podem precisar ser adicionados novamente. A URL, o start_url, as chaves locais e o banco permanecem os mesmos.

## Ícone do iPhone: manifesto autenticado · 2026-10-19

O manifesto passa a declarar `crossorigin="use-credentials"`, pois os arquivos deste Site exigem sessão na hospedagem. O ícone usa URL absoluta e nome novo para evitar a referência anterior, com `apple-touch-icon` e alternativa precomposed. O Worker também entrega PNGs nos caminhos padrão da raiz (`apple-touch-icon.png`, `apple-touch-icon-precomposed.png` e a variante de 180 pixels), além de um favicon ICO real com várias resoluções. O servidor de hospedagem continua exigindo login; esta correção não abre o acesso ao plano. O resultado da tela Adicionar à Tela de Início precisa ser conferido em um iPhone real.

## Ícone incorporado para Safari 26+ · 2026-10-19

As URLs de PNG da hospedagem continuam retornando 401 sem sessão, inclusive depois de adicionar os nomes padrão na raiz. A mudança de credenciais no manifesto não foi suficiente no iPhone real do usuário. `scripts/embed-app-icons.mjs`, executado pelo build, agora incorpora os bytes das imagens em data URLs no HTML e nas entradas do manifesto. Assim o instalador que recebeu os metadados não precisa fazer uma requisição HTTP autenticada adicional para baixar o ícone. A técnica preserva a marca criada para o VPO, não expõe o plano e não usa um servidor externo de imagens. O suporte a ícones data URL foi documentado no Safari 26.0 pelo WebKit: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#svg-icons . O teste em iPhone real ainda depende de conferir a nova instalação.
## Versão independente com login por e-mail · 2026-10-20

O VPO agora também tem um alvo independente para Netlify, separado da hospedagem atual. Código de acesso por e-mail, cache por conta, planos pessoais vazios e compartilhamento usam o projeto dedicado VPO no Supabase. A configuração de envio SMTP e a publicação externa precisam ser concluídas antes de liberar o acesso. Instruções completas: [standalone/README.md](standalone/README.md).

O alvo independente também inclui a tela de assinatura, integração de cartão Asaas e controle de teste de 15 dias no servidor. O preço está definido em R$ 12,90/mês. Cobranças permanecem desativadas até conectar a conta de recebimento e homologar o provedor. Decisões, fontes e próximos passos: [standalone/ASSINATURAS.md](standalone/ASSINATURAS.md).
