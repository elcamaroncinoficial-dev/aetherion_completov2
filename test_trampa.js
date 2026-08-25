'use strict';
const { Game, getCasillaInfo } = require('./gameEngine');
const { TRAMPA_CARTAS } = require('./trampaDeck');

console.log('=== AETHERION — Pruebas del mazo de Trampa (25 cartas) ===\n');

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}

function nuevaPartida(nCasillasInicioP1 = 20) {
  const g = new Game('t');
  const p1 = g.addPlayer('p1', 'P1', 'mago');
  const p2 = g.addPlayer('p2', 'P2', 'guerrero');
  p1.casilla = nCasillasInicioP1;
  return { g, p1, p2 };
}

function porId(id) { return TRAMPA_CARTAS.find((c) => c.id === id); }

// 1) Retrocesos simples
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('caida_subita'));
  check('Caída Súbita: retrocede 2 (20→18)', p1.casilla === 18);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('derrumbe'));
  check('Derrumbe: retrocede 3 (20→17)', p1.casilla === 17);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('abismo_profundo'));
  check('Abismo Profundo: retrocede 5 (20→15)', p1.casilla === 15);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('colapso_total'));
  check('Colapso Total: retrocede 10 (20→10)', p1.casilla === 10);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('colapso_progreso'));
  check('Colapso de Progreso: retrocede 8 (20→12)', p1.casilla === 12);
}

// 2) Tope de retroceso en casilla 1
{
  const { g, p1 } = nuevaPartida(4);
  g.aplicarEfectoTrampa('p1', porId('colapso_total')); // -10 desde 4
  check('Tope en casilla 1: 4-10 → se detiene en 1 (no negativo)', p1.casilla === 1);
}

// 3) Retroceder + pierde turno
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('terreno_quebrado'));
  check('Terreno Quebrado: retrocede 2 y pierde 1 turno', p1.casilla === 18 && p1.turnosPerdidos === 1);
}

// 4) Paso en Falso con efecto en cadena
// Nota: la posición FINAL puede variar según qué carta de Trampa salga al
// azar en la cadena (igual que en Atracción de Evento, ver test_portal.js).
// Lo que probamos es que SÍ llegó a la casilla 9 (trampa) y encadenó.
{
  const { g, p1 } = nuevaPartida(12); // 12-3=9, casilla 9 azul = trampa (según distribución real)
  g.aplicarEfectoTrampa('p1', porId('paso_en_falso'));
  const info = getCasillaInfo('azul', 9);
  const cayoEnLaTrampa = g.log.some((l) => l.includes('cae en casilla especial tras Paso en Falso'));
  check('Paso en Falso: retrocede 3 (12→9) y encadena porque 9 es trampa', cayoEnLaTrampa && info.tipo === 'trampa');
}

// 5) Rebote Forzado
{
  const { g, p1 } = nuevaPartida(1);
  g.moverJugador('p1', 5); // 1→6, casilla 6 azul = poder (marca ultimaEspecialPisada)
  g.moverJugador('p1', 3); // 6→9, casilla 9 azul = trampa -> pero probamos manual abajo
  p1.casilla = 20; // simulamos que avanzó más sin pisar otra especial
  g.aplicarEfectoTrampa('p1', porId('rebote_forzado'));
  check('Rebote Forzado: regresa a la última especial pisada (casilla 6)', p1.casilla === 6);
}
{
  const { g, p1 } = nuevaPartida(5); // aún no pisó ninguna especial
  g.aplicarEfectoTrampa('p1', porId('rebote_forzado'));
  check('Rebote Forzado sin especial previa: sin efecto (se queda en 5)', p1.casilla === 5);
}

// 6) Peso del Liderazgo
{
  const { g, p1, p2 } = nuevaPartida(20);
  p1.vidas = 10; p2.vidas = 5; // p1 lidera en vidas
  g.aplicarEfectoTrampa('p1', porId('peso_liderazgo'));
  check('Peso del Liderazgo (lidera): retrocede 4 (20→16)', p1.casilla === 16);
}
{
  const { g, p1, p2 } = nuevaPartida(20);
  p1.vidas = 5; p2.vidas = 10; // p1 NO lidera
  g.aplicarEfectoTrampa('p1', porId('peso_liderazgo'));
  check('Peso del Liderazgo (no lidera): retrocede 1 (20→19)', p1.casilla === 19);
}
{
  const { g, p1, p2 } = nuevaPartida(20);
  p1.vidas = 10; p2.vidas = 10; // empate → cuenta como "lidera"
  g.aplicarEfectoTrampa('p1', porId('peso_liderazgo'));
  check('Peso del Liderazgo (empate = lidera): retrocede 4 (20→16)', p1.casilla === 16);
}

// 7) Intercambio Bajo
{
  const { g, p1, p2 } = nuevaPartida(20);
  p2.casilla = 3; // p2 va último
  g.aplicarEfectoTrampa('p1', porId('intercambio_bajo'));
  check('Intercambio Bajo: p1 y p2 intercambian posición', p1.casilla === 3 && p2.casilla === 20);
}

