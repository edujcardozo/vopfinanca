# VPO — R$ 12,90 por mês com Asaas

## Decisões confirmadas

- Recebimento em CPF, com conta Asaas de pessoa física sujeita à aprovação do provedor.
- Clientes pessoa física; conta própria VPO por e-mail, sem ChatGPT.
- Mensalidade de **R$ 12,90**, em reais, com renovação mensal no cartão.
- Autorização no início; primeira cobrança somente após pelo menos **15 dias completos grátis**.
- Uma assinatura cobre o proprietário e uma pessoa convidada no mesmo orçamento.

**Pix Automático exige pessoa jurídica no Asaas.** A configuração para CPF oferece somente cartão. Pix comum mensal exige pagamento a cada ciclo; ele não substitui silenciosamente a autorização automática solicitada e não foi implementado neste fluxo.

## Estado da implantação

O código inclui checkout recorrente hospedado no Asaas, confirmação de autorização/pagamentos por API, receptor de Webhooks, consulta e cancelamento. A recorrência e os débitos são agendados pelo Asaas.

**Cobranças continuam desativadas. Não houve cadastro de cartão nem movimentação de dinheiro.** A integração foi testada com PostgreSQL embarcado e respostas simuladas do provedor. Ainda é necessário conectar a conta/chave Asaas, homologar o checkout real em Sandbox, configurar Webhooks e SMTP e publicar no Netlify. Testes locais não substituem a homologação.

O app atual no ChatGPT mantém a experiência existente. As funções financeiras pertencem à versão independente para Netlify.

## Fluxo do cliente

1. Entra com e-mail e o código completo recebido.
2. Confere R$ 0,00 hoje, 15 dias grátis e R$ 12,90/mês após o teste. O consentimento não vem marcado.
3. A cotação fixa preço e datas no servidor, sem reiniciar em outro aparelho. A primeira data é arredondada para o próximo início de dia em São Paulo para preservar 15 dias completos.
4. A função cria um checkout com CREDIT_CARD, RECURRENT, MONTHLY e primeira cobrança futura. CPF, cartão e CVV são preenchidos no Asaas e não passam pelo orçamento do VPO.
5. Retornar à URL de sucesso não libera acesso. O servidor busca a cobrança ligada ao checkout conhecido e confirma a assinatura/cartão na API Asaas. A autorização libera o teste sem registrar receita.
6. Pagamentos confirmados liberam seus ciclos. Valores, assinatura, cliente e datas precisam coincidir. Períodos futuros não antecipam o acesso; reembolsos e contestações revogam o período correspondente.
7. Cancelar renovação encerra a assinatura e cobranças pendentes no Asaas antes da confirmação no VPO. O período já pago permanece disponível até o fim. Consulta e backup continuam acessíveis.

## Código e instalação

| Arquivo | Responsabilidade |
|---|---|
| database.sql | Orçamentos, usuários e convites |
| billing.sql | Teste, autorização, pagamentos e acesso |
| asaas.sql | Preço de 1290 centavos, cartão, reservas e operações de servidor |
| server/asaas.mjs | Checkout, conciliação, cancelamento e períodos mensais |
| server/http.mjs | Identidade, origem e autenticação de Webhook |
| ../netlify/functions/vpo-billing.mjs | Função HTTP do Netlify |
| billing-client.js | Chamadas autenticadas sem dados de cartão, preço ou ID de outro cliente |

No projeto Supabase VPO existente, as três etapas de esquema estão aplicadas. Em outro projeto dedicado, execute os SQLs uma vez nessa ordem. Nunca exponha vpo_private na Data API.

## Publicação completa no Netlify

**Arrastar apenas o ZIP estático no painel não publica as funções financeiras.** Conecte um repositório com o código fonte ou use a CLI oficial. Após instalar a CLI, no projeto:

```sh
npm ci
npm test
npm run build:standalone
netlify login
netlify link
netlify deploy --dir=dist-independent --functions=netlify/functions
```

Esse deploy é de revisão. Depois de homologar o destino, publique com o mesmo comando e --prod. O netlify.toml já define build, pasta e funções. Use o login protegido/OAuth; nunca salve a senha do Netlify no código.

## Variáveis privadas nas funções

No Netlify, cadastre com escopo **Functions**, sem prefixos públicos e sem colocar credenciais no Git ou no pacote estático:

| Variável | Uso |
|---|---|
| SUPABASE_URL | URL do projeto dedicado ao ambiente |
| SUPABASE_SECRET_KEY | Chave secreta de servidor; aceita também SUPABASE_SERVICE_ROLE_KEY legada |
| VPO_SITE_URL | Origem HTTPS exata, sem caminho, query ou fragmento |
| ASAAS_ENVIRONMENT | sandbox ou production |
| ASAAS_API_KEY | Chave privada Asaas do mesmo ambiente |
| ASAAS_WEBHOOK_TOKEN | Segredo independente aleatório de pelo menos 32 caracteres |
| VPO_BILLING_ENABLED | false até configurar a homologação; true só no ambiente validado |

