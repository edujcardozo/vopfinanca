# Reference and visual assets

Reviewed on 2026-10-18:

- https://www.ynab.com/
- https://www.ynab.com/features

The current reference supplied the midnight, blurple, buttermilk and firefly palette, Wishfarm/Figtree typography, the navigation style, illustration style, and layout direction. Copy, the independent local planner, its interactions, CSS and code were authored for this project. No reviews, endorsements, product statistics or official subscription claims are attributed to this concept.

The following original YNAB-hosted visual assets are used for this private design study. Rights remain with their respective owners. Font files are subset to the Latin and punctuation characters used by the project; they are not renamed or represented as newly authored fonts.

- https://cdn.prod.website-files.com/66e349fd9a49a032bc6ee14f/66e34a2e86ec46fc697dc32a_Tree%20Logo%20Blurple%20(2).svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/66fdcbae99333809c14a9de3_Logotype%20Buttermilk.svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/672188c512264aa81f920114_flying_money_narrow_firefly_hero.svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/6502e96f8b7ff92feac8c8ab_8f4df614c4e37b06ccda5279439473b1_hero-phone.avif
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/670dd77222e896a0e4630a9e_Laptop_treelogo_Blurple_outline%20(1).svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/6740cd7a2b401ce6a38c37db_Map_blurple_outline%20(1).svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/6740cda4e04b618f084a2306_Kite_Blurple_outline.svg
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/643ece4000605419dcbcb7ec_Figtree-VariableFont_wght.ttf
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/646d048afe7e05cf47a3cfd1_WishFarm-SemiBold.otf

The home screen icon is a project-native dollar-symbol SVG in the existing blurple and firefly palette. Its PNG renditions were generated from the SVG using Sharp.

## Transaction-entry follow-up · 2026-10-18

Official documentation reviewed for the separate payee and memo fields and remembered category suggestions:

- https://support.ynab.com/en_us/how-to-add-transactions-in-ynab-HyDwA_byi
- https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s

The project implements a manual payee field, local payee suggestions with the latest transaction category, optional memo, editing, and a native date picker with a custom responsive visible face. No bank, GPS, recurring transaction or account-transfer integration is implied.

## Category groups · 2026-10-18

Official reference: https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909

The project implements a New Group button above categories, editable group names, add-category buttons in group headers, and a group selector for moving a category. Groups are independent records with stable IDs; renaming groups never rewrites transactions or allocations.

## Reflect-style reports · 2026-10-18

Official sources reviewed:

- https://support.ynab.com/en_us/income-v-expense-Byu1BYWRq
- https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0
- https://support.ynab.com/en_us/spending-trends-H1inlhzAc
- https://support.ynab.com/en_us/net-worth-BkwQO5WA5
- https://support.ynab.com/en_us/age-of-money-H1ZS84W1s
- https://support.ynab.com/en_us/how-to-export-reflection-data-Bykou09

The project's reports use its own manual ledger, local wealth snapshots, SVG geometry and a disclosed cash-age estimate. It does not claim account-aware parity with YNAB or automatic bank import. Original report calculations, chart geometry and interface code are project-authored.

## Reordering — 2026-10-18

Official YNAB guide: https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909 — “How to Reorder Categories and Category Groups”. Mobile uses Edit Plan → Reorder and drag handles; web supports dragging categories within/across groups and whole groups. This implementation uses an explicit Organizar toggle and pointer handles for touch and mouse.

## Typography, web entry and payees · 2026-10-19

- https://www.ynab.com/ — public HTML stylesheet reference.
- https://cdn.prod.website-files.com/640f69143ec11b21d42015c6/css/staging-www.shared.eacda6f0d.css — fetched public CSS, declaring Figtree variable weights 300–900, Wishfarm medium/semibold and `font-display: swap`. This is evidence for the marketing site, not a claim about the authenticated app's private implementation.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Fonts/Variable_fonts — real variable weights and @font-face definitions.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-smooth — nonstandard smoothing controls have platform-specific behavior; they are not a cross-platform “HD font” switch.
- https://support.ynab.com/en_us/how-to-add-transactions-in-ynab-HyDwA_byi — separate date, payee, category, amount and memo.
- https://support.ynab.com/en_us/how-to-add-income-and-other-inflows-H1ZNjfZJi — web transaction register and Save/Save and add another.
- https://support.ynab.com/en_us/categorizing-transactions-a-guide-HyRl60sks — remembered payee/category relationship. This project suggests the latest category and never changes a category the user already selected in the form; it does not claim to replicate YNAB's 2-of-3 default-category algorithm.
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events — moving a capturing element can lose pointer capture. The implementation now captures on the stationary list instead of the moving handle.

Payees are independently persisted inside the account's plan, merged by normalized name, and exported/imported in JSON backups. Search is accent/case insensitive, supports partial words, and uses a custom accessible combobox with mouse, touch and keyboard selection.

## Category spending bars · 2026-10-19

https://support.ynab.com/en_us/progress-bars-a-guide-SkDEhot09 — spending/remaining shading, underfunded targets and overspending. The project uses one monthly bar; grey can represent the portion of a target not yet funded, even when other segments are red. It does not implement YNAB weekly/yearly target periods.
## VPO independente e autenticação · 2026-10-20

- https://supabase.com/changelog.md — revisado antes da implementação; limitações atuais dos templates de e-mail no SMTP padrão e mudanças de exposição da Data API.
- https://supabase.com/docs/guides/auth/auth-email-passwordless — signInWithOtp, código no template e verifyOtp(type=email).
- https://supabase.com/docs/guides/auth/auth-smtp — SMTP próprio para destinatários fora da equipe do projeto.
- https://supabase.com/docs/guides/database/functions — privilégios e funções invoker/definer com search_path explícito.
- https://supabase.com/docs/guides/database/postgres/row-level-security — proteção de tabelas e políticas.
- https://docs.netlify.com/build/configure-builds/file-based-configuration/ — comando e diretório de publicação.
- https://docs.netlify.com/manage/routing/headers/ — cabeçalhos do pacote estático.
- https://www.netlify.com/changelog/2026-07-07-nodejs-24-default-new-sites/ — runtime Node 24.

O app usa sua própria interface, permissões e protocolo de sincronização. O SDK oficial do Supabase administra autenticação e sessões; não há conta do ChatGPT no alvo independente. O envio de e-mails reais e a instalação em aparelho real não foram testados durante a implementação.
