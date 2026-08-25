'use strict';
/**
 * Las 30 cartas de Combate. Cada una tiene 4 resultados posibles según
 * lo que decida el jugador que resolvió el reto (siempre quien jugó
 * elige el objetivo en los efectos que dicen "elegido"):
 *   - recompensaA / recompensaB (si acierta el reto)
 *   - castigoA / castigoB (si falla el reto)
 *
 * Cada resultado es un array de "micro-acciones" que interpreta
 * gameEngine.resolverCombate(). Vocabulario de acciones:
 *   { accion:'vida',            objetivo, valor }   valor +/- vida
 *   { accion:'mover',           objetivo, valor }   valor +/- casillas (avanza/retrocede)
 *   { accion:'intercambiar',    objetivo }           intercambia posición con objetivo
 *   { accion:'robarMazoPoder',  objetivo, valor }    roba del mazo de Poder
 *   { accion:'robarMazoTrampa', objetivo, valor }    roba del mazo de Trampa (y se ejecuta)
 *   { accion:'robarManoPoder',  de, a, valor }        roba carta(s) de la MANO de otro jugador
 *   { accion:'descartarPoder',  objetivo, valor }     descarta cartas de poder de la mano
 *
 * objetivo puede ser: 'yo' | 'derecha' | 'izquierda' | 'todos_excepto_yo'
 *   | 'mas_adelantado' | 'mas_rezagado' | 'mas_cercano' | 'elegido'
 * ('elegido' requiere opciones.targetId al resolver)
 *
 * El campo `respuesta` ahora SÍ se usa para validar automáticamente lo
 * que escribe el jugador (ver gameEngine.validarRespuestaCombate):
 *   - por defecto ('exacta'): se compara ignorando mayúsculas, acentos
 *     y espacios sobrantes. Si `respuesta` trae varias partes separadas
 *     por coma (p.ej. "ROMA, RAMO, MORA"), deben aparecer las 3 en el
 *     texto del jugador, sin importar el orden.
 *   - `validacion: 'abierta'`: no hay una única respuesta correcta que
 *     comparar (p.ej. un palíndromo cualquiera, o una explicación de
 *     patrón) — el cliente cae de vuelta a que el propio jugador
 *     confirme si acertó, igual que en la mesa física.
 */
