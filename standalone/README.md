# VPO independente

Versão com conta própria por e-mail e código de acesso, preparada para o Netlify. Não exige conta no ChatGPT. O campo aceita códigos de 6 a 10 dígitos, incluindo os 8 dígitos usados no projeto VPO; a validade é sempre conferida pelo Supabase.

## O que está implementado

- Acessos separados para **Entrar**, **Criar conta** e **Tenho um convite**, com Supabase Auth, confirmação de e-mail, renovação de sessão e saída deste aparelho.
- Cadastro com nome completo, e-mail confirmado e celular opcional. Novas contas pessoais aguardam aprovação; a tela verifica a liberação automaticamente.
- Administração de cadastros em Ajustes, restrita ao usuário verificado de `edujcardozo@gmail.com`, vinculado ao UUID uma única vez. Aprovar testes de 15 dias, liberar acesso permanente, recusar e remover/restaurar acessos são decisões registradas no servidor.
- Fila persistente e funções Netlify para avisos de novos cadastros a `edujcardozo@gmail.com`, via Gmail SMTP (sem domínio próprio) ou Resend. O envio depende da configuração privada do provedor; não é simulado como concluído. Veja [GMAIL.md](GMAIL.md) para a opção inicial com a conta Google.
- Cada nova conta começa com categorias iniciais e sem gastos, entradas ou valores planejados de exemplo.
- Convites por link em Ajustes: validade de 24 horas, uso único e aceite explícito. O proprietário pode cancelar convites e remover o acesso da pessoa convidada.
- Plano pessoal e plano compartilhado separados. Proprietário e pessoa convidada podem editar os mesmos lançamentos e categorias.
- Sincronização automática com o app aberto, fila local para interrupções de conexão e revisão quando o mesmo campo recebe duas alterações diferentes.
- Cópias locais, filas e recuperações separadas por projeto e usuário. Sair espera a confirmação dos dados e apaga a cópia local dessa conta.
- Telas responsivas e ícones de dólar públicos para instalação na tela inicial.

## Serviços

O projeto dedicado **VPO**, região São Paulo (`sa-east-1`), foi criado no Supabase: [abrir projeto](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf).

`project.json` contém somente a URL e a chave **publishable**, destinadas ao navegador. As tabelas não podem ser acessadas diretamente; as funções do banco verificam o e-mail confirmado, a identidade e o acesso ao orçamento. Nunca use uma chave `secret` ou `service_role` no frontend.

`database.sql` é o esquema inicial, seguido por `billing.sql`, `asaas.sql`, `registration.sql`, `participants.sql`, `access-management.sql`, `manual-pix.sql` e `savings-goals.sql`. Os arquivos seguintes preparam assinaturas, aprovação, participantes e gerenciamento de acesso e objetivos compartilhados sem ativar cobranças. Para instalar em outro projeto dedicado, execute os oito arquivos uma vez, nessa ordem, no SQL Editor e substitua a configuração pública em `project.json`. Antes de instalar a aprovação em outro produto, substitua o e-mail administrador pelo seu endereço verificado.

O fluxo de cadastro, convite, aprovação e ativação dos avisos está documentado em [CADASTROS.md](CADASTROS.md). O recebimento real dos avisos ainda depende da configuração do serviço de envio e da publicação das funções no Netlify.

## Ativar os códigos por e-mail

Antes de abrir cadastros para outras pessoas:

1. Em [Authentication → Email → SMTP](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/smtp), configure seu provedor SMTP e endereço remetente autorizado. O envio padrão do Supabase limita destinatários à equipe do projeto e não atende este uso público.
2. Em [Email Templates](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/templates), use `email-code.html` no template **Magic Link**. Utilize também o template de código em **Confirm signup** caso seu fluxo de novo cadastro utilize essa mensagem. Assunto: `Seu código de acesso ao VPO`. O corpo precisa manter `{{ .Token }}`.
3. Nas configurações do provedor Email, mantenha a confirmação de e-mail ativa e configure a validade, por exemplo, 10 minutos. O app aceita o código completo de 6 a 10 dígitos, conforme a configuração do projeto, sem reduzi-lo a seis números. Não ative login anônimo nem confirmação automática de e-mail.
4. Após criar o endereço no Netlify, configure esse endereço como **Site URL** em [URL Configuration](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/url-configuration). O fluxo implementado usa o código digitado na mesma página e preserva o convite no endereço.
5. Teste envio, recebimento, código incorreto, expiração e novo cadastro com dois e-mails controlados por você. Nenhuma mensagem real foi enviada durante a implementação.

