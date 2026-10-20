// Name-based, on-device suggestions. Specific meanings precede broader ones.
const rules=[
  ['🩺',/\b(plano de saude|seguro saude|saude|medico|medica|consulta|consultas|hospital|terapia|psicologo|psicologa)\b/],
  ['🛡️',/\b(seguro|seguros|seguradora)\b/],
  ['🔧',/\b(manutencao|conserto|consertos|oficina|reparo|reparos)\b/],
  ['⛽',/\b(combustivel|combustiveis|gasolina|diesel|etanol|abastecimento)\b/],
  ['💡',/\b(luz|energia|eletricidade|iluminacao|conta de luz)\b/],
  ['🌐',/\b(internet|wifi|wi fi|banda larga|fibra)\b/],
  ['💧',/\b(agua|aguas|saneamento|esgoto)\b/],
  ['🔥',/\b(gas|botijao)\b/],
  ['📱',/\b(celular|telefone|telefonia|recarga|chip)\b/],
  ['🏠',/\b(moradia|aluguel|condominio|habitacao|casa|apartamento|prestacao do imovel)\b/],
  ['🏫',/\b(escola|escolar|creche|escolinha|colegio|mensalidade escolar)\b/],
  ['🎓',/\b(faculdade|universidade|curso|cursos|estudos|educacao|pos graduacao)\b/],
  ['📚',/\b(livro|livros|livraria|material escolar|material de estudo)\b/],
  ['💊',/\b(farmacia|farmacias|remedio|remedios|medicamento|medicamentos|vitamina|vitaminas)\b/],
  ['🦷',/\b(dentista|dentario|odontologia|ortodontia)\b/],
  ['🧼',/\b(higiene|fralda|fraldas|sabonete|sabonetes|limpeza)\b/],
  ['👶',/\b(bebe|bebes|baba|enxoval|maternidade)\b/],
  ['🐾',/\b(pet|pets|veterinario|veterinaria|racao|cachorro|cachorros|gato|gatos|animal|animais)\b/],
  ['🛒',/\b(supermercado|supermercados|mercado|mercados|feira|feiras|hortifruti|alimentacao)\b/],
  ['☕',/\b(cafe|cafes|cafeteria|cafeterias)\b/],
  ['🍽️',/\b(restaurante|restaurantes|almoco|jantar|ifood|delivery|lanche|lanches|comer fora)\b/],
  ['🚗',/\b(transporte|carro|carros|uber|taxi|mobilidade|automovel)\b/],
  ['🚌',/\b(onibus|metro|passagem|passagens|transporte publico)\b/],
  ['🅿️',/\b(estacionamento|estacionamentos|pedagio|pedagios)\b/],
  ['✈️',/\b(viagem|viagens|ferias|turismo|hotel|hospedagem)\b/],
  ['💪',/\b(academia|fitness|treino|treinos|esporte|esportes|pilates)\b/],
  ['🎬',/\b(cinema|filme|filmes)\b/],
  ['📺',/\b(netflix|streaming|disney|prime video|televisao|tv)\b/],
  ['🎵',/\b(spotify|musica|musicas|show|shows)\b/],
  ['🎮',/\b(jogo|jogos|videogame|playstation|xbox|game|games)\b/],
  ['🎉',/\b(lazer|diversao|festa|festas|aniversario|aniversarios)\b/],
  ['🎁',/\b(presente|presentes|natal)\b/],
  ['👕',/\b(roupa|roupas|vestuario|calcado|calcados|sapato|sapatos)\b/],
  ['💇',/\b(beleza|salao|cabelo|cabeleireiro|barbeiro|barbearia|manicure|estetica)\b/],
  ['💻',/\b(computador|notebook|eletronico|eletronicos|tecnologia|software)\b/],
  ['🧾',/\b(imposto|impostos|iptu|ipva|tributo|tributos|taxa|taxas)\b/],
  ['💳',/\b(cartao|cartoes|credito|fatura|faturas)\b/],
  ['🏦',/\b(emprestimo|emprestimos|financiamento|divida|dividas|banco|bancos)\b/],
  ['🌱',/\b(reserva|emergencia|poupanca|economia|economias)\b/],
  ['📈',/\b(investimento|investimentos|aposentadoria|previdencia)\b/],
  ['🤝',/\b(doacao|doacoes|caridade|dizimo|ajuda)\b/],
  ['🛍️',/\b(compra|compras|shopping)\b/],
  ['🎯',/\b(meta|metas|sonho|sonhos|objetivo|objetivos)\b/]
];
export function categoryIcon(name){
  const text=String(name||'');
  const explicit=text.match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/u)?.[0];
  if(explicit)return explicit;
  const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
  return rules.find(([,pattern])=>pattern.test(normalized))?.[0]||'📁';
}
