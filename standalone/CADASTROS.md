# Cadastro, convidados e aprovação manual

O VPO independente oferece três caminhos na mesma tela, preservando o layout no computador e no celular:

- **Entrar:** usa um e-mail já cadastrado e confirma o código completo recebido por e-mail, de 6 a 10 dígitos conforme o projeto Supabase. Não cria uma conta silenciosamente.
- **Criar conta:** pede nome completo, e-mail e celular opcional. Após a confirmação do e-mail, grava a solicitação e aguarda aprovação. Nesta fase não há coleta de CPF, cartão ou cobrança.
- **Tenho um convite:** recebe um link compartilhado e o e-mail da pessoa convidada. Novas pessoas também confirmam o e-mail e completam o nome. Antes do aceite, a tela mostra quem compartilhou o orçamento. Somente o clique em **Aceitar e abrir o plano** concede acesso ao plano indicado.

O convite autoriza o orçamento compartilhado; não libera automaticamente um plano pessoal separado nem exige uma segunda assinatura. A pessoa convidada pode solicitar seu próprio plano posteriormente. Remover a participação bloqueia novas leituras e gravações no orçamento compartilhado. Uma cópia já armazenada no aparelho não pode ser apagada à distância.

## Administrar em Ajustes

Abra **Ajustes → Usuários e acessos**, usando a conta administradora. A administração está vinculada ao identificador imutável da conta confirmada; nomes, e-mails editáveis ou campos enviados pelo navegador não concedem administração.

- **Pendentes:** aprove com **15 dias grátis**, libere como **permanente** ou recuse o pedido. A contagem começa na aprovação, não durante a espera pelo cadastro.
- **Usuários:** veja o tipo de acesso e o fim do teste. O botão de três pontos permite tornar um plano pessoal permanente, voltar ao teste/assinatura ou remover o acesso. Pessoas convidadas também aparecem, com remoção independente do titular.
- **Removidos:** restaure o acesso anterior. Remover é uma revogação reversível: não apaga a conta, o orçamento ou os registros de pagamento. Restaurar ou trocar de modalidade não reinicia o teste original.
- **Recusados:** mantenha o histórico das decisões de cadastro.

**Permanente** significa acesso pessoal sem mensalidade e sem prazo; não concede administração. A conta administradora mantém esse acesso e não pode ser removida por esses controles. Uma assinatura ou contratação ativa no Asaas precisa ter o cancelamento confirmado antes de remover o acesso ou liberá-lo sem mensalidade. A alteração de acesso não cancela uma cobrança no provedor.

O cliente vê os dias restantes e as datas em **Ajustes → Meu acesso**, com um indicador discreto junto da sua identidade na conta. Ao fim dos 15 dias, a edição é bloqueada no servidor; consulta e backup continuam disponíveis. Um pagamento confirmado pode liberar a assinatura. O Asaas continua desligado até sua configuração explícita: não há débito automático pelo simples fim do teste.

Contas aprovadas antes desta atualização usam a data de aprovação já registrada. O teste e os pagamentos do titular cobrem o mesmo orçamento compartilhado; aceitar um convite não cria outro teste nem libera um plano pessoal.

Cada mudança registra administrador, horário e os estados anterior e posterior. A remoção bloqueia novas operações online, inclusive com uma sessão já aberta. O app verifica a autorização a cada 15 segundos enquanto visível e ao recuperar foco/conexão. Uma cópia já baixada em um aparelho offline não pode ser apagada remotamente; ela não permite novas leituras/gravações na nuvem após a revogação.

Aplique **access-management.sql** uma vez depois de **participants.sql** no projeto Supabase dedicado. Mantenha `vpo_private` fora dos esquemas expostos. As tabelas e rotinas anteriores não podem ser chamadas diretamente pelos clientes.

## Ativar os e-mails

Existem dois envios distintos: os códigos de login, pelo SMTP do Supabase, e os avisos de cadastro, pelas funções do Netlify. Para começar **sem domínio próprio**, o app também aceita Gmail com senha de app: veja [GMAIL.md](GMAIL.md). O **Resend** permanece como alternativa para domínio verificado. Não é necessário configurar o Asaas para ativar os cadastros. As instruções a seguir referem-se ao Resend; a configuração do Gmail está no guia indicado.

