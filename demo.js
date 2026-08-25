'use strict';
const { Game, getCasillaInfo } = require('./gameEngine');

console.log('=== AETHERION — Demo del motor de reglas ===\n');

const game = new Game('demo-1');
const p1 = game.addPlayer('u1', 'Ana', 'mago');       // azul
const p2 = game.addPlayer('u2', 'Bruno', 'hijoDragon'); // rojo

console.log('\n--- Estado inicial ---');
console.log(`${p1.nombre}: casilla ${p1.casilla} (${p1.lado}), vidas ${p1.vidas}, mano ${p1.manoPoder.length}`);
console.log(`${p2.nombre}: casilla ${p2.casilla} (${p2.lado}), vidas ${p2.vidas}, mano ${p2.manoPoder.length}`);

// Simulación de varios turnos con tiradas de dado fijas (reproducible)
const tiradasAna = [5, 4, 6, 3, 5];   // Ana (azul): 1 ->6->10->16->19->24
const tiradasBruno = [6, 6, 5, 4, 6]; // Bruno (rojo): 1->7->13->18->22->28

console.log('\n--- Turnos ---');
for (let i = 0; i < 5; i++) {
  console.log(`\nTurno ${i + 1}:`);
  game.moverJugador('u1', tiradasAna[i]);
  game.moverJugador('u2', tiradasBruno[i]);
}

console.log('\n--- Registro de eventos (log del motor) ---');
game.log.forEach((line) => console.log('  · ' + line));

console.log('\n--- Estado final ---');
for (const id of ['u1', 'u2']) {
  const p = game.players.get(id);
  const info = getCasillaInfo(p.lado, p.casilla);
  console.log(
    `${p.nombre}: casilla ${p.casilla} (${p.lado}) — tipo de casilla: ${info ? info.tipo : '?'} — vidas ${p.vidas} — mano ${p.manoPoder.length}`
  );
}

// --- Prueba puntual de las reglas ya cerradas ---
console.log('\n--- Pruebas de reglas específicas ---');

// 1) Retroceso con tope en casilla 1 (Colapso Total: -10 casillas)
const g2 = new Game('demo-2');
const p3 = g2.addPlayer('u3', 'Carla', 'sombra');
g2.moverJugador('u3', 4); // casilla 5
g2.retrocederJugador('u3', 10); // debería topar en 1, no en -5
console.log(`Retroceso con tope: Carla en casilla ${p3.casilla} (esperado: 1) -> ${p3.casilla === 1 ? 'OK' : 'FALLA'}`);

// 2) Entrar a Batalla Final sin caer exacto
const g3 = new Game('demo-3');
const p4 = g3.addPlayer('u4', 'Diego', 'guerrero');
g3.moverJugador('u4', 60); // muy por encima de 52
console.log(`Entrada a Batalla Final sin caer exacto: Diego enBatallaFinal=${p4.enBatallaFinal} (esperado true) -> ${p4.enBatallaFinal ? 'OK' : 'FALLA'}`);

// 3) Resistencia del Guerrero (primer golpe -1 vida menos)
const g4 = new Game('demo-4');
const p5 = g4.addPlayer('u5', 'Elena', 'guerrero');
const dañoReal1 = p5.recibirDano(4); // debería aplicar solo 3
const dañoReal2 = p5.recibirDano(4); // debería aplicar los 4 completos
console.log(`Resistencia Guerrero: primer golpe aplicó ${dañoReal1} (esperado 3), segundo golpe aplicó ${dañoReal2} (esperado 4) -> ${dañoReal1 === 3 && dañoReal2 === 4 ? 'OK' : 'FALLA'}`);

// 4) Tope de vida máxima (20)
const g5 = new Game('demo-5');
const p6 = g5.addPlayer('u6', 'Fer', 'helada'); // empieza con 12
p6.ganarVida(15); // 12+15=27, debe topar en 20
console.log(`Tope de vida máxima: Fer tiene ${p6.vidas} vidas (esperado 20) -> ${p6.vidas === 20 ? 'OK' : 'FALLA'}`);

// 5) Regla de 0 vidas (vuelve a casilla 1, recupera 10, pierde mano)
const g6 = new Game('demo-6');
const p7 = g6.addPlayer('u7', 'Gaby', 'alquimista');
g6.moverJugador('u7', 20); // avanza bastante
p7.manoPoder.push({ id: 'x' }, { id: 'y' });
p7.recibirDano(999); // la mata
console.log(`Regla de 0 vidas: Gaby vuelve a casilla ${p7.casilla} (esperado 1) con ${p7.vidas} vidas (esperado 10) y mano de ${p7.manoPoder.length} cartas (esperado 0) -> ${p7.casilla === 1 && p7.vidas === 10 && p7.manoPoder.length === 0 ? 'OK' : 'FALLA'}`);
