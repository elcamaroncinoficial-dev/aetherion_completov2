'use strict';
/**
 * Las 15 cartas de Portal, con el efecto tal como quedó cerrado.
 * Algunas requieren que el jugador elija un objetivo (opciones.targetId):
 * intercambio_elegido, ambos_pierden_turno_y_vida.
 */
const PORTAL_CARTAS = [
  { id: 'portal_colapsado',  nombre: 'Portal Colapsado',    tipo: 'volver_casilla_inicial_lado_original' },
  { id: 'vortice_atrapante', nombre: 'Vórtice Atrapante',   tipo: 'quedar_atrapado', turnos: 4 },
  { id: 'atraccion_evento',  nombre: 'Atracción de Evento', tipo: 'avanzar_siguiente_especial' },
  { id: 'eco_del_vacio',     nombre: 'Eco del Vacío',       tipo: 'retroceder_ultima_especial_y_resolver' },
  { id: 'salto_estrategico', nombre: 'Salto Estratégico',   tipo: 'avanzar_y_resolver', valor: 6 },
  { id: 'intercambio_directo', nombre: 'Intercambio Directo', tipo: 'intercambio_elegido' },
  { id: 'salto_al_lider',    nombre: 'Salto al Líder',      tipo: 'intercambio_extremo', extremo: 'primero' },
  { id: 'caida_al_fondo',    nombre: 'Caída al Fondo',      tipo: 'intercambio_extremo', extremo: 'ultimo' },
  { id: 'ruleta_posiciones', nombre: 'Ruleta de Posiciones',tipo: 'todos_intercambian_derecha' },
  { id: 'intercambio_total', nombre: 'Intercambio Total',   tipo: 'intercambio_total_azar' },
  { id: 'ola_de_avance',     nombre: 'Ola de Avance',       tipo: 'todos_avanzan_resolucion_diferida', valor: 3 },
  { id: 'desfase_temporal',  nombre: 'Desfase Temporal',    tipo: 'intercambio_extremo', extremo: 'primero' },
  { id: 'ancla_del_caos',    nombre: 'Ancla del Caos',      tipo: 'ambos_pierden_turno_y_vida' },
  { id: 'caos_de_manos',     nombre: 'Caos de Manos',       tipo: 'todos_intercambian_manos_2x' },
  { id: 'luz_y_oscuridad',   nombre: 'Luz y Oscuridad',     tipo: 'todos_cambian_lado' },
];

module.exports = { PORTAL_CARTAS };