project.json contém apenas configuração pública. O build não incorpora as variáveis privadas acima. Não use chave administrativa como chave pública.

Use projetos Supabase e sites separados para Sandbox e produção. O banco recusa misturar ambientes na mesma contratação. Não promova uma conta que já recebeu autorizações/pagamentos fictícios para produção.

## Webhooks

Destino no Asaas: https://SEU-DOMINIO/.netlify/functions/vpo-billing?action=webhook

Configure API v3, entrega sequencial e o mesmo ASAAS_WEBHOOK_TOKEN no campo de autenticação. Ele chega no cabeçalho asaas-access-token. Não reutilize a chave da API.

- CHECKOUT_CREATED, CHECKOUT_PAID, CHECKOUT_CANCELED, CHECKOUT_EXPIRED.
- SUBSCRIPTION_CREATED, SUBSCRIPTION_UPDATED, SUBSCRIPTION_INACTIVATED, SUBSCRIPTION_DELETED.
- Eventos PAYMENT_* de criação, confirmação, recebimento, exclusão, reembolso e chargeback disponíveis na conta.

O receptor valida o segredo e busca novamente o recurso na API. Só o servidor chama as operações financeiras do banco. Falhas permitem nova entrega; eventos repetidos não duplicam o período pago. Logs contêm apenas códigos de falha, sem dados pessoais, sessões, corpos ou chaves.

## Homologação antes da ativação

1. Configurar SMTP e templates no Supabase (README.md); validar novo cadastro com dois e-mails controlados por você.
2. Validar conta Asaas CPF e Sandbox, domínio comercial e disponibilidade do checkout recorrente/cartão.
3. No ambiente separado de homologação, instalar os SQLs e configurar billing_config.enabled=true, checkout_ready=true e gateway_environment='sandbox'. Preço padrão: 1290 centavos. Configurar variáveis e Webhooks.
4. Usar somente dados fictícios permitidos pelo Sandbox. Confirmar nenhum débito inicial, cartão registrado, primeira data após 15 dias completos, pagamento, renovação e cancelamento.
5. Conferir a cobrança com checkoutSession e a assinatura com creditCard.creditCardToken. Se a conta/API não fornecer essas evidências, o código bloqueia a liberação; ajustar com o Asaas antes de ativar.
6. Testar cartão recusado, interrupção de rede, cotação repetida, valor adulterado, eventos duplicados/atrasados, reembolso e contestação. Cancelar antes da primeira cobrança e durante ciclo pago.
7. Conferir login/convite em dois celulares e uma única assinatura no orçamento compartilhado. Conferir Safari/Chrome reais; testes DOM não medem layout nativo.
8. Configurar produção somente após validar os fluxos, com banco e credenciais de produção. Ativar explicitamente no banco e nas variáveis. Nenhuma chave entra no frontend.

## Limites e recuperação

Se a criação do checkout perder a resposta, a reserva permanece em preparação. Não criamos outro checkout automaticamente: o primeiro pode existir. O operador deve localizar pelo externalReference da tentativa, conciliar seu identificador/cancelamento e só então liberar nova tentativa. Não apagar a reserva e tentar novamente às cegas.

Uma cotação expirada sem autorização não concede novo teste. Recontratação após cancelamento também precisa de um fluxo futuro sem novo teste; esta versão não a inicia automaticamente.

E-mails automáticos de lembrete de fim do teste não foram implementados. Notificações e taxas do Asaas dependem da conta e devem ser conferidas nela. Nenhum e-mail real foi enviado.

## Fontes oficiais conferidas em 20/10/2026

- [Asaas — cartão para pessoa física ou jurídica](https://www.asaas.com/cobranca-cartao)
- [Asaas — requisitos do Pix Automático](https://central.ajuda.asaas.com/hc/pt-br/articles/41908868304027-Quais-os-requisitos-para-usar-o-Pix-Autom%C3%A1tico)
- [Asaas — checkout recorrente e primeira data](https://docs.asaas.com/docs/checkout-with-subscription-recurring)
- [Asaas — criação de checkout](https://docs.asaas.com/reference/criar-novo-checkout)
- [Asaas — eventos de checkout](https://docs.asaas.com/docs/checkout-events)
- [Asaas — eventos financeiros](https://docs.asaas.com/docs/payment-events)
- [Asaas — consulta por checkout/assinatura](https://docs.asaas.com/reference/listar-cobrancas)
- [Asaas — remoção e cobranças pendentes](https://docs.asaas.com/reference/remover-assinatura)
- [Netlify — publicar funções](https://docs.netlify.com/build/functions/get-started/)
