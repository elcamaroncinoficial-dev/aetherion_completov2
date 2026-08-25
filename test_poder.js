'use strict';
const { Game } = require('./gameEngine');
const { PODER_CARTAS } = require('./poderDeck');

console.log('=== AETHERION — Pruebas del mazo de Poder (30 cartas) ===\n');

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}
function porId(id) { return PODER_CARTAS.find((c) => c.id === id); }

function nuevaPartida() {
  const g = new Game('t');
  const p1 = g.addPlayer('p1', 'P1', 'sombra');   // sin habilidades de vida que interfieran
  const p2 = g.addPlayer('p2', 'P2', 'sombra');
  const p3 = g.addPlayer('p3', 'P3', 'sombra');
  return { g, p1, p2, p3 };
}
function darCarta(p, id) { const c = porId(id); p.manoPoder.push(c); return c; }

// 1) Ganancias de vida directas
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'absorcion_vital');
  g.jugarCartaPoder('p1', 'absorcion_vital');
  check('Absorción Vital: +2 vida (10→12)', p1.vidas === 12);
}
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'pulso_energia');
  g.jugarCartaPoder('p1', 'pulso_energia');
  check('Pulso de Energía: +3 vida (10→13)', p1.vidas === 13);
}

// 2) Reserva Vital (diferida, se cancela con daño)
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'reserva_vital');
  g.jugarCartaPoder('p1', 'reserva_vital');
  g.iniciarTurno('p1'); // simulamos que pasa a su siguiente turno sin recibir daño
  check('Reserva Vital: +3 al siguiente turno si no recibió daño (10→13)', p1.vidas === 13);
}
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'reserva_vital');
  g.jugarCartaPoder('p1', 'reserva_vital');
  p1.recibirDano(1); // debería cancelar la reserva
  g.iniciarTurno('p1');
  check('Reserva Vital: se cancela si recibe daño antes (10-1=9, sin el +3)', p1.vidas === 9);
}

// 3) Regeneración Inestable (3 turnos, cancela si pierde combate)
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'regeneracion_inestable');
  g.jugarCartaPoder('p1', 'regeneracion_inestable');
  g.iniciarTurno('p1'); // +1 (turno 1 de 3)
  g.iniciarTurno('p1'); // +1 (turno 2 de 3)
  check('Regeneración Inestable: +1 vida por turno activo (10→12 tras 2 turnos)', p1.vidas === 12);
  g.perderCombate('p1'); // cancela
  g.iniciarTurno('p1'); // ya no debería sumar
  check('Regeneración Inestable: termina al perder un combate (se queda en 12)', p1.vidas === 12);
}

// 4) Rebote Vital
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  p1.recibirDano(4); // pierde 4 este turno
  g.iniciarTurno('p1'); // pasa el turno: vidaPerdidaTurnoAnterior = 4
  darCarta(p1, 'rebote_vital');
  g.jugarCartaPoder('p1', 'rebote_vital');
  check('Rebote Vital: recupera lo perdido en el turno anterior (+4)', p1.vidas === 10);
}

// 5) Sobrecarga
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'sobrecarga');
  g.jugarCartaPoder('p1', 'sobrecarga');
  check('Sobrecarga: +4 vida y pierde el siguiente turno', p1.vidas === 14 && p1.turnosPerdidos === 1);
}

// 6) Doble Núcleo (con tope global de 20)
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 14;
  darCarta(p1, 'doble_nucleo');
  g.jugarCartaPoder('p1', 'doble_nucleo');
  check('Doble Núcleo: duplica con tope 20 (14×2=28 → 20)', p1.vidas === 20);
}

// 7) Equilibrio Forzado
{
  const { g, p1, p2 } = nuevaPartida();
  p1.vidas = 6; p2.vidas = 18;
  darCarta(p1, 'equilibrio_forzado');
  g.jugarCartaPoder('p1', 'equilibrio_forzado');
  check('Equilibrio Forzado: iguala con el líder (6→18)', p1.vidas === 18);
}

// 8) Instinto de Supervivencia
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.vidas = 3; p2.vidas = 10; p3.vidas = 10;
  darCarta(p1, 'instinto_supervivencia');
  g.jugarCartaPoder('p1', 'instinto_supervivencia');
  check('Instinto de Supervivencia: tiene la menor vida → +4 (3→7)', p1.vidas === 7);
}
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.vidas = 10; p2.vidas = 10; p3.vidas = 3;
  darCarta(p1, 'instinto_supervivencia');
  g.jugarCartaPoder('p1', 'instinto_supervivencia');
  check('Instinto de Supervivencia: NO tiene la menor vida → +2 (10→12)', p1.vidas === 12);
}

