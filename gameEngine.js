'use strict';
/**
 * AETHERION — Motor de reglas (núcleo)
 * ------------------------------------
 * Este módulo es la ÚNICA fuente de verdad del estado de una partida.
 * No sabe nada de HTML, WebSockets ni gráficos: solo reglas.
 * El servidor multijugador llamará a estas funciones y luego transmitirá
 * el nuevo estado a todos los jugadores conectados.
 *
 * Cobertura de esta primera versión:
 *  - Carga del tablero (board_data.json) y catálogo de personajes
 *  - Creación de partida y jugadores (con habilidades iniciales)
 *  - Movimiento por dado, con la regla de "no caer exacto" para
 *    entrar a la Batalla Final
 *  - Resolución de casilla (despacho por tipo: normal/trampa/portal/
 *    poder/combate) con los mazos aún pendientes de conectar
 *  - Sistema de vida con tope (20) y regla de "0 vidas"
 *  - Ayudante genérico de retroceso con tope en la casilla 1
 *    (regla confirmada para todas las cartas de Trampa)
 *
 * Pendiente para siguientes iteraciones (fuera de alcance de este archivo):
 *  - Contenido real de las 25 cartas de Trampa, 15 de Portal, 30 de Poder
 *    y 30 retos de Combate (hoy son mazos con efectos de ejemplo)
 *  - Ventana de reacción (Anulación / Negación Absoluta / Anti-Portal)
 *  - Batalla Final (individual / versus / multijugador / Juicio del Destino)
 *  - Sincronización multijugador (WebSockets)
 */

const fs = require('fs');
const path = require('path');
const { Deck } = require('./deck');
const { TRAMPA_CARTAS } = require('./trampaDeck');
const { PORTAL_CARTAS } = require('./portalDeck');
const { PODER_CARTAS } = require('./poderDeck');
const { COMBATE_CARTAS } = require('./combateDeck');

const BOARD_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'board_data.json'), 'utf-8')
);

// ---------------------------------------------------------------------
// Catálogo de personajes (coincide con las 6 tarjetas ya validadas)
// ---------------------------------------------------------------------
const PERSONAJES = {
  mago:        { nombre: 'El Mago',          lado: 'azul', vidaInicial: 10, cartaPoderExtra: 1 },
  guerrero:    { nombre: 'El Guerrero',      lado: 'azul', vidaInicial: 10, resistencia: true },
  alquimista:  { nombre: 'El Alquimista',    lado: 'azul', vidaInicial: 10, formulaVidaDisponible: true },
  helada:      { nombre: 'La Helada',        lado: 'rojo', vidaInicial: 12 },
  sombra:      { nombre: 'La Sombra',        lado: 'rojo', vidaInicial: 10, pasoOcultoDisponible: true },
  hijoDragon:  { nombre: 'El Hijo del Dragón', lado: 'rojo', vidaInicial: 10, impulsoInicialPendiente: true },
};

const VIDA_MAXIMA = 20;
const CASILLA_PUENTE = 16;
const ULTIMA_CASILLA = 52;
const CASILLA_BATALLA_FINAL = 53;
const MAX_MANO_PODER = 5;

// ---------------------------------------------------------------------
// Utilidades de tablero
// ---------------------------------------------------------------------

/** Devuelve los datos (tipo, x, y) de una casilla concreta de un camino. */
function getCasillaInfo(lado, numero) {
  if (numero >= CASILLA_BATALLA_FINAL) return BOARD_DATA.batalla_final;
  const lista = lado === 'azul' ? BOARD_DATA.azul : BOARD_DATA.rojo;
  return lista.find((c) => c.casilla === numero) || null;
}

// ---------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------
class Player {
  constructor(id, nombre, personajeKey) {
    const personaje = PERSONAJES[personajeKey];
    if (!personaje) throw new Error(`Personaje desconocido: ${personajeKey}`);

    this.id = id;
    this.nombre = nombre;
    this.personajeKey = personajeKey;
    this.lado = personaje.lado; // lado ACTUAL — puede cambiar (Luz y Oscuridad)
    this.ladoOriginal = personaje.lado; // fijo toda la partida (Portal Colapsado vuelve aquí)
    this.casilla = 1; // posición en SU propia numeración (1–52), luego 53
    this.vidas = personaje.vidaInicial;
    this.manoPoder = [];
    this.enBatallaFinal = false;
    this.turnosPerdidos = 0; // contador genérico (Pausa Forzada, Congelación, etc.)
    this.bloqueoPoderTurnos = 0; // Bloqueo de Poder / Interferencia
    this.ultimaEspecialPisada = null; // { casilla } — solo Poder/Portal/Combate (para Rebote Forzado / Eco del Vacío)
    this.condenaInminente = false; // Condena Inminente: si pierde su próximo combate, pierde 1 turno extra
    this.atrapado = null; // { casilla, lado, turnosRestantes } — Vórtice Atrapante
    this.efectoPendienteProximoTurno = false; // Ola de Avance: resolver casilla sin tirar dado
    this.cartaPoderJugadaEsteTurno = false; // solo 1 carta de poder por turno
    this.reservaVitalPendiente = null; // Reserva Vital: cantidad a ganar al inicio del próximo turno (null si cancelada/no activa)
    this.regeneracionInestable = null; // { valor, turnosRestantes } — Regeneración Inestable
    this.vidaPerdidaEsteTurno = 0;
    this.vidaPerdidaTurnoAnterior = 0; // usado por Rebote Vital
    this.sinRecompensaProximoCombate = false; // Castigo Selectivo (hook para cuando exista el motor de Combate)
    this.combateActivo = null; // carta de Combate ya robada, esperando resultado (ver resolverCombate)

    // habilidades de un solo uso
    this.habilidadesDisponibles = {
      mentePreparada: personaje.cartaPoderExtra ? true : false,
      resistenciaUsada: false, // Guerrero: se consume la PRIMERA vez que recibe daño
      pasoOcultoUsado: !personaje.pasoOcultoDisponible,
      formulaVidaUsada: !personaje.formulaVidaDisponible,
      impulsoInicialPendiente: !!personaje.impulsoInicialPendiente,
    };

    if (this.habilidadesDisponibles.mentePreparada) {
      // Mago: inicia con 1 carta de poder extra (se resuelve al repartir mano inicial)
      this.manoPoder.push({ id: 'PLACEHOLDER_MENTE_PREPARADA', nombre: 'Carta de poder inicial' });
    }
  }

  /** Aplica daño respetando la Resistencia del Guerrero (1 vida menos, una sola vez). */
  recibirDano(cantidad) {
    let dañoFinal = cantidad;
    if (this.personajeKey === 'guerrero' && !this.habilidadesDisponibles.resistenciaUsada) {
      dañoFinal = Math.max(0, cantidad - 1);
      this.habilidadesDisponibles.resistenciaUsada = true;
    }
    this.vidas -= dañoFinal;
    this.vidaPerdidaEsteTurno += dañoFinal;
    if (this.reservaVitalPendiente !== null && dañoFinal > 0) {
      this.reservaVitalPendiente = null; // "si recibes daño antes, se cancela"
    }
    if (this.vidas <= 0) {
      this._aplicarMuerteTemporal();
    }
    return dañoFinal;
  }

  ganarVida(cantidad) {
    this.vidas = Math.min(VIDA_MAXIMA, this.vidas + cantidad);
  }

  /** Regla de 0 vidas: vuelve a la casilla inicial de SU lado original, recupera 10, pierde mano. */
  _aplicarMuerteTemporal() {
    this.casilla = 1;
    this.vidas = 10;
    this.manoPoder = [];
    this.enBatallaFinal = false;
  }
}

