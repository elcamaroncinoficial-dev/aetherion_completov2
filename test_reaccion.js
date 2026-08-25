'use strict';
const { Game } = require('./gameEngine');
const { PODER_CARTAS } = require('./poderDeck');

console.log('=== AETHERION — Pruebas de la ventana de reacción ===\n');

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}
function porId(id) { return PODER_CARTAS.find((c) => c.id === id); }

function nuevaPartida() {
  const g = new Game('t');
  const p1 = g.addPlayer('p1', 'P1', 'sombra');
  const p2 = g.addPlayer('p2', 'P2', 'sombra');
  const p3 = g.addPlayer('p3', 'P3', 'sombra');
  return { g, p1, p2, p3 };
}
function darCarta(p, id) { p.manoPoder.push(porId(id)); }

// 1) Sin reacción: el efecto se aplica normalmente al cerrar la ventana
{
  const { g, p1, p2 } = nuevaPartida();
  p2.vidas = 10;
  darCarta(p1, 'impacto_izquierdo'); // no requiere target explícito, pero probamos con golpe_global-like
  darCarta(p1, 'golpe_global');
  const r = g.jugarCartaPoderConVentana('p1', 'golpe_global');
  check('Se abre la ventana y NO se aplica todavía', r.exito && p2.vidas === 10);
  g.cerrarVentanaReaccion(r.ventanaId);
  check('Al cerrar sin reacciones, el efecto se aplica', p2.vidas === 8);
}

// 2) Negación Absoluta cancela un Poder jugado contra el que reacciona
{
  const { g, p1, p2 } = nuevaPartida();
  p2.vidas = 10;
  darCarta(p1, 'impacto_izquierdo'); // p1's izquierda es p3, no p2 — usamos objetivo_sin_recompensa como ejemplo con target real
  darCarta(p1, 'destino_manipulado');
  darCarta(p2, 'negacion_absoluta');
  const r = g.jugarCartaPoderConVentana('p1', 'destino_manipulado', { targetId: 'p2' });
  const reac = g.jugarCartaReaccion('p2', 'negacion_absoluta', r.ventanaId);
  check('Negación Absoluta: la reacción se acepta (carta jugada contra el reactor)', reac.exito);
  const cierre = g.cerrarVentanaReaccion(r.ventanaId);
  check('Negación Absoluta: el efecto queda cancelado, no se ejecuta la trampa', cierre.cancelado && !g.log.some((l) => l.includes('roba y ejecuta la trampa')));
  check('Negación Absoluta: la carta se retira de la mano de quien reaccionó', !p2.manoPoder.some((c) => c.id === 'negacion_absoluta'));
}

// 3) Negación Absoluta NO puede cancelar un Poder que no la tiene a ella como objetivo
{
  const { g, p1, p2, p3 } = nuevaPartida();
  darCarta(p1, 'destino_manipulado');
  darCarta(p3, 'negacion_absoluta'); // p3 NO es el objetivo (lo es p2)
  const r = g.jugarCartaPoderConVentana('p1', 'destino_manipulado', { targetId: 'p2' });
  const reac = g.jugarCartaReaccion('p3', 'negacion_absoluta', r.ventanaId);
  check('Negación Absoluta: rechazada si el reactor NO era el objetivo del poder', !reac.exito);
}

// 4) Anti-Portal solo cancela ventanas de tipo portal
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'golpe_global');
  darCarta(p2, 'anti_portal');
  const r = g.jugarCartaPoderConVentana('p1', 'golpe_global');
  const reac = g.jugarCartaReaccion('p2', 'anti_portal', r.ventanaId);
  check('Anti-Portal: rechazada contra una ventana de tipo "poder"', !reac.exito);
  g.cerrarVentanaReaccion(r.ventanaId); // limpiar
}
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p2, 'anti_portal');
  const r = g.resolverCasillaPortalConVentana('p1');
  const reac = g.jugarCartaReaccion('p2', 'anti_portal', r.ventanaId);
  check('Anti-Portal: aceptada contra una ventana de tipo "portal"', reac.exito);
  const cierre = g.cerrarVentanaReaccion(r.ventanaId);
  check('Anti-Portal: el portal queda cancelado, no se ejecuta', cierre.cancelado);
}

// 5) Anulación cancela cualquier tipo de ventana
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p2, 'anulacion');
  const r = g.resolverCasillaPortalConVentana('p1');
  const reac = g.jugarCartaReaccion('p2', 'anulacion', r.ventanaId);
  check('Anulación: cancela una ventana de portal', reac.exito);
  g.cerrarVentanaReaccion(r.ventanaId);
}
{
  const { g, p1, p2 } = nuevaPartida();
  darCarta(p1, 'golpe_global');
  darCarta(p2, 'anulacion');
  const r = g.jugarCartaPoderConVentana('p1', 'golpe_global');
  const reac = g.jugarCartaReaccion('p2', 'anulacion', r.ventanaId);
  check('Anulación: cancela también una ventana de poder', reac.exito);
  g.cerrarVentanaReaccion(r.ventanaId);
}

// 6) No se puede reaccionar dos veces a la misma ventana
{
  const { g, p1, p2, p3 } = nuevaPartida();
  darCarta(p1, 'golpe_global');
  darCarta(p2, 'anulacion');
  darCarta(p3, 'anulacion');
  const r = g.jugarCartaPoderConVentana('p1', 'golpe_global');
  const reac1 = g.jugarCartaReaccion('p2', 'anulacion', r.ventanaId);
  const reac2 = g.jugarCartaReaccion('p3', 'anulacion', r.ventanaId);
  check('Primera reacción se acepta', reac1.exito);
  check('Segunda reacción a la misma ventana ya cancelada se rechaza', !reac2.exito);
  g.cerrarVentanaReaccion(r.ventanaId);
}

// 7) Las cartas de reacción NO se pueden jugar por la vía normal (jugarCartaPoder)
{
  const { g, p1 } = nuevaPartida();
  darCarta(p1, 'anulacion');
  const r = g.jugarCartaPoder('p1', 'anulacion');
  check('jugarCartaPoder normal rechaza cartas de reacción', !r.exito);
}

// 8) jugarCartaPoderConVentana rechaza cartas de reacción (deben ir por jugarCartaReaccion)
{
  const { g, p1 } = nuevaPartida();
  darCarta(p1, 'anulacion');
  const r = g.jugarCartaPoderConVentana('p1', 'anulacion');
  check('jugarCartaPoderConVentana también rechaza cartas de reacción como jugada normal', !r.exito);
}

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA ---`);
