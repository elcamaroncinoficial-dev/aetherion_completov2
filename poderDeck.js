'use strict';
/**
 * Las 30 cartas de Poder. A diferencia de Trampa/Portal, estas NO se
 * resuelven solas al caer en la casilla: se guardan en la mano y el
 * jugador decide cuándo jugarlas (una por turno, en la ventana de
 * inicio o de cierre — ver gameEngine.jugarCartaPoder).
 *
 * Tres cartas (Anulación, Negación Absoluta, Anti-Portal) son cartas de
 * REACCIÓN: se juegan fuera del propio turno, en la ventana especial de
 * reacción que se definió en el diseño. Esa ventana todavía no está
 * construida en el motor (requiere resolución en dos fases: anunciar el
 * efecto → esperar reacciones → aplicar). Quedan marcadas con
 * `requiereVentanaReaccion: true` y un manejador de solo aviso (TODO),
 * en vez de fingir un comportamiento que aún no existe.
 */
const PODER_CARTAS = [
  { id: 'absorcion_vital',    nombre: 'Absorción Vital',     tipo: 'ganar_vida', valor: 2 },
  { id: 'pulso_energia',      nombre: 'Pulso de Energía',    tipo: 'ganar_vida', valor: 3 },
  { id: 'reserva_vital',      nombre: 'Reserva Vital',       tipo: 'ganar_vida_diferida', valor: 3 },
  { id: 'regeneracion_inestable', nombre: 'Regeneración Inestable', tipo: 'ganar_vida_por_turnos', valor: 1, turnos: 3 },
  { id: 'rebote_vital',       nombre: 'Rebote Vital',        tipo: 'recuperar_vida_turno_anterior' },
  { id: 'sobrecarga',         nombre: 'Sobrecarga',          tipo: 'ganar_vida_y_pierde_turno', valor: 4 },
  { id: 'doble_nucleo',       nombre: 'Doble Núcleo',        tipo: 'duplicar_vida' },
  { id: 'equilibrio_forzado', nombre: 'Equilibrio Forzado',  tipo: 'igualar_vida_con_lider' },
  { id: 'instinto_supervivencia', nombre: 'Instinto de Supervivencia', tipo: 'ganar_vida_condicional', valorSiMenor: 4, valorSiNo: 2 },
  { id: 'nucleo_extra',       nombre: 'Núcleo Extra',        tipo: 'ganar_vida_y_robar_carta', valor: 2 },
  { id: 'intercambio_mano_total', nombre: 'Intercambio Total', tipo: 'intercambiar_mano_elegido' },
  { id: 'ronda_caotica',      nombre: 'Ronda Caótica',       tipo: 'ronda_caotica' },
  { id: 'reconfiguracion_total', nombre: 'Reconfiguración Total', tipo: 'reconfigurar_mano', cantidad: 5 },
  { id: 'robo_forzado',       nombre: 'Robo Forzado',        tipo: 'robar_carta_azar_de_jugador' },
  { id: 'eleccion_forzada',   nombre: 'Elección Forzada',    tipo: 'robar_y_quedarse_una', roba: 3, quedarse: 1 },
  { id: 'inspeccion',         nombre: 'Inspección',          tipo: 'inspeccionar_y_tomar' },
  { id: 'intercambio_multiple', nombre: 'Intercambio Múltiple', tipo: 'intercambio_multiple_todos' },
  { id: 'perdida_global',     nombre: 'Pérdida Global',      tipo: 'todos_descartan_azar_excepto_yo' },
  { id: 'eco_de_poder',       nombre: 'Eco de Poder',        tipo: 'copiar_ultima_carta_jugada' },
  { id: 'rescate_del_caos',   nombre: 'Rescate del Caos',    tipo: 'tomar_carta_del_descarte' },
  { id: 'golpe_global',       nombre: 'Golpe Global',        tipo: 'todos_pierden_vida_excepto_yo', valor: 2 },
  { id: 'bloqueo_derecho',    nombre: 'Bloqueo Derecho',     tipo: 'derecha_pierde_turno' },
  { id: 'impacto_izquierdo',  nombre: 'Impacto Izquierdo',   tipo: 'izquierda_pierde_vida', valor: 3 },
  { id: 'intercambio_masivo', nombre: 'Intercambio Masivo',  tipo: 'rotar_posiciones_por_rango' },
  { id: 'destino_manipulado', nombre: 'Destino Manipulado',  tipo: 'objetivo_roba_trampa' },
  { id: 'anulacion',          nombre: 'Anulación',           tipo: 'reaccion_cancelar_cualquier_carta', requiereVentanaReaccion: true },
  { id: 'anti_portal',        nombre: 'Anti-Portal',         tipo: 'reaccion_cancelar_portal', requiereVentanaReaccion: true },
  { id: 'castigo_selectivo',  nombre: 'Castigo Selectivo',   tipo: 'objetivo_sin_recompensa_proximo_combate' },
  { id: 'colapso_de_poder',   nombre: 'Colapso de Poder',    tipo: 'todos_descartan_mano_poder_opcional_propia' },
  { id: 'negacion_absoluta',  nombre: 'Negación Absoluta',   tipo: 'reaccion_cancelar_poder_contra_mi', requiereVentanaReaccion: true },
];

module.exports = { PODER_CARTAS };
