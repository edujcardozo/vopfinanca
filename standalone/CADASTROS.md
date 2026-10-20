# Cadastro, convidados e aprovação manual

O VPO independente oferece três caminhos na mesma tela, preservando o layout no computador e no celular:

- **Entrar:** usa um e-mail já cadastrado e confirma um código de seis números. Não cria uma conta silenciosamente.
- **Criar conta:** pede nome completo, e-mail e celular opcional. Após a confirmação do e-mail, grava a solicitação e aguarda aprovação. Nesta fase não há coleta de CPF, cartão ou cobrança.
- **Tenho um convite:** recebe um link compartilhado e o e-mail da pessoa convidada. Novas pessoas também confirmam o e-mail e completam o nome. Antes do aceite, a tela mostra quem compartilhou o orçamento. Somente o clique em **Aceitar e abrir o plano** concede acesso ao plano indicado.

O convite autoriza o orçamento compartilhado; não libera automaticamente um plano pessoal separado nem exige uma segunda assinatura. A pessoa convidada pode solicitar seu próprio plano posteriormente. Remover a participação bloqueia novas leituras e gravações no orçamento compartilhado. Uma cópia já armazenada no aparelho não pode ser apagada à distância.

## Aprovar em Ajustes

1. Entre no VPO independente com **edujcardozo@gmail.com**, confirme o código e complete seu cadastro.
2. O servidor vincula esse e-mail confirmado ao identificador imutável da sua conta. Alterar nome, metadados ou JavaScript do navegador não concede administração.
3. Abra **Ajustes → Novos cadastros**. A fila mostra nome, e-mail, telefone opcional, data e estado do aviso. Há filtros de pendentes, aprovados e recusados, com dez registros por página.
4. Clique em **Aprovar acesso** ou confirme **Recusar**. A decisão registra autor e horário e é idempotente. Um cadastro recusado não pode se liberar por um novo envio do formulário.
5. A tela de quem aguarda consulta o servidor a cada 15 segundos, enquanto estiver visível. Também é possível clicar em **Verificar liberação** ou entrar novamente depois.

O controle acontece em cada chamada do banco, inclusive leitura e gravação de orçamento. Tabelas e rotinas anteriores não podem ser acessadas diretamente para contornar a aprovação. Os dados financeiros não aparecem na administração de cadastros.

Cobranças continuam desativadas. Aprovar uma conta não inicia um teste ou assinatura Asaas. Uma futura mudança para liberação comercial automática exige configurar explicitamente essa política, além de homologar a cobrança.

## Ativar os e-mails

Existem dois envios distintos: os códigos de login, pelo SMTP do Supabase, e os avisos de cadastro, pelas funções do Netlify. Para começar **sem domínio próprio**, o app também aceita Gmail com senha de app: veja [GMAIL.md](GMAIL.md). O **Resend** permanece como alternativa para domínio verificado. Não é necessário configurar o Asaas para ativar os cadastros. As instruções a seguir referem-se ao Resend; a configuração do Gmail está no guia indicado.

### Códigos de acesso

Configure um remetente/domínio autorizado no provedor e o SMTP em [Supabase → Authentication → SMTP](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/smtp). Aplique `email-code.html` aos templates Magic Link e Confirm signup. Mantenha a confirmação de e-mail ativa e login anônimo desativado. O SMTP padrão não envia para clientes fora da equipe do projeto. Novos projetos Free precisam de SMTP próprio para personalizar esses templates.

### Aviso para Eduardo

Publique as funções pelo repositório conectado ao Netlify e configure estas variáveis **privadas, no escopo Functions**:

| Variável | Valor necessário |
| --- | --- |
| `SUPABASE_URL` | `https://lucpzpqixgdeenlvwaxf.supabase.co` |
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