// ---------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------
class Game {
  constructor(gameId) {
    this.gameId = gameId;
    this.players = new Map();
    this.turnOrder = [];
    this.turnIndex = 0;
    this.log = [];
    this.mazoTrampa = new Deck(TRAMPA_CARTAS);
    this.mazoPortal = new Deck(PORTAL_CARTAS);
    this.mazoPoder = new Deck(PODER_CARTAS);
    this.ultimaCartaPoderJugada = null; // { playerId, carta } — para Eco de Poder
    this.mazoCombate = new Deck(COMBATE_CARTAS);
    this.ventanasAbiertas = new Map(); // id -> { tipo, origenPlayerId, targetPlayerId, aplicar, cancelada, canceladaPor }
    this._siguienteVentanaId = 1;
    this.eventos = []; // cola de eventos estructurados para que un cliente sepa qué animar (ver _emitirEvento)
  }

  /** Encola un evento estructurado (además del log de texto) para que el cliente sepa qué mostrar. */
  _emitirEvento(evento) {
    this.eventos.push(evento);
  }

  /** El servidor llama esto tras cada acción para vaciar la cola y mandarla al cliente. */
  drenarEventos() {
    const salida = this.eventos;
    this.eventos = [];
    return salida;
  }

  addPlayer(id, nombre, personajeKey) {
    const p = new Player(id, nombre, personajeKey);
    this.players.set(id, p);
    this.turnOrder.push(id);
    this._logEvent(`${nombre} se une como ${PERSONAJES[personajeKey].nombre} (${p.lado}).`);
    return p;
  }

  get jugadorActual() {
    return this.players.get(this.turnOrder[this.turnIndex]);
  }

  siguienteTurno() {
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
  }

  /**
   * Debe llamarse al INICIO del turno de un jugador, antes de permitirle
   * tirar el dado. Resuelve todo lo que depende del paso del tiempo:
   * turnos perdidos, bloqueo de poder, Reserva Vital, Regeneración
   * Inestable, el registro de vida perdida (para Rebote Vital) y el
   * efecto pendiente de Ola de Avance.
   *
   * Devuelve { turnoOmitido } para que quien orqueste la partida sepa si
   * debe saltarse la fase de dado y pasar directo al siguiente jugador.
   */
  iniciarTurno(playerId) {
    const p = this.players.get(playerId);
    if (!p) return { turnoOmitido: false };

    p.cartaPoderJugadaEsteTurno = false;
    p.vidaPerdidaTurnoAnterior = p.vidaPerdidaEsteTurno;
    p.vidaPerdidaEsteTurno = 0;

    if (p.bloqueoPoderTurnos > 0) {
      p.bloqueoPoderTurnos -= 1;
      this._logEvent(`${p.nombre}: le queda bloqueo de cartas de poder por ${p.bloqueoPoderTurnos} turno(s) más.`);
    }

    if (p.reservaVitalPendiente !== null) {
      p.ganarVida(p.reservaVitalPendiente);
      this._logEvent(`${p.nombre} recibe +${p.reservaVitalPendiente} vida de Reserva Vital.`);
      p.reservaVitalPendiente = null;
    }

    if (p.regeneracionInestable) {
      p.ganarVida(p.regeneracionInestable.valor);
      p.regeneracionInestable.turnosRestantes -= 1;
      this._logEvent(`${p.nombre} recibe +${p.regeneracionInestable.valor} vida de Regeneración Inestable (quedan ${p.regeneracionInestable.turnosRestantes}).`);
      if (p.regeneracionInestable.turnosRestantes <= 0) p.regeneracionInestable = null;
    }

    if (p.turnosPerdidos > 0) {
      p.turnosPerdidos -= 1;
      this._logEvent(`${p.nombre} pierde este turno (le quedan ${p.turnosPerdidos} más).`);
      return { turnoOmitido: true };
    }

    if (p.efectoPendienteProximoTurno) {
      p.efectoPendienteProximoTurno = false;
      this._logEvent(`${p.nombre} resuelve el efecto pendiente de su casilla (${p.casilla}) sin tirar dado.`);
      this.resolverCasilla(playerId);
    }

    return { turnoOmitido: false };
  }