Documentação oficial: [login por código](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Publicar no Netlify

O `netlify.toml` na raiz já define Node 24, o comando `npm test && npm run build:standalone` e a pasta `dist-independent`. A configuração pública do VPO está incluída; não é necessário cadastrar uma senha de banco no Netlify para publicar a interface.

### Atualizações automáticas pelo GitHub

O fluxo escolhido é desenvolver aqui, enviar o código ao repositório [edujcardozo/vopfinanca](https://github.com/edujcardozo/vopfinanca) e deixar o Netlify publicar cada atualização da branch de produção. O site está disponível em [vpofinancas.netlify.app](https://vpofinancas.netlify.app), com a versão independente atual e a função de avisos publicadas. A publicação automática foi confirmada em 20/10/2026: depois do envio do commit `2c8af60` à branch `main`, a função pública passou a responder com o diagnóstico introduzido por esse commit. Os avisos de cadastro agora usam o endereço público do Supabase da mesma configuração do app, sem depender de outra variável `SUPABASE_URL`; a entrega real de e-mails ainda não foi validada.

No Netlify, importe o repositório do VPO e selecione a branch `main`. Mantenha o diretório base na raiz, a pasta de publicação `dist-independent` e as funções em `netlify/functions`. O `netlify.toml` executa os testes antes de gerar e publicar a versão independente; uma falha de teste interrompe essa publicação. Não é necessário enviar ZIPs a cada alteração.

As credenciais do Asaas, Resend e a chave administrativa do Supabase ficam nas variáveis privadas das funções do Netlify, conforme `ASSINATURAS.md` e `CADASTROS.md`. A conexão com o GitHub não ativa cobranças nem configura o SMTP. Os dados dos clientes permanecem no Supabase e não fazem parte do repositório.

A evidência da publicação automática e o endereço de produção estão registrados em `deployment.json`. O ID privado do projeto Netlify não foi obtido; as atualizações usam o repositório e a branch já conectados, sem depender desse ID.

Opção A: importe o código para um repositório seu e conecte-o ao Netlify. A configuração de build será lida do `netlify.toml`.

Opção B: depois de gerar `dist-independent`, envie o conteúdo dessa pasta para uma implantação manual do Netlify. O pacote estático inclui HTML, CSS, JavaScript, fontes, ícones e os arquivos `_headers` e `_redirects`. Essa opção publica somente a interface. Para cobrança e avisos de cadastro, publique também `netlify/functions` via repositório ou CLI e configure as variáveis privadas, como descrito em `ASSINATURAS.md` e `CADASTROS.md`.

Para gerar localmente:

```sh
npm ci
npm run build:standalone
```

É possível substituir o projeto com as variáveis públicas `VPO_SUPABASE_URL` e `VPO_SUPABASE_PUBLISHABLE_KEY`. A compilação recusa chaves administrativas.

O host entrega apenas os arquivos do aplicativo. Os orçamentos ficam no Supabase. Trocar a hospedagem não transfere dados automaticamente entre projetos Supabase.

## Trazer o orçamento atual

No app atual, exporte seu backup em Ajustes. Entre no novo endereço com seu e-mail e importe o backup no seu plano pessoal. Confira os totais e aguarde **Plano sincronizado**. Depois crie um novo convite em Ajustes e envie o link do novo endereço à outra pessoa. Ela entra com o e-mail dela e aceita o convite.

Os convites antigos pertencem à versão anterior. O banco atual e o orçamento do ChatGPT não foram substituídos ou copiados automaticamente.

## Validação

Os testes exercitam o SQL real em PostgreSQL embarcado (PGlite), incluindo funções, privilégios, autenticação, isolamento, convite, revogação, revisões e combinação de gastos de dois clientes. Também há testes do formulário, código/autofill, sessão, saída e segregação de cache. O build independente verifica os arquivos necessários e protege a configuração pública.

O envio por SMTP, o login de ponta a ponta no host externo e a aparência em Safari/Chrome reais precisam ser conferidos após configurar o e-mail e publicar. Não houve acesso a um navegador de teste nesta implementação.

## Manutenção

Não exponha o schema `vpo_private` na Data API e não conceda acesso direto às tabelas. As políticas de acesso direto negam todas as operações; a API privada aplica as verificações e as gravações de forma atômica. Chaves de autorização administrativas não devem aparecer no site nem nos arquivos de publicação.

As cobranças e os limites dos serviços dependem das contas e planos escolhidos. O preço está definido em R$ 12,90/mês e a integração com cartão Asaas está implementada no código, com as cobranças desativadas. A ativação depende de conectar a conta de recebimento e homologar o provedor. Pix Automático exige CNPJ e não está habilitado nesta configuração para recebimento em CPF. Veja o roteiro e os limites em [ASSINATURAS.md](ASSINATURAS.md).

## Pagadores do plano

O campo Quem pagou, os filtros por pessoa e o Nosso acerto aparecem somente quando há um convite aceito no plano ativo. Os nomes vêm dos cadastros confirmados do titular e da pessoa convidada. O usuário conectado fica selecionado por padrão; os dois aparelhos usam a mesma ordem, titular e convidado. Contas individuais não gravam uma divisão em novas despesas. A edição de um lançamento antigo mantém sua divisão mesmo que o plano tenha voltado a ser individual. As chaves internas `edu` e `larissa` são mantidas por compatibilidade como posições relativas a cada plano, sem associação global a pessoas. Em instalações existentes, aplique `participants.sql` após `registration.sql`; novas instalações já recebem esse retorno no cadastro.

O Pix manual é configurado apenas no projeto dedicado, na tabela privada `manual_pix_config` (habilitado, chave CPF, nome/cidade do recebedor e WhatsApp em formato internacional). Esses dados não ficam no repositório público. O app consulta o Pix somente na sessão autenticada do dono do plano; convidados e clientes permanentes não recebem solicitação de pagamento. O administrador pode visualizar a tela dos clientes em Ajustes → Ver Pix dos clientes.

Para liberar um mês após conferir o recebimento no banco: Ajustes → Usuários e acessos → Usuários → opções do cliente → Confirmar Pix · 1 mês. O servidor fixa o valor pela configuração mensal, registra quem confirmou e preserva o teste de 15 dias e os períodos já pagos. O mês é calculado no horário de São Paulo; repetições do mesmo pedido não estendem o prazo. Enviar um comprovante pelo WhatsApp ou copiar o QR Code não confirma um pagamento. A renovação Pix é manual; Asaas permanece independente e uma autorização ativa precisa ser cancelada antes de mudar para Pix manual.

Os objetivos de economia ficam no documento do orçamento compartilhado: nome, valor desejado e valor já guardado. Podem ser gerenciados pelo menu e pela lateral, com até três resumos e lista completa paginada. Eles não alteram os lançamentos nem o planejado das categorias.
