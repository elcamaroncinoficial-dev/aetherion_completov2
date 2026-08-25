'use strict';
const { Game } = require('./gameEngine');
const { COMBATE_CARTAS } = require('./combateDeck');

console.log('=== AETHERION — Pruebas del mazo de Combate (30 cartas) ===\n');

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}
function porId(id) { return COMBATE_CARTAS.find((c) => c.id === id); }

function nuevaPartida() {
  const g = new Game('t');
  const p1 = g.addPlayer('p1', 'P1', 'sombra');
  const p2 = g.addPlayer('p2', 'P2', 'sombra');
  const p3 = g.addPlayer('p3', 'P3', 'sombra');
  return { g, p1, p2, p3 };
}
function darCombate(p, id) { p.combateActivo = porId(id); }

// 1) Caso simple: vida y movimiento (Inversión Útil)
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCombate(p1, 'inversion_util');
  g.resolverCombate('p1', true, 'A');
  check('Inversión Útil recompensaA: +1 vida (10→11)', p1.vidas === 11);
}
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 10;
  darCombate(p1, 'inversion_util');
  g.resolverCombate('p1', false, 'B');
  check('Inversión Útil castigoB: retrocede 1 (10→9)', p1.casilla === 9);
}

// 2) Afecta a otro jugador (derecha) + robo del mazo
{
  const { g, p1, p2 } = nuevaPartida();
  p2.casilla = 10;
  darCombate(p1, 'anagrama_triple');
  g.resolverCombate('p1', true, 'A');
  check('Anagrama Triple recompensaA: el de la derecha retrocede 1', p2.casilla === 9);
}
{
  const { g, p1 } = nuevaPartida();
  darCombate(p1, 'anagrama_triple');
  g.resolverCombate('p1', true, 'B');
  check('Anagrama Triple recompensaB: roba 1 carta de Poder del mazo', p1.manoPoder.length === 1);
}
{
  const { g, p1 } = nuevaPartida();
  darCombate(p1, 'anagrama_triple');
  g.resolverCombate('p1', false, 'B');
  check('Anagrama Triple castigoB: roba y ejecuta una Trampa (revisar log)', g.log.some((l) => l.includes('roba y ejecuta la trampa')));
}

// 3) Objetivo "elegido"
{
  const { g, p1, p2 } = nuevaPartida();
  p2.vidas = 10;
  darCombate(p1, 'anagrama_total');
  g.resolverCombate('p1', true, 'A', { targetId: 'p2' });
  check('Anagrama Total recompensaA: el elegido pierde 1 vida', p2.vidas === 9);
}

// 4) Todos excepto yo
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 20; p2.casilla = 20; p3.casilla = 20;
  darCombate(p1, 'orden_numeros');
  g.resolverCombate('p1', true, 'A');
  check('Orden de los Números recompensaA: todos retroceden excepto quien resolvió', p1.casilla === 20 && p2.casilla === 19 && p3.casilla === 19);
}

// 5) Intercambio con la izquierda (mismo resultado en recompensa y castigo)
{
  const { g, p1, p3 } = nuevaPartida(); // p3 es la izquierda de p1 en el orden de turno (p1,p2,p3 circular)
  p1.casilla = 5; p3.casilla = 40;
  darCombate(p1, 'calculo_estrategico');
  g.resolverCombate('p1', true, 'A');
  check('Cálculo Estratégico: intercambia con la izquierda', p1.casilla === 40 && p3.casilla === 5);
}

// 6) Más adelantado / más rezagado
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 45; p3.casilla = 3;
  darCombate(p1, 'secuencia_numerica');
  g.resolverCombate('p1', true, 'B');
  check('Secuencia Numérica recompensaB: el más adelantado retrocede 2', p2.casilla === 43);
}
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 45; p3.casilla = 3;
  darCombate(p1, 'secuencia_numerica');
  g.resolverCombate('p1', false, 'B');
  check('Secuencia Numérica castigoB: el más rezagado avanza 2', p3.casilla === 5);
}