  /** Llamar cuando un jugador pierde un combate (hook para el motor de Combate). */
  perderCombate(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.regeneracionInestable) {
      p.regeneracionInestable = null;
      this._logEvent(`${p.nombre} pierde su combate: Regeneración Inestable termina.`);
    }
    if (p.condenaInminente) {
      p.turnosPerdidos += 1;
      p.condenaInminente = false;
      this._logEvent(`${p.nombre} pierde su combate bajo Condena Inminente: pierde 1 turno adicional.`);
    }
  }

  _logEvent(msg) {
    this.log.push(msg);
  }

  /**
   * Mueve al jugador `n` casillas (resultado del dado, o cualquier
   * desplazamiento forzado por carta). Aplica la regla de la Batalla
   * Final: no hace falta caer exacto, si el resultado iguala o supera
   * la última casilla, entra directamente.
   */
  moverJugador(playerId, n) {
    const p = this.players.get(playerId);
    if (!p || p.enBatallaFinal) return;

    if (p.atrapado) {
      p.atrapado.turnosRestantes -= 1;
      if (p.atrapado.turnosRestantes <= 0) {
        p.atrapado = null;
        this._logEvent(`${p.nombre} ya no está atrapado — puede moverse este turno.`);
      } else {
        this._logEvent(`${p.nombre} sigue atrapado en el Vórtice (${p.atrapado.turnosRestantes} turno(s) restantes).`);
        return;
      }
    }

    const destino = p.casilla + n;
    if (destino >= ULTIMA_CASILLA + 1) {
      p.casilla = CASILLA_BATALLA_FINAL;
      p.enBatallaFinal = true;
      p.manoPoder = []; // al entrar a la Batalla Final se descartan cartas de poder
      this._logEvent(`${p.nombre} llega a la Batalla Final.`);
      return;
    }

    p.casilla = destino;
    this._logEvent(`${p.nombre} avanza a la casilla ${p.casilla} (${p.lado}).`);
    this._liberarAtrapadosEn(p.lado, p.casilla, playerId);
    this.resolverCasilla(playerId);
  }

  /** Si algún jugador atrapado (Vórtice Atrapante) está en esta misma casilla, queda libre. */
  _liberarAtrapadosEn(lado, casilla, quienLlega) {
    for (const other of this.players.values()) {
      if (other.id === quienLlega) continue;
      if (other.atrapado && other.atrapado.lado === lado && other.atrapado.casilla === casilla) {
        other.atrapado = null;
        this._logEvent(`${other.nombre} queda liberado del Vórtice: ${this.players.get(quienLlega).nombre} cayó en su casilla.`);
      }
    }
  }

  /**
   * Retrocede al jugador `n` casillas, con el tope confirmado:
   * nunca pasa de la casilla 1 (sin negativos, sin cruce de lado).
   */
  retrocederJugador(playerId, n) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.casilla = Math.max(1, p.casilla - n);
    this._logEvent(`${p.nombre} retrocede a la casilla ${p.casilla}.`);
  }

  /** Despacha la resolución de la casilla actual según su tipo. */
  resolverCasilla(playerId) {
    const p = this.players.get(playerId);
    if (!p || p.enBatallaFinal) return;
    const info = getCasillaInfo(p.lado, p.casilla);
    if (!info) return;

    // Rebote Forzado necesita saber cuál fue la última casilla de
    // Poder/Portal/Combate pisada — se registra ANTES de aplicar el
    // efecto de la casilla actual (para que una trampa no se cuente
    // a sí misma).
    if (['poder', 'portal', 'combate'].includes(info.tipo)) {
      p.ultimaEspecialPisada = { casilla: p.casilla };
    }

    switch (info.tipo) {
      case 'trampa': {
        const carta = this.mazoTrampa.robar();
        this._logEvent(`${p.nombre} cae en TRAMPA (casilla ${p.casilla}) → carta: ${carta.nombre}`);
        this._emitirEvento({ tipo: 'cartaRevelada', mazo: 'trampa', playerId, cartaId: carta.id, cartaNombre: carta.nombre });
        this.aplicarEfectoTrampa(playerId, carta);
        break;
      }
      case 'portal': {
        const carta = this.mazoPortal.robar();
        this._logEvent(`${p.nombre} cae en PORTAL (casilla ${p.casilla}) → carta: ${carta.nombre}`);
        this._emitirEvento({ tipo: 'cartaRevelada', mazo: 'portal', playerId, cartaId: carta.id, cartaNombre: carta.nombre });
        this.aplicarEfectoPortal(playerId, carta);
        break;
      }
      case 'poder': {
        this._logEvent(`${p.nombre} cae en PODER (casilla ${p.casilla}).`);
        if (p.manoPoder.length < MAX_MANO_PODER) {
          const carta = this.mazoPoder.robar();
          p.manoPoder.push(carta);
          this._logEvent(`${p.nombre} roba "${carta.nombre}" (mano: ${p.manoPoder.length}/5).`);
          this._emitirEvento({ tipo: 'cartaAManoDePoder', playerId, cartaId: carta.id, cartaNombre: carta.nombre });
        } else {
          this._logEvent(`${p.nombre} tiene la mano llena (5) — debe decidir qué hacer con la nueva carta (pendiente de resolver con el cliente).`);
        }
        break;
      }
      case 'combate': {
        const carta = this.mazoCombate.robar();
        p.combateActivo = carta;
        this._logEvent(`${p.nombre} cae en COMBATE (casilla ${p.casilla}) → reto: ${carta.nombre} (${carta.tiempoSegundos}s) — esperando resultado.`);
        this._emitirEvento({
          tipo: 'combateIniciado', playerId, cartaId: carta.id, cartaNombre: carta.nombre,
          tiempoSegundos: carta.tiempoSegundos,
        });
        break;
      }
      default:
        // casilla normal: sin efecto
        break;
    }
  }

  /**
   * Aplica el efecto de una carta de Trampa ya robada, siguiendo
   * exactamente las reglas cerradas en la revisión de diseño.
   */
  aplicarEfectoTrampa(playerId, carta) {
    const p = this.players.get(playerId);
    if (!p) return;

    switch (carta.tipo) {
      case 'retroceder':
        this.retrocederJugador(playerId, carta.valor);
        break;

      case 'retroceder_y_pierde_turno':
        this.retrocederJugador(playerId, carta.valor);
        p.turnosPerdidos += carta.turnos;
        this._logEvent(`${p.nombre} pierde ${carta.turnos} turno(s).`);
        break;

      case 'retroceder_y_resolver_si_especial': {
        this.retrocederJugador(playerId, carta.valor);
        const nuevaInfo = getCasillaInfo(p.lado, p.casilla);
        if (nuevaInfo && nuevaInfo.tipo !== 'normal') {
          this._logEvent(`${p.nombre} cae en casilla especial tras Paso en Falso — se resuelve en cadena.`);
          this.resolverCasilla(playerId);
        }
        break;
      }

      case 'retroceder_segun_liderazgo': {
        const esLider = this._tieneMasVidaQueTodos(playerId); // empate cuenta como "sí"
        const valor = esLider ? carta.valorLider : carta.valorNoLider;
        this._logEvent(`${p.nombre} ${esLider ? 'lidera en vidas' : 'no lidera en vidas'} → retrocede ${valor}.`);
        this.retrocederJugador(playerId, valor);
        break;
      }

      case 'intercambiar_con_ultimo': {
        const ultimo = this._jugadorExtremo('ultimo', playerId);
        if (ultimo) this._intercambiarPosiciones(p, ultimo);
        break;
      }

      case 'volver_a_ultima_especial':
        if (p.ultimaEspecialPisada) {
          p.casilla = p.ultimaEspecialPisada.casilla;
          this._logEvent(`${p.nombre} regresa a la casilla ${p.casilla} (última especial pisada).`);
        } else {
          this._logEvent(`${p.nombre} no había pisado ninguna casilla especial: Rebote Forzado sin efecto.`);
        }
        break;

      case 'perder_turnos':
        p.turnosPerdidos += carta.turnos;
        this._logEvent(`${p.nombre} pierde ${carta.turnos} turno(s).`);
        break;

      case 'condicion_proximo_combate':
        p.condenaInminente = true;
        this._logEvent(`${p.nombre} queda bajo Condena Inminente (si pierde su próximo combate, pierde 1 turno extra).`);
        break;

      case 'bloquear_poder':
        p.bloqueoPoderTurnos += carta.turnos;
        this._logEvent(`${p.nombre} no puede usar cartas de poder durante ${carta.turnos} turno(s).`);
        break;

      case 'perder_vidas':
        p.recibirDano(carta.valor);
        this._logEvent(`${p.nombre} pierde vida (${carta.nombre}) → vidas restantes: ${p.vidas}.`);
        break;

      case 'perder_mitad_vida': {
        const mitad = Math.floor(p.vidas / 2);
        p.recibirDano(mitad);
        this._logEvent(`${p.nombre} pierde la mitad de su vida (${mitad}) → vidas restantes: ${p.vidas}.`);
        break;
      }

      case 'perder_vidas_por_posicion': {
        const cantidad = Math.min(carta.tope, Math.floor(p.casilla / carta.porCada) * carta.valor);
        p.recibirDano(cantidad);
        this._logEvent(`${p.nombre} pierde ${cantidad} vida(s) por Desgaste Acumulado → vidas restantes: ${p.vidas}.`);
        break;
      }

      case 'perder_cartas_poder_azar': {
        const n = Math.min(carta.cantidad, p.manoPoder.length);
        for (let i = 0; i < n; i++) {
          const idx = Math.floor(Math.random() * p.manoPoder.length);
          p.manoPoder.splice(idx, 1);
        }
        this._logEvent(`${p.nombre} pierde ${n} carta(s) de poder al azar.`);
        break;
      }

      case 'descartar_mano_poder':
        p.manoPoder = [];
        this._logEvent(`${p.nombre} descarta toda su mano de poder.`);
        break;

      case 'otro_jugador_descarta_carta': {
        // Regla no especificada por el usuario: se asume que decide el
        // siguiente jugador en el orden de turno. Ajustar si se define otra cosa.
        if (p.manoPoder.length > 0) {
          const idx = Math.floor(Math.random() * p.manoPoder.length);
          const descartada = p.manoPoder.splice(idx, 1)[0];
          this._logEvent(`Otro jugador elige y descarta "${descartada.nombre}" de la mano de ${p.nombre}.`);
        }
        break;
      }

      default:
        this._logEvent(`(sin manejador para el efecto "${carta.tipo}" de ${carta.nombre})`);
    }
  }

  /**
   * Aplica el efecto de una carta de Portal ya robada.
   * `opciones.targetId` se usa en las cartas que requieren que el
   * jugador elija a otro participante (Intercambio Directo, Ancla del Caos).
   * Si no se provee, se elige automáticamente el primer jugador disponible
   * y se dejará una nota en el log — en el cliente real esto vendría de
   * una selección explícita del jugador.
   */
  aplicarEfectoPortal(playerId, carta, opciones = {}) {
    const p = this.players.get(playerId);
    if (!p) return;

    const elegirObjetivoPorDefecto = () => {
      const otros = [...this.players.keys()].filter((id) => id !== playerId);
      return otros[0];
    };

    switch (carta.tipo) {
      case 'volver_casilla_inicial_lado_original':
        p.casilla = 1;
        p.lado = p.ladoOriginal;
        this._logEvent(`${p.nombre} regresa a la casilla inicial de su lado original (${p.ladoOriginal}).`);
        break;

      case 'quedar_atrapado':
        p.atrapado = { casilla: p.casilla, lado: p.lado, turnosRestantes: carta.turnos };
        this._logEvent(`${p.nombre} queda atrapado en el Vórtice (libre en ${carta.turnos} turnos o si otro jugador cae aquí).`);
        break;

      case 'avanzar_siguiente_especial': {
        const siguiente = this._siguienteCasillaEspecial(p.lado, p.casilla);
        if (siguiente == null) {
          this._logEvent(`${p.nombre}: no hay más casillas especiales por delante — Atracción de Evento sin efecto.`);
        } else {
          this._logEvent(`${p.nombre} avanza hasta la casilla especial ${siguiente}.`);
          p.casilla = siguiente;
          this.resolverCasilla(playerId); // "ejecútala inmediatamente"
        }
        break;
      }

      case 'retroceder_ultima_especial_y_resolver':
        if (p.ultimaEspecialPisada) {
          p.casilla = p.ultimaEspecialPisada.casilla;
          this._logEvent(`${p.nombre} retrocede a la última especial pisada (casilla ${p.casilla}) y la ejecuta.`);
          this.resolverCasilla(playerId);
        } else {
          this._logEvent(`${p.nombre} no había pisado ninguna casilla especial: Eco del Vacío sin efecto.`);
        }
        break;

      case 'avanzar_y_resolver':
        this._logEvent(`${p.nombre} avanza exactamente ${carta.valor} casillas (Salto Estratégico).`);
        this.moverJugador(playerId, carta.valor); // ya resuelve la casilla de llegada
        break;

      case 'intercambio_elegido': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target) this._intercambiarPosiciones(p, target);
        break;
      }

      case 'intercambio_extremo': {
        const objetivo = this._jugadorExtremo(carta.extremo, playerId);
        if (objetivo) this._intercambiarPosiciones(p, objetivo);
        break;
      }

      case 'todos_intercambian_derecha': {
        // "derecha" = siguiente jugador en el orden de turno (supuesto de diseño).
        const ids = this.turnOrder;
        const casillasOriginales = ids.map((id) => this.players.get(id).casilla);
        const ladosOriginales = ids.map((id) => this.players.get(id).lado);
        for (let i = 0; i < ids.length; i++) {
          const jugador = this.players.get(ids[i]);
          const derecha = (i + 1) % ids.length;
          jugador.casilla = casillasOriginales[derecha];
          jugador.lado = ladosOriginales[derecha];
        }
        this._logEvent('Ruleta de Posiciones: todos intercambian con el jugador a su derecha.');
        break;
      }

      case 'intercambio_total_azar': {
        const otros = [...this.players.keys()].filter((id) => id !== playerId);
        if (otros.length === 0) break;
        const targetId = otros[Math.floor(Math.random() * otros.length)];
        const target = this.players.get(targetId);
        const tmpCasilla = p.casilla, tmpLado = p.lado, tmpMano = p.manoPoder, tmpVidas = p.vidas;
        p.casilla = target.casilla; p.lado = target.lado; p.manoPoder = target.manoPoder; p.vidas = target.vidas;
        target.casilla = tmpCasilla; target.lado = tmpLado; target.manoPoder = tmpMano; target.vidas = tmpVidas;
        this._logEvent(`Intercambio Total: ${p.nombre} ⇄ ${target.nombre} (posición, mano y vida).`);
        break;
      }

      case 'todos_avanzan_resolucion_diferida': {
        for (const jugador of this.players.values()) {
          if (jugador.enBatallaFinal) continue;
          const destino = jugador.casilla + carta.valor;
          if (destino >= ULTIMA_CASILLA + 1) {
            jugador.casilla = CASILLA_BATALLA_FINAL;
            jugador.enBatallaFinal = true;
            jugador.manoPoder = [];
          } else {
            jugador.casilla = destino;
            const info = getCasillaInfo(jugador.lado, jugador.casilla);
            if (info && info.tipo !== 'normal') {
              jugador.efectoPendienteProximoTurno = true; // se resuelve al INICIO de su próximo turno, sin tirar dado
            }
          }
        }
        this._logEvent('Ola de Avance: todos avanzan 3 casillas (los efectos especiales se resuelven en su próximo turno).');
        break;
      }

      case 'ambos_pierden_turno_y_vida': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target) {
          p.turnosPerdidos += 1; target.turnosPerdidos += 1;
          p.recibirDano(1); target.recibirDano(1);
          this._logEvent(`Ancla del Caos: ${p.nombre} y ${target.nombre} pierden 1 turno y 1 vida.`);
        }
        break;
      }

      case 'todos_intercambian_manos_2x': {
        // Corregido: dos pases en la MISMA dirección (izquierda), no
        // izquierda-y-derecha (eso se cancelaba matemáticamente sin dejar
        // ningún cambio neto — detectado durante las pruebas del motor).
        this._rotarManosPoder(1); // izquierda, primer pase
        this._rotarManosPoder(1); // izquierda, segundo pase
        this._logEvent('Caos de Manos: manos rotadas dos posiciones a la izquierda.');
        break;
      }

      case 'todos_cambian_lado':
        for (const jugador of this.players.values()) {
          jugador.lado = jugador.lado === 'azul' ? 'rojo' : 'azul';
        }
        this._logEvent('Luz y Oscuridad: todos los jugadores cambian de camino (misma casilla, lado contrario).');
        break;

      default:
        this._logEvent(`(sin manejador para el efecto de portal "${carta.tipo}" de ${carta.nombre})`);
    }
  }

  /** Rota las manos de poder entre jugadores según el orden de turno. dir=1 izquierda, dir=-1 derecha. */
  _rotarManosPoder(dir) {
    const ids = this.turnOrder;
    const manos = ids.map((id) => this.players.get(id).manoPoder);
    for (let i = 0; i < ids.length; i++) {
      const origen = ((i + dir) % ids.length + ids.length) % ids.length;
      this.players.get(ids[i]).manoPoder = manos[origen];
    }
  }

  /** Siguiente casilla especial (tipo != normal) a partir de `desde` (exclusive), o null si no hay. */
  _siguienteCasillaEspecial(lado, desde) {
    const lista = lado === 'azul' ? BOARD_DATA.azul : BOARD_DATA.rojo;
    for (const c of lista) {
      if (c.casilla > desde && c.tipo !== 'normal') return c.casilla;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Ventana de reacción — Anulación / Anti-Portal / Negación Absoluta
  // ---------------------------------------------------------------
  // Estas 3 cartas se juegan FUERA del turno normal, en reacción a un
  // efecto que está a punto de aplicarse. Como el motor no tiene todavía
  // un servidor con tiempo real, el patrón es explícito en dos pasos:
  //
  //   1) abrirVentanaReaccion(...) — se llama ANTES de aplicar un efecto
  //      cancelable. No aplica nada; devuelve un id y deja el efecto
  //      "en pausa" (guardado como función, no ejecutado).
  //   2) Mientras la ventana esté abierta, cualquier jugador con una
  //      carta de reacción válida puede llamar jugarCartaReaccion(...).
  //   3) cerrarVentanaReaccion(id) — lo llama el servidor cuando termina
  //      el tiempo de reacción (p.ej. tras unos segundos). Si nadie
  //      canceló, ahí SÍ se aplica el efecto guardado.
  //
  // Esto es infraestructura NUEVA y no toca los métodos existentes
  // (aplicarEfectoTrampa/Portal/Poder siguen funcionando igual para
  // quien no necesite ventana de reacción — así no se rompe ninguna
  // de las 106 pruebas ya validadas). Los puntos de entrada que SÍ usan
  // ventana son jugarCartaPoderConVentana() y
  // resolverCasillaPortalConVentana(), pensados para el servidor real.

  abrirVentanaReaccion(tipo, origenPlayerId, targetPlayerId, aplicar) {
    const id = this._siguienteVentanaId++;
    this.ventanasAbiertas.set(id, {
      tipo, origenPlayerId, targetPlayerId, aplicar,
      cancelada: false, canceladaPor: null,
    });
    this._logEvent(`Se abre ventana de reacción #${id} (${tipo}).`);
    return id;
  }

  /** Un jugador intenta cancelar el efecto pendiente de una ventana abierta. */
  jugarCartaReaccion(reactorId, cartaId, ventanaId) {
    const ventana = this.ventanasAbiertas.get(ventanaId);
    if (!ventana) return { exito: false, motivo: 'ventana inexistente o ya cerrada' };
    if (ventana.cancelada) return { exito: false, motivo: 'la ventana ya fue cancelada por otra reacción' };

    const reactor = this.players.get(reactorId);
    if (!reactor) return { exito: false, motivo: 'jugador inexistente' };
    const idx = reactor.manoPoder.findIndex((c) => c.id === cartaId);
    if (idx === -1) return { exito: false, motivo: 'no tiene esa carta en mano' };
    const carta = reactor.manoPoder[idx];
    if (!carta.requiereVentanaReaccion) return { exito: false, motivo: 'esa carta no se juega en una ventana de reacción' };

    let aplica = false;
    if (carta.tipo === 'reaccion_cancelar_cualquier_carta') {
      aplica = true; // Anulación: cualquier carta, de cualquier mazo
    } else if (carta.tipo === 'reaccion_cancelar_portal') {
      aplica = ventana.tipo === 'portal'; // Anti-Portal: solo portales
    } else if (carta.tipo === 'reaccion_cancelar_poder_contra_mi') {
      aplica = ventana.tipo === 'poder' && ventana.targetPlayerId === reactorId; // Negación Absoluta: poder jugado CONTRA mí
    }

    if (!aplica) {
      return { exito: false, motivo: `"${carta.nombre}" no puede cancelar este efecto (tipo: ${ventana.tipo})` };
    }

    reactor.manoPoder.splice(idx, 1);
    this.mazoPoder.descarte.push(carta);
    ventana.cancelada = true;
    ventana.canceladaPor = reactorId;
    this._logEvent(`${reactor.nombre} juega "${carta.nombre}" y cancela el efecto de la ventana #${ventanaId}.`);
    return { exito: true };
  }

  /** Cierra la ventana: aplica el efecto guardado si nadie reaccionó, o lo descarta si sí. */
  cerrarVentanaReaccion(ventanaId) {
    const ventana = this.ventanasAbiertas.get(ventanaId);
    if (!ventana) return { exito: false, motivo: 'ventana inexistente' };
    this.ventanasAbiertas.delete(ventanaId);

    if (ventana.cancelada) {
      this._logEvent(`Ventana #${ventanaId} se cierra: efecto CANCELADO por ${this.players.get(ventana.canceladaPor)?.nombre}.`);
      return { aplicado: false, cancelado: true, canceladaPor: ventana.canceladaPor };
    }
    ventana.aplicar();
    this._logEvent(`Ventana #${ventanaId} se cierra: nadie reaccionó, efecto aplicado.`);
    return { aplicado: true, cancelado: false };
  }

  /**
   * Variante de jugarCartaPoder pensada para el servidor real: en vez de
   * aplicar el efecto de inmediato, abre una ventana de reacción y
   * devuelve su id para que el servidor la mantenga abierta unos
   * segundos antes de llamar cerrarVentanaReaccion(id).
   */
  jugarCartaPoderConVentana(playerId, cartaId, opciones = {}) {
    const p = this.players.get(playerId);
    if (!p) return { exito: false, motivo: 'jugador inexistente' };
    if (p.bloqueoPoderTurnos > 0) return { exito: false, motivo: 'no puede usar cartas de poder este turno (bloqueado)' };
    if (p.cartaPoderJugadaEsteTurno) return { exito: false, motivo: 'ya jugó su única carta de poder este turno' };
    const idx = p.manoPoder.findIndex((c) => c.id === cartaId);
    if (idx === -1) return { exito: false, motivo: 'no tiene esa carta en mano' };
    const carta = p.manoPoder[idx];
    if (carta.requiereVentanaReaccion) return { exito: false, motivo: 'esta carta se juega con jugarCartaReaccion(), no aquí' };

    if (carta.tipo === 'copiar_ultima_carta_jugada') {
      const u = this.ultimaCartaPoderJugada;
      const hayFuente = u && u.playerId !== playerId && u.carta.tipo !== 'copiar_ultima_carta_jugada';
      if (!hayFuente) return { exito: false, motivo: 'nadie más ha jugado una carta de poder todavía: puedes guardarla para después' };
    }

    p.manoPoder.splice(idx, 1);
    p.cartaPoderJugadaEsteTurno = true;
    this._logEvent(`${p.nombre} juega "${carta.nombre}" — se abre ventana de reacción antes de aplicarse.`);

    const targetId = opciones.targetId || null;
    const ventanaId = this.abrirVentanaReaccion('poder', playerId, targetId, () => {
      this.aplicarEfectoPoder(playerId, carta, opciones);
      this.mazoPoder.descarte.push(carta);
      this.ultimaCartaPoderJugada = { playerId, carta };
    });
    return { exito: true, ventanaId };
  }

  /**
   * Variante de la resolución de una casilla de Portal pensada para el
   * servidor real: roba la carta y abre la ventana (para Anti-Portal),
   * sin aplicar el efecto todavía.
   */
  resolverCasillaPortalConVentana(playerId) {
    const p = this.players.get(playerId);
    if (!p) return { exito: false, motivo: 'jugador inexistente' };
    const carta = this.mazoPortal.robar();
    this._logEvent(`${p.nombre} cae en PORTAL (casilla ${p.casilla}) → carta: ${carta.nombre} — se abre ventana de reacción.`);
    const ventanaId = this.abrirVentanaReaccion('portal', playerId, null, () => {
      this.aplicarEfectoPortal(playerId, carta);
    });
    return { exito: true, ventanaId, carta };
  }

  // ---------------------------------------------------------------
  // Cartas de PODER — se juegan desde la mano, no al caer en la casilla
  // ---------------------------------------------------------------

  /** Jugador a la derecha/izquierda según el orden de turno (convención fijada para todo el motor). */
  _jugadorDerecha(playerId) {
    const i = this.turnOrder.indexOf(playerId);
    return this.players.get(this.turnOrder[(i + 1) % this.turnOrder.length]);
  }
  _jugadorIzquierda(playerId) {
    const i = this.turnOrder.indexOf(playerId);
    return this.players.get(this.turnOrder[(i - 1 + this.turnOrder.length) % this.turnOrder.length]);
  }

  /**
   * Intenta jugar una carta de la mano de poder de un jugador.
   * `cartaId` es el id de catálogo (p.ej. 'absorcion_vital').
   * `opciones` trae los datos que dependan de una elección del jugador
   * (objetivo, qué carta descartar, etc.) — ver cada caso en
   * aplicarEfectoPoder.
   *
   * Devuelve { exito, motivo? }.
   */
  jugarCartaPoder(playerId, cartaId, opciones = {}) {
    const p = this.players.get(playerId);
    if (!p) return { exito: false, motivo: 'jugador inexistente' };

    if (p.bloqueoPoderTurnos > 0) {
      return { exito: false, motivo: 'no puede usar cartas de poder este turno (bloqueado)' };
    }
    if (p.cartaPoderJugadaEsteTurno) {
      return { exito: false, motivo: 'ya jugó su única carta de poder este turno' };
    }
    const idx = p.manoPoder.findIndex((c) => c.id === cartaId);
    if (idx === -1) return { exito: false, motivo: 'no tiene esa carta en mano' };
    const carta = p.manoPoder[idx];

    if (carta.requiereVentanaReaccion) {
      return {
        exito: false,
        motivo: 'esta carta se juega en la ventana de reacción (fuera de turno), aún no implementada en el motor',
      };
    }

    // Eco de Poder: si no hay nada que copiar, el jugador simplemente no
    // la juega (se queda en su mano para más adelante) — no se consume.
    if (carta.tipo === 'copiar_ultima_carta_jugada') {
      const u = this.ultimaCartaPoderJugada;
      const hayFuente = u && u.playerId !== playerId && u.carta.tipo !== 'copiar_ultima_carta_jugada';
      if (!hayFuente) {
        return { exito: false, motivo: 'nadie más ha jugado una carta de poder todavía: puedes guardarla para después' };
      }
    }

    // A partir de aquí la jugada se confirma: se retira de la mano.
    p.manoPoder.splice(idx, 1);
    p.cartaPoderJugadaEsteTurno = true;
    this._logEvent(`${p.nombre} juega la carta de poder "${carta.nombre}".`);
    this.aplicarEfectoPoder(playerId, carta, opciones);
    this.mazoPoder.descarte.push(carta);
    this.ultimaCartaPoderJugada = { playerId, carta };
    return { exito: true };
  }

  aplicarEfectoPoder(playerId, carta, opciones = {}) {
    const p = this.players.get(playerId);
    if (!p) return;
    const elegirObjetivoPorDefecto = () => {
      const otros = [...this.players.keys()].filter((id) => id !== playerId);
      return otros[0];
    };
    const robarUnaCarta = (jugador) => {
      if (jugador.manoPoder.length < MAX_MANO_PODER) {
        const c = this.mazoPoder.robar();
        jugador.manoPoder.push(c);
        return c;
      }
      this._logEvent(`${jugador.nombre} tiene la mano llena: no puede robar más (pendiente de decidir con el cliente).`);
      return null;
    };

    switch (carta.tipo) {
      case 'ganar_vida':
        p.ganarVida(carta.valor);
        this._logEvent(`${p.nombre} gana ${carta.valor} vida(s) → ${p.vidas}.`);
        break;

      case 'ganar_vida_diferida':
        p.reservaVitalPendiente = carta.valor;
        this._logEvent(`${p.nombre} activa Reserva Vital: +${carta.valor} vida al inicio de su próximo turno (se cancela si recibe daño antes).`);
        break;

      case 'ganar_vida_por_turnos':
        p.regeneracionInestable = { valor: carta.valor, turnosRestantes: carta.turnos };
        this._logEvent(`${p.nombre} activa Regeneración Inestable (+${carta.valor} vida por ${carta.turnos} turnos, termina si pierde un combate).`);
        break;

      case 'recuperar_vida_turno_anterior':
        p.ganarVida(p.vidaPerdidaTurnoAnterior);
        this._logEvent(`${p.nombre} recupera ${p.vidaPerdidaTurnoAnterior} vida(s) perdidas en su turno anterior.`);
        break;

      case 'ganar_vida_y_pierde_turno':
        p.ganarVida(carta.valor);
        p.turnosPerdidos += 1;
        this._logEvent(`${p.nombre} gana ${carta.valor} vida(s) y pierde su siguiente turno (Sobrecarga).`);
        break;

      case 'duplicar_vida':
        p.ganarVida(p.vidas); // ganarVida ya aplica el tope de 20
        this._logEvent(`${p.nombre} duplica su vida (tope 20) → ${p.vidas}.`);
        break;

      case 'igualar_vida_con_lider': {
        let max = p.vidas;
        for (const other of this.players.values()) max = Math.max(max, other.vidas);
        p.vidas = max;
        this._logEvent(`${p.nombre} iguala su vida con el líder → ${p.vidas}.`);
        break;
      }

      case 'ganar_vida_condicional': {
        let esMenor = true;
        for (const other of this.players.values()) {
          if (other.id !== playerId && p.vidas >= other.vidas) esMenor = false;
        }
        const valor = esMenor ? carta.valorSiMenor : carta.valorSiNo;
        p.ganarVida(valor);
        this._logEvent(`${p.nombre} ${esMenor ? 'tiene menos vida que todos' : 'no tiene la menor vida'} → gana ${valor}.`);
        break;
      }

      case 'ganar_vida_y_robar_carta':
        p.ganarVida(carta.valor);
        robarUnaCarta(p);
        this._logEvent(`${p.nombre} gana ${carta.valor} vida(s) y roba una carta de poder.`);
        break;

      case 'intercambiar_mano_elegido': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target) {
          const tmp = p.manoPoder; p.manoPoder = target.manoPoder; target.manoPoder = tmp;
          this._logEvent(`${p.nombre} intercambia toda su mano con ${target.nombre}.`);
        }
        break;
      }

      case 'ronda_caotica': {
        const noParticipan = new Set(opciones.noParticipan || []);
        const participantes = this.turnOrder.filter((id) => !noParticipan.has(id));
        if (participantes.length > 1) {
          const manos = participantes.map((id) => this.players.get(id).manoPoder);
          for (let i = 0; i < participantes.length; i++) {
            const origen = (i + 1) % participantes.length; // pasa a la derecha
            this.players.get(participantes[i]).manoPoder = manos[origen];
          }
        }
        this._logEvent(`Ronda Caótica: manos rotadas entre ${participantes.length} jugador(es) (${noParticipan.size} decidieron no participar).`);
        break;
      }

      case 'reconfigurar_mano':
        p.manoPoder = [];
        for (let i = 0; i < carta.cantidad; i++) p.manoPoder.push(this.mazoPoder.robar());
        this._logEvent(`${p.nombre} descarta su mano y roba ${carta.cantidad} cartas nuevas.`);
        break;

      case 'robar_carta_azar_de_jugador': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target && target.manoPoder.length > 0) {
          const i = Math.floor(Math.random() * target.manoPoder.length);
          const c = target.manoPoder.splice(i, 1)[0];
          p.manoPoder.push(c);
          this._logEvent(`${p.nombre} roba "${c.nombre}" de la mano de ${target.nombre}.`);
        }
        break;
      }

      case 'robar_y_quedarse_una': {
        const robadas = [];
        for (let i = 0; i < carta.roba; i++) robadas.push(this.mazoPoder.robar());
        const quedarIdx = opciones.quedarseIndice ?? 0;
        const quedada = robadas.splice(quedarIdx, 1)[0];
        p.manoPoder.push(quedada);
        this.mazoPoder.descarte.push(...robadas);
        this._logEvent(`${p.nombre} roba ${carta.roba} cartas, se queda con "${quedada.nombre}" y descarta el resto.`);
        break;
      }

      case 'inspeccionar_y_tomar': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (target && target.manoPoder.length > 0) {
          const i = opciones.cartaIndice ?? 0;
          const c = target.manoPoder.splice(i, 1)[0];
          p.manoPoder.push(c);
          this._logEvent(`${p.nombre} inspecciona la mano de ${target.nombre} y toma "${c.nombre}".`);
        }
        break;
      }

      case 'intercambio_multiple_todos': {
        let i = this.turnOrder.indexOf(playerId);
        const n = this.turnOrder.length;
        for (let step = 1; step < n; step++) {
          if (p.manoPoder.length === 0) break;
          const target = this.players.get(this.turnOrder[(i + step) % n]);
          const darIdx = 0; // "eliges qué dar" — el cliente indicaría el índice real
          const dada = p.manoPoder.splice(darIdx, 1)[0];
          target.manoPoder.push(dada);
          if (target.manoPoder.length > 1) {
            // no se toma la que se acaba de dar; se elige al azar entre el resto sin verla
            const idxAzar = Math.floor(Math.random() * (target.manoPoder.length - 1));
            const tomada = target.manoPoder.splice(idxAzar, 1)[0];
            p.manoPoder.push(tomada);
          }
        }
        this._logEvent(`${p.nombre} completa Intercambio Múltiple en sentido horario.`);
        break;
      }

      case 'todos_descartan_azar_excepto_yo':
        for (const other of this.players.values()) {
          if (other.id === playerId || other.manoPoder.length === 0) continue;
          const i = Math.floor(Math.random() * other.manoPoder.length);
          const c = other.manoPoder.splice(i, 1)[0];
          this.mazoPoder.descarte.push(c);
        }
        this._logEvent(`Pérdida Global: todos descartan 1 carta al azar excepto ${p.nombre}.`);
        break;

      case 'copiar_ultima_carta_jugada': {
        const u = this.ultimaCartaPoderJugada; // ya validado en jugarCartaPoder que existe y es de otro jugador
        this._logEvent(`${p.nombre} copia el efecto de "${u.carta.nombre}" (jugada por ${this.players.get(u.playerId).nombre}).`);
        this.aplicarEfectoPoder(playerId, u.carta, opciones);
        break;
      }

      case 'tomar_carta_del_descarte': {
        if (this.mazoPoder.descarte.length === 0) {
          this._logEvent(`${p.nombre}: el descarte de Poder está vacío, Rescate del Caos sin efecto.`);
          break;
        }
        const i = opciones.cartaIndice ?? this.mazoPoder.descarte.length - 1;
        const c = this.mazoPoder.descarte.splice(i, 1)[0];
        p.manoPoder.push(c);
        this._logEvent(`${p.nombre} rescata "${c.nombre}" del descarte.`);
        break;
      }

      case 'todos_pierden_vida_excepto_yo':
        for (const other of this.players.values()) {
          if (other.id !== playerId) other.recibirDano(carta.valor);
        }
        this._logEvent(`Golpe Global: todos pierden ${carta.valor} vida(s) excepto ${p.nombre}.`);
        break;

      case 'derecha_pierde_turno': {
        const d = this._jugadorDerecha(playerId);
        d.turnosPerdidos += 1;
        this._logEvent(`${p.nombre} hace que ${d.nombre} (a su derecha) pierda su siguiente turno.`);
        break;
      }

      case 'izquierda_pierde_vida': {
        const iz = this._jugadorIzquierda(playerId);
        iz.recibirDano(carta.valor);
        this._logEvent(`${p.nombre} hace que ${iz.nombre} (a su izquierda) pierda ${carta.valor} vida(s).`);
        break;
      }

      case 'rotar_posiciones_por_rango': {
        // Ranking por progreso (casilla), empate → más vidas → dado.
        const ranking = [...this.players.values()].sort((a, b) => {
          if (b.casilla !== a.casilla) return b.casilla - a.casilla;
          if (b.vidas !== a.vidas) return b.vidas - a.vidas;
          return Math.random() - 0.5;
        });
        const casillasOriginales = ranking.map((j) => j.casilla);
        const ladosOriginales = ranking.map((j) => j.lado);
        for (let i = 0; i < ranking.length; i++) {
          if (i === 0) {
            // "el primer lugar pasa a ser el último"
            ranking[0].casilla = casillasOriginales[ranking.length - 1];
            ranking[0].lado = ladosOriginales[ranking.length - 1];
          } else {
            ranking[i].casilla = casillasOriginales[i - 1]; // toma la posición del que iba delante
            ranking[i].lado = ladosOriginales[i - 1];
          }
        }
        this._logEvent('Intercambio Masivo: todos toman la posición de quien iba delante; el líder pasa a ser el último.');
        break;
      }

      case 'objetivo_roba_trampa': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target) {
          const c = this.mazoTrampa.robar();
          this._logEvent(`Destino Manipulado: ${target.nombre} roba y ejecuta la trampa "${c.nombre}".`);
          this.aplicarEfectoTrampa(targetId, c);
        }
        break;
      }

      case 'objetivo_sin_recompensa_proximo_combate': {
        const targetId = opciones.targetId || elegirObjetivoPorDefecto();
        const target = this.players.get(targetId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        if (target) {
          target.sinRecompensaProximoCombate = true;
          this._logEvent(`Castigo Selectivo: ${target.nombre} no recibirá recompensa en su próximo combate ganado.`);
        }
        break;
      }

      case 'todos_descartan_mano_poder_opcional_propia': {
        const conservarPropia = opciones.conservarPropia !== false; // por defecto, sí conserva la suya
        for (const other of this.players.values()) {
          if (other.id === playerId && conservarPropia) continue;
          this.mazoPoder.descarte.push(...other.manoPoder);
          other.manoPoder = [];
        }
        this._logEvent(`Colapso de Poder: todos descartan su mano${conservarPropia ? ` excepto ${p.nombre}` : ''}.`);
        break;
      }

      case 'reaccion_cancelar_cualquier_carta':
      case 'reaccion_cancelar_portal':
      case 'reaccion_cancelar_poder_contra_mi':
        // No debería llegar aquí: jugarCartaPoder() ya intercepta las
        // cartas de reacción antes de este punto.
        this._logEvent(`(${carta.nombre} requiere la ventana de reacción, aún no implementada)`);
        break;

      default:
        this._logEvent(`(sin manejador para el efecto de poder "${carta.tipo}" de ${carta.nombre})`);
    }
  }

  // ---------------------------------------------------------------
  // Cartas de COMBATE — reto en dos fases: robar (resolverCasilla ya
  // lo hace) y luego resolverCombate() con el resultado real.
  // ---------------------------------------------------------------

  /** Jugador más cercano a `playerId` por diferencia de casilla (para Doble Identidad). */
  _jugadorMasCercano(playerId) {
    const p = this.players.get(playerId);
    const candidatos = [...this.players.values()].filter((pl) => pl.id !== playerId);
    if (candidatos.length === 0) return null;
    let minDist = Math.min(...candidatos.map((pl) => Math.abs(pl.casilla - p.casilla)));
    let empatados = candidatos.filter((pl) => Math.abs(pl.casilla - p.casilla) === minDist);
    if (empatados.length > 1) {
      const maxVidas = Math.max(...empatados.map((pl) => pl.vidas));
      empatados = empatados.filter((pl) => pl.vidas === maxVidas);
    }
    if (empatados.length > 1) empatados = [empatados[Math.floor(Math.random() * empatados.length)]];
    return empatados[0];
  }

  /** Traduce un `objetivo` de carta de Combate a la lista de jugadores reales a afectar. */
  _resolverObjetivosCombate(playerId, objetivo, opciones) {
    const p = this.players.get(playerId);
    switch (objetivo) {
      case 'yo': return [p];
      case 'derecha': return [this._jugadorDerecha(playerId)];
      case 'izquierda': return [this._jugadorIzquierda(playerId)];
      case 'todos_excepto_yo': return [...this.players.values()].filter((pl) => pl.id !== playerId);
      case 'mas_adelantado': { const j = this._jugadorExtremo('primero', playerId); return j ? [j] : []; }
      case 'mas_rezagado': { const j = this._jugadorExtremo('ultimo', playerId); return j ? [j] : []; }
      case 'mas_cercano': { const j = this._jugadorMasCercano(playerId); return j ? [j] : []; }
      case 'elegido': {
        const targetId = opciones.targetId || [...this.players.keys()].find((id) => id !== playerId);
        if (!opciones.targetId) this._logEvent('(sin objetivo explícito: se eligió automáticamente el primer jugador disponible)');
        const t = this.players.get(targetId);
        return t ? [t] : [];
      }
      default: return [];
    }
  }

  /** Aplica un array de micro-acciones (recompensa/castigo de una carta de Combate). */
  _aplicarAccionesCombate(playerId, acciones, opciones) {
    for (const accion of acciones) {
      switch (accion.accion) {
        case 'vida': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          for (const j of objetivos) {
            if (accion.valor >= 0) j.ganarVida(accion.valor);
            else j.recibirDano(-accion.valor);
          }
          break;
        }
        case 'mover': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          for (const j of objetivos) {
            if (accion.valor >= 0) this.moverJugador(j.id, accion.valor); // avanza y resuelve en cadena
            else this.retrocederJugador(j.id, -accion.valor); // retrocede con tope, sin cadena
          }
          break;
        }
        case 'intercambiar': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          const p = this.players.get(playerId);
          if (objetivos[0]) this._intercambiarPosiciones(p, objetivos[0]);
          break;
        }
        case 'robarMazoPoder': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          for (const j of objetivos) {
            for (let i = 0; i < accion.valor; i++) {
              if (j.manoPoder.length < MAX_MANO_PODER) j.manoPoder.push(this.mazoPoder.robar());
              else { this._logEvent(`${j.nombre}: mano llena, no puede robar más de Poder.`); break; }
            }
          }
          break;
        }
        case 'robarMazoTrampa': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          for (const j of objetivos) {
            for (let i = 0; i < accion.valor; i++) {
              const c = this.mazoTrampa.robar();
              this._logEvent(`${j.nombre} roba y ejecuta la trampa "${c.nombre}" (por resultado de combate).`);
              this.aplicarEfectoTrampa(j.id, c);
            }
          }
          break;
        }
        case 'robarManoPoder': {
          const de = this._resolverObjetivosCombate(playerId, accion.de, opciones)[0];
          const a = this._resolverObjetivosCombate(playerId, accion.a, opciones)[0];
          if (de && a && de.manoPoder.length > 0) {
            for (let i = 0; i < accion.valor; i++) {
              if (de.manoPoder.length === 0) break;
              const idx = Math.floor(Math.random() * de.manoPoder.length);
              const c = de.manoPoder.splice(idx, 1)[0];
              a.manoPoder.push(c);
              this._logEvent(`${a.nombre} toma "${c.nombre}" de la mano de ${de.nombre}.`);
            }
          }
          break;
        }
        case 'descartarPoder': {
          const objetivos = this._resolverObjetivosCombate(playerId, accion.objetivo, opciones);
          for (const j of objetivos) {
            for (let i = 0; i < accion.valor; i++) {
              if (j.manoPoder.length === 0) break;
              const idx = Math.floor(Math.random() * j.manoPoder.length);
              const c = j.manoPoder.splice(idx, 1)[0];
              this.mazoPoder.descarte.push(c);
            }
          }
          break;
        }
        default:
          this._logEvent(`(sin manejador para la acción de combate "${accion.accion}")`);
      }
    }
  }

  /**
   * Resuelve el resultado de un combate ya presentado (ver `combateActivo`,
   * fijado por resolverCasilla al caer en una casilla de Combate).
   *
   * @param playerId
   * @param gano       true si respondió correctamente el reto
   * @param opcion     'A' | 'B' — cuál de las dos recompensas/castigos elige
   * @param opciones   { targetId } cuando el efecto requiere elegir a alguien
   */
  resolverCombate(playerId, gano, opcion, opciones = {}) {
    const p = this.players.get(playerId);
    if (!p || !p.combateActivo) {
      return { exito: false, motivo: 'no hay un combate activo para este jugador' };
    }
    const carta = p.combateActivo;
    p.combateActivo = null;

    if (gano && p.sinRecompensaProximoCombate) {
      p.sinRecompensaProximoCombate = false;
      this._logEvent(`${p.nombre} ganó el combate "${carta.nombre}" pero no recibe recompensa (Castigo Selectivo).`);
      return { exito: true, aplicado: 'ninguno (Castigo Selectivo)' };
    }

    const clave = (gano ? 'recompensa' : 'castigo') + opcion; // p.ej. 'recompensaA'
    const acciones = carta[clave];
    if (!acciones) return { exito: false, motivo: `opción inválida: ${clave}` };

    this._logEvent(`${p.nombre} ${gano ? 'ganó' : 'perdió'} el combate "${carta.nombre}" → aplica ${clave}.`);
    this._aplicarAccionesCombate(playerId, acciones, opciones);

    if (!gano) this.perderCombate(playerId); // cancela Regeneración Inestable / aplica Condena Inminente

    return { exito: true };
  }

  /** true si `playerId` tiene más vida que TODOS los demás, o empata con el máximo. */
  _tieneMasVidaQueTodos(playerId) {
    const p = this.players.get(playerId);
    let max = -Infinity;
    for (const other of this.players.values()) {
      if (other.id !== playerId) max = Math.max(max, other.vidas);
    }
    return p.vidas >= max;
  }

  /** Jugador más adelantado o más rezagado, con desempate (más vidas → dado). */
  _jugadorExtremo(tipo, excludeId) {
    const candidatos = [...this.players.values()].filter((pl) => pl.id !== excludeId);
    if (candidatos.length === 0) return null;
    const target = tipo === 'primero'
      ? Math.max(...candidatos.map((pl) => pl.casilla))
      : Math.min(...candidatos.map((pl) => pl.casilla));
    let empatados = candidatos.filter((pl) => pl.casilla === target);
    if (empatados.length > 1) {
      const maxVidas = Math.max(...empatados.map((pl) => pl.vidas));
      empatados = empatados.filter((pl) => pl.vidas === maxVidas);
    }
    if (empatados.length > 1) {
      empatados = [empatados[Math.floor(Math.random() * empatados.length)]]; // dado simulado
    }
    return empatados[0];
  }

  _intercambiarPosiciones(a, b) {
    const tmp = a.casilla;
    a.casilla = b.casilla;
    b.casilla = tmp;
    this._logEvent(`${a.nombre} intercambia posición con ${b.nombre} (${a.casilla} ⇄ ${b.casilla}).`);
  }
}

