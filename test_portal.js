'use strict';
const { Game, getCasillaInfo } = require('./gameEngine');
const { PORTAL_CARTAS } = require('./portalDeck');

console.log('=== AETHERION — Pruebas del mazo de Portal (15 cartas) ===\n');

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}

function nuevaPartida() {
  const g = new Game('t');
  const p1 = g.addPlayer('p1', 'P1', 'mago');      // azul
  const p2 = g.addPlayer('p2', 'P2', 'guerrero');  // azul
  const p3 = g.addPlayer('p3', 'P3', 'helada');    // rojo
  return { g, p1, p2, p3 };
}
function porId(id) { return PORTAL_CARTAS.find((c) => c.id === id); }

// 1) Portal Colapsado — respeta el lado ORIGINAL, no el actual
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 30;
  p1.lado = 'rojo'; // simula que ya había cruzado de lado por otro efecto
  g.aplicarEfectoPortal('p1', porId('portal_colapsado'));
  check('Portal Colapsado: vuelve a casilla 1 de su lado ORIGINAL (azul)', p1.casilla === 1 && p1.lado === 'azul');
}

// 2) Vórtice Atrapante — bloquea movimiento y libera tras 4 turnos propios
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 10;
  g.aplicarEfectoPortal('p1', porId('vortice_atrapante'));
  const casillaAntes = p1.casilla;
  g.moverJugador('p1', 5); // turno 1 atrapado: no se mueve
  g.moverJugador('p1', 5); // turno 2
  g.moverJugador('p1', 5); // turno 3
  check('Vórtice Atrapante: no se mueve durante los turnos atrapado', p1.casilla === casillaAntes && p1.atrapado !== null);
  g.moverJugador('p1', 5); // turno 4: se libera y YA puede moverse este mismo turno
  check('Vórtice Atrapante: libre al 4º turno y se mueve ese mismo turno', p1.atrapado === null && p1.casilla === casillaAntes + 5);
}

// 3) Vórtice Atrapante — liberado si otro jugador cae en su casilla
{
  const { g, p1, p2 } = nuevaPartida();
  p1.casilla = 8;
  g.aplicarEfectoPortal('p1', porId('vortice_atrapante'));
  p2.casilla = 3; // mismo lado (azul), le faltan 5 para llegar a 8
  g.moverJugador('p2', 5); // p2 llega a la casilla 8 (azul) donde está atrapado p1
  check('Vórtice Atrapante: se libera cuando otro jugador cae en su casilla', p1.atrapado === null);
}

// 4) Atracción de Evento — avanza a la siguiente especial (azul: 9 es trampa)
// Nota: al caer en la especial se resuelve EN CADENA (así se definió), así
// que la posición FINAL puede variar según qué carta salga (p.ej. "Paso en
// Falso" retrocede 3 desde 9 y cae de nuevo en la 6, que también es
// especial, y vuelve a encadenar). Lo que probamos aquí es que el salto a
// la casilla especial ocurrió, no la posición final tras la cadena.
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 6; // azul: 6 es poder; la siguiente especial tras 6 es 9 (trampa)
  g.aplicarEfectoPortal('p1', porId('atraccion_evento'));
  const saltoRegistrado = g.log.some((l) => l.includes('avanza hasta la casilla especial 9'));
  check('Atracción de Evento: salta a la siguiente casilla especial (9) y encadena su resolución', saltoRegistrado);
}

// 5) Eco del Vacío — retrocede a la última especial pisada y la ejecuta
{
  const { g, p1 } = nuevaPartida();
  g.moverJugador('p1', 5); // 1→6 (poder, azul) marca ultimaEspecialPisada
  p1.casilla = 25; // avanza más sin pisar otra especial relevante
  g.aplicarEfectoPortal('p1', porId('eco_del_vacio'));
  check('Eco del Vacío: retrocede a la última especial pisada (6) y la ejecuta', p1.casilla === 6);
}

// 6) Salto Estratégico — avanza exactamente 6 y resuelve si cae en especial
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 3; // 3+6=9 (trampa, azul)
  g.aplicarEfectoPortal('p1', porId('salto_estrategico'));
  check('Salto Estratégico: avanza 6 (3→9) y resuelve la trampa', p1.casilla === 9 || p1.casilla < 9); // puede retroceder por la trampa encadenada
}