// 7) Robar de la mano de otro jugador (no del mazo)
{
  const { g, p1, p2 } = nuevaPartida();
  p2.manoPoder = [{ id: 'x', nombre: 'X' }];
  darCombate(p1, 'conteo_figuras');
  g.resolverCombate('p1', true, 'A'); // p2 es la derecha de p1
  check('Conteo de Figuras recompensaA: roba la carta de la mano del vecino derecho', p1.manoPoder.some((c) => c.id === 'x') && p2.manoPoder.length === 0);
}

// 8) Descartar cartas de poder (propias o de otro)
{
  const { g, p1 } = nuevaPartida();
  p1.manoPoder = [{ id: 'a' }, { id: 'b' }];
  darCombate(p1, 'elemento_dificil');
  g.resolverCombate('p1', false, 'A');
  check('Elemento Difícil castigoA: descarta 2 cartas propias', p1.manoPoder.length === 0);
}

// 9) Intercambio con "más cercano" (Doble Identidad)
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 20; p2.casilla = 22; p3.casilla = 45; // p2 es el más cercano a p1
  darCombate(p1, 'doble_identidad');
  g.resolverCombate('p1', false, 'A');
  check('Doble Identidad castigoA: intercambia con el más cercano (p2)', p1.casilla === 22 && p2.casilla === 20);
}

// 10) Combinación de 2 acciones en un mismo resultado
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10; p1.casilla = 10;
  darCombate(p1, 'fecha_clave');
  g.resolverCombate('p1', true, 'B');
  check('Fecha Clave recompensaB: +2 vida y avanza 1 (combinación de 2 acciones)', p1.vidas === 12 && p1.casilla === 11);
}

// 11) Castigo Selectivo bloquea la recompensa del próximo combate ganado
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  p1.sinRecompensaProximoCombate = true;
  darCombate(p1, 'inversion_util');
  const r = g.resolverCombate('p1', true, 'A');
  check('Castigo Selectivo: gana el combate pero no recibe recompensa', p1.vidas === 10 && r.aplicado.includes('Castigo Selectivo'));
}

// 12) Perder un combate bajo Condena Inminente añade 1 turno extra
{
  const { g, p1 } = nuevaPartida();
  p1.condenaInminente = true;
  darCombate(p1, 'inversion_util');
  g.resolverCombate('p1', false, 'A');
  check('Condena Inminente: perder el combate añade 1 turno extra perdido', p1.turnosPerdidos === 1 && p1.condenaInminente === false);
}

// 13) Perder un combate cancela Regeneración Inestable
{
  const { g, p1 } = nuevaPartida();
  p1.regeneracionInestable = { valor: 1, turnosRestantes: 2 };
  darCombate(p1, 'inversion_util');
  g.resolverCombate('p1', false, 'A');
  check('Perder combate cancela Regeneración Inestable', p1.regeneracionInestable === null);
}

// 14) Recorrido rápido: las 30 cartas responden sin errores en las 4 variantes
{
  let total = 0, sinError = 0;
  for (const carta of COMBATE_CARTAS) {
    for (const [gano, opcion] of [[true, 'A'], [true, 'B'], [false, 'A'], [false, 'B']]) {
      const { g, p1 } = nuevaPartida();
      p1.vidas = 10; p1.casilla = 25;
      darCombate(p1, carta.id);
      try {
        g.resolverCombate('p1', gano, opcion, { targetId: 'p2' });
        sinError++;
      } catch (e) {
        console.log(`  ! Error en ${carta.id} (${gano ? 'recompensa' : 'castigo'}${opcion}): ${e.message}`);
      }
      total++;
    }
  }
  check(`Las 30 cartas × 4 variantes (${total} combinaciones) se resuelven sin errores`, sinError === total);
}

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA (mazo tiene ${COMBATE_CARTAS.length} cartas) ---`);