/**
 * Normaliza texto para comparar respuestas de forma flexible:
 * mayúsculas, sin acentos, sin espacios sobrantes.
 */
function _normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Valida automáticamente lo que escribió un jugador contra la respuesta
 * oficial de una carta de Combate (ver combateDeck.js). Devuelve
 * { evaluable, correcto }. `evaluable=false` cuando la carta es de
 * validación 'abierta' — en ese caso el cliente debe recurrir a que el
 * propio jugador confirme, igual que en la mesa física.
 */
function validarRespuestaCombate(carta, textoJugador) {
  if (carta.validacion === 'abierta') {
    return { evaluable: false, correcto: null };
  }
  // separa por comas o por la conjunción " y " (p.ej. "Van Gogh y Che Guevara")
  const partes = carta.respuesta.split(/,| y /i).map((p) => _normalizarTexto(p)).filter(Boolean);
  const dado = _normalizarTexto(textoJugador);
  if (dado === '') return { evaluable: true, correcto: false };
  const correcto = partes.every((parte) => dado.includes(parte));
  return { evaluable: true, correcto };
}

module.exports = { Game, Player, PERSONAJES, getCasillaInfo, VIDA_MAXIMA, CASILLA_PUENTE, ULTIMA_CASILLA, validarRespuestaCombate };
