# Envio pelo Gmail sem domínio próprio

O VPO pode usar uma conta pessoal `@gmail.com` para os códigos do Supabase e os avisos de cadastro enviados pelas funções Netlify. Não precisa cadastrar um domínio no Resend. Esta é uma opção inicial para baixo volume, sujeita aos limites e bloqueios de envio do Google. Não há envio real ativado apenas por publicar este código.

## 1. Gerar a senha de app

Entre na conta **edujcardozo@gmail.com**, ative a [verificação em duas etapas](https://myaccount.google.com/signinoptions/two-step-verification) e abra [Senhas de app](https://myaccount.google.com/apppasswords). Crie uma senha chamada **VPO**. O Google mostra uma senha específica de 16 caracteres. Guarde-a no seu gerenciador de senhas para cadastrá-la nos painéis seguros; não a envie pelo chat, por e-mail ou para o GitHub. Não utilize a senha normal da sua conta Google.

Se a opção não aparecer, confira as restrições da [documentação do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR), como Proteção Avançada e verificação configurada somente com chaves de segurança. Não desative proteções da sua conta para contornar essas restrições.

## 2. Códigos do Supabase

Abra o [SMTP do VPO](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/smtp), ative Custom SMTP e configure:

| Campo | Valor |
| --- | --- |
| Sender name | `VPO` |
| Sender email | `edujcardozo@gmail.com` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `edujcardozo@gmail.com` |
| Password | A senha de app criada no Google |

Em [Email Templates](https://supabase.com/dashboard/project/lucpzpqixgdeenlvwaxf/auth/templates), aplique `email-code.html` em Magic Link e Confirm signup. O template precisa exibir `{{ .Token }}`, pois o aplicativo espera um código de seis números. Mantenha a confirmação de e-mail ativa. Configure a URL final do Netlify como Site URL, em Authentication → URL Configuration. Confirme o limite de envio configurado em Authentication → Rate Limits; o Gmail também tem seu próprio limite.

## 3. Avisos enviados pelo Netlify

No projeto conectado ao repositório `edujcardozo/vopfinanca`, abra **Project configuration → Environment variables**. Use o contexto Production. Se houver opção de escopo, inclua Functions; no plano que não separa escopos, o padrão inclui as funções.

| Nome | Valor |
| --- | --- |
| `VPO_EMAIL_PROVIDER` | `gmail` |
| `GMAIL_USER` | `edujcardozo@gmail.com` |
| `GMAIL_APP_PASSWORD` | A senha de app criada no Google |
| `SUPABASE_SECRET_KEY` | Chave secreta do projeto VPO, somente no servidor |
| `VPO_SITE_URL` | `https://vpofinancas.netlify.app`, sem `#plano` |

Para obter a chave secreta, use Supabase → Settings → API Keys. Ela começa com `sb_secret_`. Cole-a somente na variável privada do Netlify. A configuração pública do navegador usa uma chave publishable diferente.

O endereço público do Supabase é lido de `standalone/project.json`, como no build do app. Os avisos de cadastro não dependem de uma segunda variável `SUPABASE_URL`. Se substituir o projeto pela variável pública `VPO_SUPABASE_URL`, aplique-a tanto ao build quanto às funções. A chave secreta precisa pertencer ao mesmo projeto. As funções de cobrança mantêm sua configuração própria enquanto a cobrança está desativada.

Com `VPO_EMAIL_PROVIDER=gmail`, não são necessárias `RESEND_API_KEY` nem `VPO_EMAIL_FROM`: o remetente é fixado em `VPO <edujcardozo@gmail.com>` usando o valor de `GMAIL_USER`. O destino dos avisos continua vindo da configuração privada do banco, e não do formulário do navegador. Após salvar as variáveis, faça um novo deploy. O projeto precisa publicar as funções `vpo-registration` e `vpo-registration-queue`; um upload somente da pasta estática não as publica.

Se a função retornar `EMAIL_NOT_CONFIGURED`, o campo `fields` da resposta indica apenas os nomes das variáveis ausentes ou inválidas. Corrija esses campos no painel privado do Netlify e publique novamente. Valores e senhas não aparecem nessa resposta nem nos logs do aplicativo. Essa checagem valida o preenchimento; a entrega só é confirmada quando o provedor aceita um aviso de um cadastro real.

## 4. Conferir o fluxo real

Entre primeiro com **edujcardozo@gmail.com**, confirme o código e complete seu cadastro de administrador. Crie um cadastro com outro e-mail controlado por você, confirme o código e aguarde a tela de aprovação. O aviso deverá chegar ao Gmail; confira o resultado em Ajustes → Novos cadastros e aprove o pedido. O recebimento real precisa ser testado depois que as credenciais estiverem configuradas.

As funções usam SMTP com TLS e validação de certificado, host e remetente fixos, um único destinatário e sem registrar credenciais ou corpo da mensagem nos logs. Um aviso é marcado como enviado somente após o servidor SMTP aceitar o destinatário. Como SMTP não oferece a idempotência da API Resend, uma falha de conexão depois do aceite pode ocasionar um aviso repetido nas tentativas limitadas da fila. Isso não repete a aprovação nem cria contas adicionais.

O Google pode revogar senhas de app após alteração da senha principal. O Gmail tem cotas de envio e pode bloquear mensagens; não há garantia de entrega ou capacidade ilimitada. Para uma operação maior, reavalie um provedor de e-mails transacionais. O Resend continua disponível como alternativa configurando `VPO_EMAIL_PROVIDER=resend`, remetente verificado e a chave correspondente.

Referências oficiais: [senhas de app Google](https://support.google.com/accounts/answer/185833?hl=pt-BR), [SMTP Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp?hl=pt-BR), [Supabase com SMTP Google](https://supabase.com/docs/guides/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y), [limites Gmail](https://support.google.com/mail/answer/22839?hl=pt-BR).