const COMBATE_CARTAS = [
  {
    id: 'inversion_util', nombre: 'Inversión Útil', respuesta: 'AMAR', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'mover', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -1 }],
    castigoB: [{ accion: 'mover', objetivo: 'yo', valor: -1 }],
  },
  {
    id: 'anagrama_triple', nombre: 'Anagrama Triple', respuesta: 'ROMA, RAMO, MORA', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'derecha', valor: -1 }],
    recompensaB: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'mover', objetivo: 'derecha', valor: 1 }],
    castigoB: [{ accion: 'robarMazoTrampa', objetivo: 'yo', valor: 1 }],
  },
  {
    id: 'campo_semantico', nombre: 'Campo Semántico', respuesta: 'METAFORA', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'yo', valor: 2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'izquierda', valor: -1 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -2 }],
    castigoB: [{ accion: 'vida', objetivo: 'izquierda', valor: 1 }],
  },
  {
    id: 'secuencia_oculta', nombre: 'Secuencia Oculta', respuesta: 'OCTUBRE', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'yo', valor: 2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 1 }, { accion: 'robarMazoPoder', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'mover', objetivo: 'yo', valor: -2 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -1 }, { accion: 'robarMazoTrampa', objetivo: 'yo', valor: 1 }],
  },
  {
    id: 'analogia_logica', nombre: 'Analogía Lógica', respuesta: 'DIRECCION', tiempoSegundos: 30,
    recompensaA: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'descartarPoder', objetivo: 'elegido', valor: 1 }],
    castigoA: [{ accion: 'descartarPoder', objetivo: 'yo', valor: 1 }],
    castigoB: [{ accion: 'robarMazoPoder', objetivo: 'elegido', valor: 1 }],
  },
  {
    id: 'conteo_espacial', nombre: 'Conteo Espacial', respuesta: '5', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'yo', valor: 1 }, { accion: 'mover', objetivo: 'derecha', valor: -1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'mover', objetivo: 'yo', valor: -1 }, { accion: 'mover', objetivo: 'derecha', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -1 }],
  },
  {
    id: 'anagrama_total', nombre: 'Anagrama Total', respuesta: 'DESCANSAR', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'elegido', valor: -1 }],
    recompensaB: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -1 }],
    castigoB: [{ accion: 'vida', objetivo: 'elegido', valor: 1 }],
  },
  {
    id: 'orden_numeros', nombre: 'Orden de los Números', respuesta: 'Orden alfabético en español', validacion: 'abierta', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: -1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -2 }],
  },
  {
    id: 'calculo_estrategico', nombre: 'Cálculo Estratégico', respuesta: '24', tiempoSegundos: 30,
    recompensaA: [{ accion: 'intercambiar', objetivo: 'izquierda' }],
    recompensaB: [{ accion: 'mover', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'intercambiar', objetivo: 'izquierda' }],
    castigoB: [{ accion: 'mover', objetivo: 'yo', valor: -1 }],
  },
  {
    id: 'secuencia_numerica', nombre: 'Secuencia Numérica', respuesta: '20', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'yo', valor: 2 }, { accion: 'mover', objetivo: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'mover', objetivo: 'mas_adelantado', valor: -2 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -2 }, { accion: 'mover', objetivo: 'yo', valor: -1 }],
    castigoB: [{ accion: 'mover', objetivo: 'mas_rezagado', valor: 2 }],
  },
  {
    id: 'anagrama_doble', nombre: 'Anagrama Doble', respuesta: 'CABRA, MILANESA', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'yo', valor: 3 }],
    recompensaB: [{ accion: 'mover', objetivo: 'yo', valor: 3 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -3 }],
    castigoB: [{ accion: 'mover', objetivo: 'yo', valor: -3 }],
  },
  {
    id: 'anagrama_selectivo', nombre: 'Anagrama Selectivo', respuesta: 'NUBE', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'mas_adelantado', valor: -2 }],
    recompensaB: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'mover', objetivo: 'mas_rezagado', valor: 2 }],
    castigoB: [{ accion: 'descartarPoder', objetivo: 'yo', valor: 2 }],
  },
  {
    id: 'fecha_clave', nombre: 'Fecha Clave', respuesta: '1939', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'elegido', valor: -2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 2 }, { accion: 'mover', objetivo: 'yo', valor: 1 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -2 }],
    castigoB: [{ accion: 'vida', objetivo: 'elegido', valor: 2 }],
  },
  {
    id: 'conteo_figuras', nombre: 'Conteo de Figuras', respuesta: '5', tiempoSegundos: 30,
    recompensaA: [{ accion: 'robarManoPoder', de: 'derecha', a: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'mover', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'robarManoPoder', de: 'yo', a: 'derecha', valor: 1 }],
    castigoB: [{ accion: 'mover', objetivo: 'yo', valor: -2 }],
  },
  {
    id: 'quien_soy', nombre: '¿Quién soy?', respuesta: 'Albert Einstein', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'todos_excepto_yo', valor: -1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 3 }],
    castigoA: [{ accion: 'vida', objetivo: 'todos_excepto_yo', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -3 }],
  },
  {
    id: 'palabra_precisa', nombre: 'Palabra Precisa', respuesta: 'PASAJERO', tiempoSegundos: 30,
    recompensaA: [{ accion: 'intercambiar', objetivo: 'mas_adelantado' }],
    recompensaB: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'intercambiar', objetivo: 'mas_rezagado' }],
    castigoB: [{ accion: 'descartarPoder', objetivo: 'yo', valor: 2 }],
  },
  {
    id: 'serie_alfabetica', nombre: 'Serie Alfabética', respuesta: 'U', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'yo', valor: 2 }, { accion: 'mover', objetivo: 'elegido', valor: -2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 3 }],
    castigoA: [{ accion: 'mover', objetivo: 'yo', valor: -2 }, { accion: 'mover', objetivo: 'elegido', valor: 2 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -3 }],
  },
  {
    id: 'palabra_espejo', nombre: 'Palabra Espejo', respuesta: 'Palíndromo (respuesta abierta)', validacion: 'abierta', tiempoSegundos: 30,
    recompensaA: [{ accion: 'robarManoPoder', de: 'mas_adelantado', a: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'elegido', valor: -2 }],
    castigoA: [{ accion: 'robarManoPoder', de: 'yo', a: 'mas_adelantado', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -2 }],
  },
  {
    id: 'elemento_oculto', nombre: 'Elemento Oculto', respuesta: 'PLATA', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: -1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 4 }],
    castigoA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -4 }],
  },
  {
    id: 'secuencia_alterna', nombre: 'Secuencia Alterna', respuesta: '50', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'yo', valor: 4 }],
    recompensaB: [{ accion: 'robarMazoPoder', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'mover', objetivo: 'yo', valor: -4 }],
    castigoB: [{ accion: 'descartarPoder', objetivo: 'yo', valor: 2 }],
  },
  {
    id: 'anagrama_maestro', nombre: 'Anagrama Maestro', respuesta: 'ALMACENAR', tiempoSegundos: 30,
    recompensaA: [{ accion: 'vida', objetivo: 'yo', valor: 5 }],
    recompensaB: [{ accion: 'mover', objetivo: 'yo', valor: 5 }],
    castigoA: [{ accion: 'vida', objetivo: 'yo', valor: -5 }],
    castigoB: [{ accion: 'mover', objetivo: 'yo', valor: -5 }],
  },
  {
    id: 'intruso_numerico', nombre: 'Intruso Numérico', respuesta: '27', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'mas_adelantado', valor: -4 }],
    recompensaB: [{ accion: 'vida', objetivo: 'elegido', valor: -3 }],
    castigoA: [{ accion: 'mover', objetivo: 'mas_rezagado', valor: 4 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -3 }],
  },
  {
    id: 'calculo_encadenado', nombre: 'Cálculo Encadenado', respuesta: '33', tiempoSegundos: 30,
    recompensaA: [{ accion: 'robarManoPoder', de: 'derecha', a: 'yo', valor: 1 }, { accion: 'robarMazoPoder', objetivo: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 4 }, { accion: 'mover', objetivo: 'yo', valor: 2 }],
    castigoA: [{ accion: 'robarManoPoder', de: 'yo', a: 'derecha', valor: 1 }, { accion: 'robarMazoTrampa', objetivo: 'yo', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -4 }, { accion: 'mover', objetivo: 'yo', valor: -2 }],
  },
  {
    id: 'serie_mixta', nombre: 'Serie Mixta', respuesta: '66', tiempoSegundos: 30,
    recompensaA: [{ accion: 'intercambiar', objetivo: 'mas_adelantado' }],
    recompensaB: [{ accion: 'vida', objetivo: 'todos_excepto_yo', valor: -1 }],
    castigoA: [{ accion: 'intercambiar', objetivo: 'mas_rezagado' }],
    castigoB: [{ accion: 'vida', objetivo: 'todos_excepto_yo', valor: 1 }],
  },
  {
    id: 'patron_oculto', nombre: 'Patrón Oculto', respuesta: '720', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'izquierda', valor: -3 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 6 }],
    castigoA: [{ accion: 'mover', objetivo: 'izquierda', valor: 3 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -6 }],
  },
  {
    id: 'doble_identidad', nombre: 'Doble Identidad', respuesta: 'Van Gogh y Che Guevara', tiempoSegundos: 30,
    recompensaA: [{ accion: 'intercambiar', objetivo: 'elegido' }],
    recompensaB: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: -2 }],
    castigoA: [{ accion: 'intercambiar', objetivo: 'mas_cercano' }],
    castigoB: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: 2 }],
  },
  {
    id: 'elemento_dificil', nombre: 'Elemento Difícil', respuesta: 'MERCURIO', tiempoSegundos: 30,
    recompensaA: [{ accion: 'descartarPoder', objetivo: 'derecha', valor: 2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 3 }, { accion: 'mover', objetivo: 'yo', valor: 3 }],
    castigoA: [{ accion: 'descartarPoder', objetivo: 'yo', valor: 2 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -3 }, { accion: 'mover', objetivo: 'yo', valor: -3 }],
  },
  {
    id: 'piramide_mental', nombre: 'Pirámide Mental', respuesta: '90', tiempoSegundos: 30,
    recompensaA: [{ accion: 'robarManoPoder', de: 'mas_adelantado', a: 'yo', valor: 1 }],
    recompensaB: [{ accion: 'vida', objetivo: 'elegido', valor: -4 }],
    castigoA: [{ accion: 'robarManoPoder', de: 'yo', a: 'mas_adelantado', valor: 1 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -4 }],
  },
  {
    id: 'valor_oculto', nombre: 'Valor Oculto', respuesta: '38', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: -2 }],
    recompensaB: [{ accion: 'vida', objetivo: 'yo', valor: 5 }],
    castigoA: [{ accion: 'mover', objetivo: 'todos_excepto_yo', valor: 2 }],
    castigoB: [{ accion: 'vida', objetivo: 'yo', valor: -5 }],
  },
  {
    id: 'codigo_espacial', nombre: 'Código Espacial', respuesta: '105', tiempoSegundos: 30,
    recompensaA: [{ accion: 'mover', objetivo: 'elegido', valor: -5 }],
    recompensaB: [{ accion: 'intercambiar', objetivo: 'mas_adelantado' }, { accion: 'vida', objetivo: 'yo', valor: 3 }],
    castigoA: [{ accion: 'mover', objetivo: 'yo', valor: -5 }],
    castigoB: [{ accion: 'intercambiar', objetivo: 'mas_rezagado' }, { accion: 'vida', objetivo: 'yo', valor: -3 }],
  },
];

module.exports = { COMBATE_CARTAS };