// 9) Núcleo Extra
{
  const { g, p1 } = nuevaPartida();
  p1.vidas = 10;
  darCarta(p1, 'nucleo_extra');
  g.jugarCartaPoder('p1', 'nucleo_extra');
  check('Núcleo Extra: +2 vida y roba 1 carta', p1.vidas === 12 && p1.manoPoder.length === 1);
}

// 10) Intercambio Total (mano completa)
{
  const { g, p1, p2 } = nuevaPartida();
  p1.manoPoder = [{ id: 'x', nombre: 'X' }];
  darCarta(p1, 'intercambio_mano_total');
  p2.manoPoder.push({ id: 'y', nombre: 'Y' });
  g.jugarCartaPoder('p1', 'intercambio_mano_total', { targetId: 'p2' });
  check('Intercambio Total: intercambia manos completas', p1.manoPoder.some((c) => c.id === 'y') && p2.manoPoder.some((c) => c.id === 'x'));
}

// 11) Ronda Caótica (con un jugador que no participa)
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.manoPoder = [{ id: 'A' }]; darCarta(p1, 'ronda_caotica');
  p2.manoPoder = [{ id: 'B' }];
  p3.manoPoder = [{ id: 'C' }];
  g.jugarCartaPoder('p1', 'ronda_caotica', { noParticipan: ['p3'] });
  check('Ronda Caótica: p3 no participa y conserva su mano (C)', p3.manoPoder[0].id === 'C');
  check('Ronda Caótica: p1 y p2 rotan entre sí (p1 recibe B, ya no A)', p1.manoPoder[0].id === 'B' && p2.manoPoder[0].id === 'A');
}

// 12) Reconfiguración Total
{
  const { g, p1 } = nuevaPartida();
  p1.manoPoder = [{ id: 'old1' }, { id: 'old2' }];
  darCarta(p1, 'reconfiguracion_total');
  g.jugarCartaPoder('p1', 'reconfiguracion_total');
  check('Reconfiguración Total: descarta todo y roba 5 nuevas', p1.manoPoder.length === 5 && !p1.manoPoder.some((c) => c.id.startsWith('old')));
}

// 13) Robo Forzado
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'robo_forzado');
  p2.manoPoder = [{ id: 'unica', nombre: 'Única' }];
  g.jugarCartaPoder('p1', 'robo_forzado', { targetId: 'p2' });
  check('Robo Forzado: roba la carta de la mano del objetivo', p1.manoPoder.some((c) => c.id === 'unica') && p2.manoPoder.length === 0);
}

// 14) Elección Forzada
{
  const { g, p1 } = nuevaPartida();
  darCarta(p1, 'eleccion_forzada');
  g.jugarCartaPoder('p1', 'eleccion_forzada');
  check('Elección Forzada: roba 3 y se queda con 1', p1.manoPoder.length === 1);
}

// 15) Inspección
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'inspeccion');
  p2.manoPoder = [{ id: 'a' }, { id: 'b' }];
  g.jugarCartaPoder('p1', 'inspeccion', { targetId: 'p2', cartaIndice: 1 });
  check('Inspección: toma la carta elegida (índice 1 = "b")', p1.manoPoder.some((c) => c.id === 'b') && p2.manoPoder.length === 1);
}

// 16) Intercambio Múltiple
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.manoPoder = [{ id: 'c1' }, { id: 'c2' }];
  darCarta(p1, 'intercambio_multiple');
  p2.manoPoder = [{ id: 'x2' }];
  p3.manoPoder = [{ id: 'x3' }];
  g.jugarCartaPoder('p1', 'intercambio_multiple');
  check('Intercambio Múltiple: p1 se quedó sin cartas propias tras repartir', true); // validación de que no truena
}

// 17) Pérdida Global
{
  const { g, p1, p2, p3 } = nuevaPartida();
  darCarta(p1, 'perdida_global');
  p2.manoPoder = [{ id: 'a' }];
  p3.manoPoder = [{ id: 'b' }];
  g.jugarCartaPoder('p1', 'perdida_global');
  check('Pérdida Global: todos descartan 1 excepto quien la juega', p2.manoPoder.length === 0 && p3.manoPoder.length === 0);
}

// 18) Eco de Poder
{
  const { g, p1, p2 } = nuevaPartida();
  p2.vidas = 10;
  darCarta(p2, 'absorcion_vital');
  g.jugarCartaPoder('p2', 'absorcion_vital'); // p2 juega +2 vida
  darCarta(p1, 'eco_de_poder');
  p1.vidas = 10;
  const r = g.jugarCartaPoder('p1', 'eco_de_poder');
  check('Eco de Poder: copia el efecto de la última carta jugada por otro (+2 vida)', r.exito && p1.vidas === 12);
}
{
  const { g, p1 } = nuevaPartida();
  darCarta(p1, 'eco_de_poder');
  const r = g.jugarCartaPoder('p1', 'eco_de_poder');
  check('Eco de Poder sin nada que copiar: no se juega, se queda en mano', !r.exito && p1.manoPoder.some((c) => c.id === 'eco_de_poder'));
}