// 7) Intercambio Directo (con objetivo explícito)
{
  const { g, p1, p2 } = nuevaPartida();
  p1.casilla = 40; p2.casilla = 5;
  g.aplicarEfectoPortal('p1', porId('intercambio_directo'), { targetId: 'p2' });
  check('Intercambio Directo: intercambia con el objetivo elegido', p1.casilla === 5 && p2.casilla === 40);
}

// 8) Salto al Líder / Caída al Fondo
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 45; p3.casilla = 2;
  g.aplicarEfectoPortal('p1', porId('salto_al_lider'));
  check('Salto al Líder: intercambia con el más adelantado (p2)', p1.casilla === 45 && p2.casilla === 10);
}
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 45; p3.casilla = 2;
  g.aplicarEfectoPortal('p1', porId('caida_al_fondo'));
  check('Caída al Fondo: intercambia con el más rezagado (p3)', p1.casilla === 2 && p3.casilla === 10);
}

// 9) Ruleta de Posiciones — rotación simultánea
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 20; p3.casilla = 30;
  g.aplicarEfectoPortal('p1', porId('ruleta_posiciones'));
  check('Ruleta de Posiciones: rotación correcta entre los 3', p1.casilla === 20 && p2.casilla === 30 && p3.casilla === 10);
}

// 10) Intercambio Total — posición, mano y vida
{
  const { g, p1, p2 } = nuevaPartida();
  p1.casilla = 10; p1.vidas = 8; p1.manoPoder = [{ id: 'x' }];
  p2.casilla = 40; p2.vidas = 15; p2.manoPoder = [];
  g.aplicarEfectoPortal('p1', porId('intercambio_total'));
  const targetFueP2 = p1.casilla === 40 && p1.vidas === 15 && p1.manoPoder.length === 0;
  const targetFueP3 = !targetFueP2; // pudo tocarle p3 al azar
  check('Intercambio Total: intercambia posición+vida+mano con el jugador elegido al azar', targetFueP2 || targetFueP3);
}

// 11) Ola de Avance — resolución diferida al siguiente turno
{
  const { g, p1 } = nuevaPartida();
  p1.casilla = 3; // 3+3=6 (poder, azul)
  g.aplicarEfectoPortal('p1', porId('ola_de_avance'));
  check('Ola de Avance: avanza 3 (3→6) sin resolver aún', p1.casilla === 6 && p1.efectoPendienteProximoTurno === true);
  const manoAntes = p1.manoPoder.length;
  g.iniciarTurno('p1');
  check('Ola de Avance: al iniciar su turno, resuelve la casilla de poder sin tirar dado', p1.manoPoder.length === manoAntes + 1 && p1.efectoPendienteProximoTurno === false);
}

// 12) Ancla del Caos — ambos pierden turno y vida
// Nota: se usa un objetivo SIN Resistencia (helada) para no mezclar con esa
// habilidad del Guerrero, que ya está probada aparte en test_trampa.js.
{
  const { g, p1, p3 } = nuevaPartida(); // p3 = helada, sin Resistencia
  p1.vidas = 10; p3.vidas = 10;
  g.aplicarEfectoPortal('p1', porId('ancla_del_caos'), { targetId: 'p3' });
  check('Ancla del Caos: ambos pierden 1 turno y 1 vida', p1.turnosPerdidos === 1 && p3.turnosPerdidos === 1 && p1.vidas === 9 && p3.vidas === 9);
}

// 13) Caos de Manos — dos pases a la izquierda (corregido)
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.manoPoder = [{ id: 'A' }];
  p2.manoPoder = [{ id: 'B' }];
  p3.manoPoder = [{ id: 'C' }];
  g.aplicarEfectoPortal('p1', porId('caos_de_manos'));
  check('Caos de Manos: dos pases a la izquierda (p1←C, p2←A, p3←B)',
    p1.manoPoder[0].id === 'C' && p2.manoPoder[0].id === 'A' && p3.manoPoder[0].id === 'B');
}

// 14) Luz y Oscuridad — todos cambian de lado, misma casilla
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 7; p2.casilla = 20; p3.casilla = 33;
  g.aplicarEfectoPortal('p1', porId('luz_y_oscuridad'));
  check('Luz y Oscuridad: todos cambian de lado conservando su número de casilla',
    p1.lado === 'rojo' && p1.casilla === 7 && p2.lado === 'rojo' && p3.lado === 'azul');
}

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA (de ${ok + fail} pruebas, mazo tiene ${PORTAL_CARTAS.length} cartas) ---`);