// 8) Turnos perdidos
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('pausa_forzada'));
  check('Pausa Forzada: pierde 1 turno', p1.turnosPerdidos === 1);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('paralisis_total'));
  check('Parálisis Total: pierde 2 turnos', p1.turnosPerdidos === 2);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('congelacion'));
  check('Congelación: pierde 1 turno', p1.turnosPerdidos === 1);
}

// 9) Condena Inminente
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('condena_inminente'));
  check('Condena Inminente: activa la bandera condenaInminente', p1.condenaInminente === true);
}

// 10) Bloqueo de poder / Interferencia
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('bloqueo_poder'));
  check('Bloqueo de Poder: bloquea 1 turno', p1.bloqueoPoderTurnos === 1);
}
{
  const { g, p1 } = nuevaPartida(20);
  g.aplicarEfectoTrampa('p1', porId('interferencia'));
  check('Interferencia: bloquea 2 turnos', p1.bloqueoPoderTurnos === 2);
}

// 11) Pérdida de vidas fija
{
  const { g, p1 } = nuevaPartida(20);
  p1.vidas = 10;
  g.aplicarEfectoTrampa('p1', porId('herida_abierta'));
  check('Herida Abierta: pierde 2 vidas (10→8)', p1.vidas === 8);
}
{
  const { g, p1 } = nuevaPartida(20);
  p1.vidas = 10;
  g.aplicarEfectoTrampa('p1', porId('golpe_fuerte'));
  check('Golpe Fuerte: pierde 3 vidas (10→7)', p1.vidas === 7);
}
{
  const { g, p1 } = nuevaPartida(20);
  p1.vidas = 10;
  g.aplicarEfectoTrampa('p1', porId('impacto_critico'));
  check('Impacto Crítico: pierde 4 vidas (10→6)', p1.vidas === 6);
}

// 12) Mitad Vital (con redondeo hacia abajo)
{
  const { g, p1 } = nuevaPartida(20);
  p1.vidas = 9; // mitad = 4 (redondeo abajo), 9-4=5
  g.aplicarEfectoTrampa('p1', porId('mitad_vital'));
  check('Mitad Vital: 9 vidas → pierde 4 → queda en 5', p1.vidas === 5);
}

// 13) Desgaste Acumulado (con tope de 6)
{
  const { g, p1 } = nuevaPartida(45); // floor(45/10)=4 → 4*2=8, pero tope=6
  p1.vidas = 20;
  g.aplicarEfectoTrampa('p1', porId('desgaste_acumulado'));
  check('Desgaste Acumulado: tope de 6 vidas aplicado (20→14, no 20→12)', p1.vidas === 14);
}
{
  const { g, p1 } = nuevaPartida(15); // floor(15/10)=1 → 1*2=2, bajo el tope
  p1.vidas = 20;
  g.aplicarEfectoTrampa('p1', porId('desgaste_acumulado'));
  check('Desgaste Acumulado: sin tocar tope (20→18)', p1.vidas === 18);
}

// 14) Cartas de poder al azar
{
  const { g, p1 } = nuevaPartida(20);
  p1.manoPoder = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  g.aplicarEfectoTrampa('p1', porId('robo_fallido'));
  check('Robo Fallido: pierde 1 carta al azar (3→2)', p1.manoPoder.length === 2);
}
{
  const { g, p1 } = nuevaPartida(20);
  p1.manoPoder = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  g.aplicarEfectoTrampa('p1', porId('vacio_mental'));
  check('Vacío Mental: pierde 2 cartas al azar (3→1)', p1.manoPoder.length === 1);
}
{
  const { g, p1 } = nuevaPartida(20);
  p1.manoPoder = [{ id: 'a' }];
  g.aplicarEfectoTrampa('p1', porId('vacio_mental')); // pide 2 pero solo hay 1
  check('Vacío Mental con menos cartas de las pedidas: no truena, queda en 0', p1.manoPoder.length === 0);
}

// 15) Descartar mano completa
{
  const { g, p1 } = nuevaPartida(20);
  p1.manoPoder = [{ id: 'a' }, { id: 'b' }];
  g.aplicarEfectoTrampa('p1', porId('colapso_mano'));
  check('Colapso de Mano: descarta toda la mano', p1.manoPoder.length === 0);
}

// 16) Decisión Ajena
{
  const { g, p1 } = nuevaPartida(20);
  p1.manoPoder = [{ id: 'a', nombre: 'A' }];
  g.aplicarEfectoTrampa('p1', porId('decision_ajena'));
  check('Decisión Ajena: se descarta 1 carta de la mano', p1.manoPoder.length === 0);
}

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA (de ${ok + fail} pruebas, mazo tiene ${TRAMPA_CARTAS.length} cartas) ---`);