### Códigos de acesso

Configure um remetente/domínio autorizado no provedor e o SMTP em [Supabase → Authentication → SMTP](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/smtp). Aplique `email-code.html` aos templates Magic Link e Confirm signup. Mantenha a confirmação de e-mail ativa e login anônimo desativado. O SMTP padrão não envia para clientes fora da equipe do projeto. Novos projetos Free precisam de SMTP próprio para personalizar esses templates.

### Aviso para Eduardo

Publique as funções pelo repositório conectado ao Netlify e configure estas variáveis **privadas, no escopo Functions**:

| Variável | Valor necessário |
| --- | --- |
| Endereço do Supabase | Automático a partir de `standalone/project.json`, compartilhado com o app |
| `SUPABASE_SECRET_KEY` | Chave secreta do projeto dedicado, somente no servidor. Também é aceita a variável legada `SUPABASE_SERVICE_ROLE_KEY`. |
| `VPO_SITE_URL` | Origem HTTPS final do seu site Netlify, sem caminho, query ou fragmento. |
| `RESEND_API_KEY` | Chave do Resend com autorização para o remetente escolhido. |
| `VPO_EMAIL_FROM` | Remetente verificado, por exemplo `VPO <acesso@seu-dominio.com.br>`. |

Não use prefixos públicos, não coloque essas chaves em `project.json`, `.env.example`, HTML, GitHub ou mensagens do chat. Cadastre-as no painel seguro do Netlify e faça um novo deploy. Sem essas variáveis, a solicitação continua salva e disponível em Ajustes; o app informa ao administrador que o envio ainda precisa ser configurado.

A função `vpo-registration` verifica a sessão diretamente no Supabase, exige a origem configurada e aceita apenas um corpo vazio. Ela busca somente o aviso da conta autenticada. O destinatário vem da configuração privada do banco e é **edujcardozo@gmail.com**; o navegador não pode escolher destinatários ou conteúdo. O texto contém os dados do cadastro e um link para Ajustes. Abrir esse link não aprova nada: é preciso entrar como administrador e decidir no aplicativo.

A fila é criada na mesma transação do cadastro. Uma tentativa imediata ocorre após o envio; a função agendada `vpo-registration-queue` tenta novamente a cada cinco minutos no deploy de produção. Cada aviso tem uma reserva de dois minutos, até cinco tentativas e uma chave de idempotência estável no Resend. Tentativas ambíguas são limitadas à janela de 23 horas do primeiro envio para respeitar a retenção de 24 horas da chave no provedor. Avisos que nunca começaram a ser enviados continuam aguardando a configuração. Falhas esgotadas permanecem registradas e podem ser analisadas manualmente em Ajustes; a conta continua aprovável.

“Aviso enviado” significa que o provedor confirmou o recebimento da mensagem. Não comprova leitura ou entrega na caixa de entrada. Cadastros duplicados não geram um segundo aviso. Nenhum e-mail real foi enviado durante a implementação.

## Validação e publicação

`registration.sql` é a quarta etapa do esquema. Os testes executam a autorização em PostgreSQL real embarcado, além dos controles da tela e da função HTTP com provedor simulado. O roteiro real após configurar o envio é: cadastrar um e-mail controlado, confirmar o código, verificar o bloqueio, receber o aviso, aprovar na conta de Eduardo, conferir a liberação e aceitar um convite com uma segunda conta. SMTP, domínio remetente e entrega real não foram homologados nesta sessão.

O site original com acesso pelo ChatGPT permanece separado. Estes controles pertencem ao build independente `dist-independent`, publicado pelo `netlify.toml`.

Referências oficiais: [Supabase OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [templates Free](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier), [Resend envio](https://resend.com/docs/api-reference/emails/send-email), [idempotência](https://resend.com/changelog/idempotency-keys), [funções agendadas Netlify](https://docs.netlify.com/build/functions/scheduled-functions/).
