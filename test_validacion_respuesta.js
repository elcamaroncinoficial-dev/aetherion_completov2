'use strict';
const { validarRespuestaCombate } = require('./gameEngine');
const { COMBATE_CARTAS } = require('./combateDeck');

console.log('=== AETHERION — Pruebas de validación automática de Combate ===\n');
let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`OK   ${nombre}`); }
  else { fail++; console.log(`FALLA ${nombre}`); }
}
function porId(id) { return COMBATE_CARTAS.find((c) => c.id === id); }

// Respuestas correctas tal cual, con variaciones realistas de tipeo
check('AMAR exacta', validarRespuestaCombate(porId('inversion_util'), 'AMAR').correcto === true);
check('amar minúsculas', validarRespuestaCombate(porId('inversion_util'), 'amar').correcto === true);
check('  amar  con espacios', validarRespuestaCombate(porId('inversion_util'), '  amar  ').correcto === true);
check('AMAR incorrecta (RAMA)', validarRespuestaCombate(porId('inversion_util'), 'RAMA').correcto === false);
check('vacío = incorrecto (tiempo agotado)', validarRespuestaCombate(porId('inversion_util'), '').correcto === false);

check('METAFORA sin acento en respuesta oficial, jugador con acento', validarRespuestaCombate(porId('campo_semantico'), 'metáfora').correcto === true);
check('DIRECCION jugador con acento (dirección)', validarRespuestaCombate(porId('analogia_logica'), 'dirección').correcto === true);

// Multi-parte: las 3 deben aparecer, en cualquier orden
check('ROMA,RAMO,MORA — las 3 en cualquier orden', validarRespuestaCombate(porId('anagrama_triple'), 'mora, roma y rama... digo ramo').correcto === true);
check('ROMA,RAMO,MORA — falta una', validarRespuestaCombate(porId('anagrama_triple'), 'roma y ramo').correcto === false);
check('CABRA,MILANESA ambas presentes', validarRespuestaCombate(porId('anagrama_doble'), 'cabra milanesa').correcto === true);
check('Van Gogh y Che Guevara — ambos nombres', validarRespuestaCombate(porId('doble_identidad'), 'fue van gogh y también che guevara').correcto === true);
check('Van Gogh y Che Guevara — falta uno', validarRespuestaCombate(porId('doble_identidad'), 'van gogh').correcto === false);

// Numéricas
check('respuesta numérica 1939 exacta', validarRespuestaCombate(porId('fecha_clave'), '1939').correcto === true);
check('respuesta numérica con texto alrededor', validarRespuestaCombate(porId('fecha_clave'), 'fue en 1939').correcto === true);
check('respuesta numérica incorrecta', validarRespuestaCombate(porId('fecha_clave'), '1940').correcto === false);

// Tarjetas abiertas: no evaluables automáticamente
check('orden_numeros es "abierta" (no evaluable)', validarRespuestaCombate(porId('orden_numeros'), 'cualquier cosa').evaluable === false);
check('palabra_espejo es "abierta" (no evaluable)', validarRespuestaCombate(porId('palabra_espejo'), 'reconocer').evaluable === false);

// Barrido: todas las cartas evaluables deben reconocer su propia respuesta oficial como correcta
let barridoOk = true;
for (const carta of COMBATE_CARTAS) {
  if (carta.validacion === 'abierta') continue;
  const r = validarRespuestaCombate(carta, carta.respuesta);
  if (!r.correcto) { barridoOk = false; console.log(`  ! ${carta.id} no reconoce su propia respuesta oficial: "${carta.respuesta}"`); }
}
check('Las 28 cartas evaluables reconocen su propia respuesta oficial', barridoOk);

console.log(`\n--- Resultado: ${ok} OK / ${fail} FALLA ---`);