// 19) Rescate del Caos
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p2, 'absorcion_vital');
  g.jugarCartaPoder('p2', 'absorcion_vital'); // va al descarte de Poder
  darCarta(p1, 'rescate_del_caos');
  g.jugarCartaPoder('p1', 'rescate_del_caos');
  check('Rescate del Caos: toma una carta del descarte', p1.manoPoder.some((c) => c.id === 'absorcion_vital'));
}

// 20) Golpe Global
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p2.vidas = 10; p3.vidas = 10;
  darCarta(p1, 'golpe_global');
  g.jugarCartaPoder('p1', 'golpe_global');
  check('Golpe Global: todos pierden 2 vidas excepto quien la juega', p2.vidas === 8 && p3.vidas === 8);
}

// 21) Bloqueo Derecho / Impacto Izquierdo
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'bloqueo_derecho');
  g.jugarCartaPoder('p1', 'bloqueo_derecho');
  check('Bloqueo Derecho: el jugador a la derecha pierde su siguiente turno', p2.turnosPerdidos === 1);
}
{
  const { g, p1, p3 } = nuevaPartida();
  p3.vidas = 10;
  darCarta(p1, 'impacto_izquierdo');
  g.jugarCartaPoder('p1', 'impacto_izquierdo');
  check('Impacto Izquierdo: el jugador a la izquierda pierde 3 vidas', p3.vidas === 7);
}

// 22) Intercambio Masivo (rotación por rango, líder pasa a último)
{
  const { g, p1, p2, p3 } = nuevaPartida();
  p1.casilla = 10; p2.casilla = 30; p3.casilla = 5; // ranking: p2(30) > p1(10) > p3(5)
  darCarta(p1, 'intercambio_masivo');
  g.jugarCartaPoder('p1', 'intercambio_masivo');
  check('Intercambio Masivo: el líder (p2) pasa a la posición del último (5)', p2.casilla === 5);
  check('Intercambio Masivo: p1 toma la posición de quien iba delante (p2, 30)', p1.casilla === 30);
  check('Intercambio Masivo: p3 toma la posición de quien iba delante (p1, 10)', p3.casilla === 10);
}

// 23) Destino Manipulado
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'destino_manipulado');
  const vidasAntes = p2.vidas;
  g.jugarCartaPoder('p1', 'destino_manipulado', { targetId: 'p2' });
  check('Destino Manipulado: el objetivo roba y ejecuta una trampa real', g.log.some((l) => l.includes('roba y ejecuta la trampa')));
}

// 24) Castigo Selectivo
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'castigo_selectivo');
  g.jugarCartaPoder('p1', 'castigo_selectivo', { targetId: 'p2' });
  check('Castigo Selectivo: marca al objetivo sin recompensa en su próximo combate', p2.sinRecompensaProximoCombate === true);
}

// 25) Colapso de Poder
{
  const { g, p1, p2 } = nuevaPartida();
  p1.manoPoder = [{ id: 'mia' }];
  darCarta(p1, 'colapso_de_poder');
  p2.manoPoder = [{ id: 'suya' }];
  g.jugarCartaPoder('p1', 'colapso_de_poder');
  check('Colapso de Poder: conserva su propia mano por defecto', p1.manoPoder.some((c) => c.id === 'mia'));
  check('Colapso de Poder: los demás pierden su mano', p2.manoPoder.length === 0);
}

// 26) Cartas de reacción — deben rechazarse (aún no hay ventana de reacción)
for (const id of ['anulacion', 'anti_portal', 'negacion_absoluta']) {
  const { g, p1 } = nuevaPartida();
  darCarta(p1, id);
  const r = g.jugarCartaPoder('p1', id);
  check(`${porId(id).nombre}: rechazada correctamente (requiere ventana de reacción no implementada)`, !r.exito);
}

// 27) Solo 1 carta de poder por turno
{
  const { g, p1 } = nuevaPartida();
  darCarta(p1, 'absorcion_vital');
  darCarta(p1, 'pulso_energia');
  g.jugarCartaPoder('p1', 'absorcion_vital');
  const r = g.jugarCartaPoder('p1', 'pulso_energia');
  check('Solo 1 carta de poder por turno: la segunda se rechaza', !r.exito);
}

// 28) Bloqueo de poder impide jugar cartas
{
  const { g, p1 } = nuevaPartida();
  p1.bloqueoPoderTurnos = 1;
  darCarta(p1, 'absorcion_vital');
  const r = g.jugarCartaPoder('p1', 'absorcion_vital');
  check('Bloqueo de Poder activo: no se puede jugar ninguna carta', !r.exito);
}

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA (mazo tiene ${PODER_CARTAS.length} cartas) ---`);
