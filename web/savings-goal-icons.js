// Small vector illustrations share the sidebar's rounded outline style.
const icons={
 plane:'<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
 pig:'<path d="M7 7a7 7 0 0 1 9-1l3-2v5l2 2v5h-3l-1 4h-3v-3H9v3H6l-1-5a6 6 0 0 1-1-7L2 7v4h2 M9 5h4 M15 10h.01"/>',
 car:'<path d="m5 6-2 7v6h3v-3h12v3h3v-6l-2-7H5Z M3 12h18 M7 15h.01 M17 15h.01"/>',
 home:'<path d="m3 10 9-7 9 7v11H3V10Z M9 21v-8h6v8"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6"/>',
 study:'<path d="m2 9 10-5 10 5-10 5L2 9Z M6 11v6c4 3 8 3 12 0v-6 M22 9v7"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 gift:'<path d="M3 10h18v4H3z M5 14v7h14v-7 M12 10v11 M12 10H8a3 3 0 1 1 3-3l1 3Z M12 10h4a3 3 0 1 0-3-3l-1 3Z"/>',
 tech:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8 M12 17v4"/>',
 pet:'<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="10" rx="2" ry="3"/><ellipse cx="10" cy="6" rx="2" ry="3"/><ellipse cx="16" cy="6" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
};
export function savingsGoalIcon(name){
 const text=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const rules=[[/viagem|viajar|ferias|exterior|europa|italia|grecia|disney|passagem|passeio/,'plane'],[/porca[oã]|porquinho|cofr|poupanca/,'pig'],[/reserva|emergencia|seguranca|aposent/,'shield'],[/carro|moto|veiculo|automovel/,'car'],[/casa|apartamento|reforma|imovel|moradia/,'home'],[/curso|faculdade|estudo|escola|educacao/,'study'],[/casamento|saude|familia|bebe/,'heart'],[/presente|aniversario|natal/,'gift'],[/computador|notebook|celular|iphone|tecnologia|tv|videogame/,'tech'],[/pet|nacho|cachorro|gato/,'pet']];
 const kind=rules.find(([pattern])=>pattern.test(text))?.[1]||'target';
 return `<svg class="savings-goal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-goal-icon="${kind}">${icons[kind]}</svg>`;
}
