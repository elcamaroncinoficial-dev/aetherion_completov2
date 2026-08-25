'use strict';
/**
 * Las 25 cartas de Trampa, con el efecto tal como quedó cerrado en la
 * revisión de reglas. `tipo` indica qué maneja gameEngine.js en
 * aplicarEfectoTrampa().
 */
const TRAMPA_CARTAS = [
  { id: 'caida_subita',      nombre: 'Caída Súbita',       tipo: 'retroceder',        valor: 2 },
  { id: 'derrumbe',          nombre: 'Derrumbe',           tipo: 'retroceder',        valor: 3 },
  { id: 'abismo_profundo',   nombre: 'Abismo Profundo',    tipo: 'retroceder',        valor: 5 },
  { id: 'terreno_quebrado',  nombre: 'Terreno Quebrado',   tipo: 'retroceder_y_pierde_turno', valor: 2, turnos: 1 },
  { id: 'colapso_total',     nombre: 'Colapso Total',      tipo: 'retroceder',        valor: 10 },
  { id: 'intercambio_bajo',  nombre: 'Intercambio Bajo',   tipo: 'intercambiar_con_ultimo' },
  { id: 'colapso_progreso',  nombre: 'Colapso de Progreso',tipo: 'retroceder',        valor: 8 },
  { id: 'paso_en_falso',     nombre: 'Paso en Falso',      tipo: 'retroceder_y_resolver_si_especial', valor: 3 },
  { id: 'rebote_forzado',    nombre: 'Rebote Forzado',     tipo: 'volver_a_ultima_especial' },
  { id: 'peso_liderazgo',    nombre: 'Peso del Liderazgo', tipo: 'retroceder_segun_liderazgo', valorLider: 4, valorNoLider: 1 },
  { id: 'pausa_forzada',     nombre: 'Pausa Forzada',      tipo: 'perder_turnos',      turnos: 1 },
  { id: 'paralisis_total',   nombre: 'Parálisis Total',    tipo: 'perder_turnos',      turnos: 2 },
  { id: 'condena_inminente', nombre: 'Condena Inminente',  tipo: 'condicion_proximo_combate' },
  { id: 'bloqueo_poder',     nombre: 'Bloqueo de Poder',   tipo: 'bloquear_poder',     turnos: 1 },
  { id: 'congelacion',       nombre: 'Congelación',        tipo: 'perder_turnos',      turnos: 1 },
  { id: 'herida_abierta',    nombre: 'Herida Abierta',     tipo: 'perder_vidas',       valor: 2 },
  { id: 'golpe_fuerte',      nombre: 'Golpe Fuerte',       tipo: 'perder_vidas',       valor: 3 },
  { id: 'impacto_critico',   nombre: 'Impacto Crítico',    tipo: 'perder_vidas',       valor: 4 },
  { id: 'mitad_vital',       nombre: 'Mitad Vital',        tipo: 'perder_mitad_vida' },
  { id: 'desgaste_acumulado',nombre: 'Desgaste Acumulado', tipo: 'perder_vidas_por_posicion', porCada: 10, valor: 2, tope: 6 },
  { id: 'robo_fallido',      nombre: 'Robo Fallido',       tipo: 'perder_cartas_poder_azar', cantidad: 1 },
  { id: 'vacio_mental',      nombre: 'Vacío Mental',       tipo: 'perder_cartas_poder_azar', cantidad: 2 },
  { id: 'colapso_mano',      nombre: 'Colapso de Mano',    tipo: 'descartar_mano_poder' },
  { id: 'interferencia',     nombre: 'Interferencia',      tipo: 'bloquear_poder',     turnos: 2 },
  { id: 'decision_ajena',    nombre: 'Decisión Ajena',     tipo: 'otro_jugador_descarta_carta' },
];

module.exports = { TRAMPA_CARTAS };
