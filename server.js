'use strict';
/**
 * Servidor de partida de Aetherion. Une tres piezas:
 *   - gameEngine.js  → toda la lógica y validación de reglas
 *   - miniWs.js       → transporte en tiempo real (WebSocket nativo)
 *   - /public         → el cliente web (HTML/CSS/JS) y las cartas (imágenes)
 *
 * Filosofía: el servidor es la ÚNICA fuente de verdad. Los clientes
 * mandan INTENCIONES, nunca estado. El servidor valida contra el motor
 * y difunde el estado resultante a todos los jugadores conectados.
 *
 * Cada jugador recibe:
 *   - el estado PÚBLICO de todos (posición, vidas, cuántas cartas tiene
 *     cada quien — no CUÁLES)
 *   - su propia mano de poder COMPLETA (privada, solo para él)
 *   - los eventos nuevos desde el último mensaje (para animar)
 *
 * Uso: node server.js [puerto]   (por defecto 8787)
 */
const fs = require('fs');
const path = require('path');
const { WSServer } = require('./miniWs');
const { Game, validarRespuestaCombate } = require('./gameEngine');

const PUERTO = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.argv[2] ? parseInt(process.argv[2], 10) : 8787);
const PUBLIC_DIR = path.join(__dirname, 'public');

const game = new Game('partida-demo');
const conexiones = new Map(); // playerId -> WSConnection

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

function servirEstatico(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('prohibido'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('no encontrado: ' + urlPath); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function estadoPublico() {
  return {
    type: 'estado',
    turnoDe: game.jugadorActual ? game.jugadorActual.id : null,
    log: game.log.slice(-12),
    jugadores: [...game.players.values()].map((p) => ({
      id: p.id,
      nombre: p.nombre,
      personaje: p.personajeKey,
      lado: p.lado,
      casilla: p.casilla,
      vidas: p.vidas,
      manoPoderCount: p.manoPoder.length,
      enBatallaFinal: p.enBatallaFinal,
      atrapado: !!p.atrapado,
      combateActivo: p.combateActivo ? {
        cartaId: p.combateActivo.id,
        nombre: p.combateActivo.nombre,
        tiempoSegundos: p.combateActivo.tiempoSegundos,
      } : null,
    })),
  };
}

function manoPrivada(playerId) {
  const p = game.players.get(playerId);
  if (!p) return { type: 'mano', cartas: [] };
  return { type: 'mano', cartas: p.manoPoder.map((c) => ({ id: c.id, nombre: c.nombre })) };
}

function difundirEstado() {
  const estado = estadoPublico();
  const eventos = game.drenarEventos();
  for (const [pid, conn] of conexiones.entries()) {
    conn.send({ ...estado, eventos });
    conn.send(manoPrivada(pid));
  }
}

function enviarError(conn, motivo) {
  conn.send({ type: 'error', motivo });
}

const server = new WSServer(PUERTO, servirEstatico);
console.log(`[Aetherion] Servidor escuchando en http://localhost:${PUERTO}  (y WebSocket en el mismo puerto)`);

server.on('connection', (conn) => {
  let playerId = null;

  // Sin este manejador, una desconexión abrupta (cliente que pierde señal,
  // cierra la app, etc.) tira una excepción no capturada y CAE TODO EL
  // SERVIDOR para el resto de los jugadores. 'close' ya se encarga de la
  // limpieza normal — aquí solo evitamos que el error tumbe el proceso.
  conn.on('error', () => {});

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return enviarError(conn, 'JSON inválido'); }

    switch (msg.type) {
      case 'unirse': {
        if (game.players.has(msg.playerId)) {
          // Reconexión (p.ej. el jugador recargó la página): solo re-vincula el socket.
          playerId = msg.playerId;
          conexiones.set(playerId, conn);
          conn.send(estadoPublico());
          conn.send(manoPrivada(playerId));
          return;
        }
        try {
          game.addPlayer(msg.playerId, msg.nombre, msg.personaje);
          playerId = msg.playerId;
          conexiones.set(playerId, conn);
          console.log(`[Aetherion] ${msg.nombre} (${msg.personaje}) se unió como ${playerId}`);
          difundirEstado();
        } catch (e) {
          enviarError(conn, e.message);
        }
        break;
      }

      case 'tirarDado': {
        if (playerId !== game.jugadorActual?.id) return enviarError(conn, 'no es tu turno');
        const dado = Math.floor(Math.random() * 6) + 1;
        game._emitirEvento({ tipo: 'dadoTirado', playerId, valor: dado });
        game.moverJugador(playerId, dado);
        console.log(`[Aetherion] ${playerId} tira dado: ${dado}`);
        difundirEstado();
        break;
      }

      case 'jugarCartaPoder': {
        const r = game.jugarCartaPoder(playerId, msg.cartaId, msg.opciones || {});
        if (!r.exito) return enviarError(conn, r.motivo);
        difundirEstado();
        break;
      }

      case 'responderCombate': {
        // El cliente manda el TEXTO que escribió el jugador — el servidor
        // decide si acertó comparando contra la respuesta oficial (ver
        // gameEngine.validarRespuestaCombate). Así nadie puede hacer
        // trampa mandando gano:true directamente desde la consola del
        // navegador, y el jugador ya no tiene que autoevaluarse.
        const p = game.players.get(playerId);
        if (!p || !p.combateActivo) return enviarError(conn, 'no hay un combate activo para ti');
        const v = validarRespuestaCombate(p.combateActivo, msg.texto || '');
        if (!v.evaluable) {
          // Reto de respuesta abierta (p.ej. un palíndromo cualquiera):
          // no hay una única respuesta correcta que comparar por texto,
          // así que se le pregunta directamente al cliente y se resuelve
          // con 'resolverCombate' de una vez.
          conn.send({ type: 'combateNoEvaluable', motivo: 'Esta carta tiene respuesta abierta: confirma tú mismo si acertaste.' });
          return;
        }
        conn.send({ type: 'combateResultado', correcto: v.correcto });
        break;
      }

      case 'resolverCombate': {
        const r = game.resolverCombate(playerId, !!msg.gano, msg.opcion, msg.opciones || {});
        if (!r.exito) return enviarError(conn, r.motivo);
        difundirEstado();
        break;
      }

      case 'pasarTurno': {
        if (playerId !== game.jugadorActual?.id) return enviarError(conn, 'no es tu turno');
        game.siguienteTurno();
        const est = game.iniciarTurno(game.jugadorActual.id);
        console.log(`[Aetherion] turno pasa a ${game.jugadorActual.id}${est.turnoOmitido ? ' (se salta el turno)' : ''}`);
        difundirEstado();
        break;
      }

      default:
        enviarError(conn, `tipo de mensaje desconocido: ${msg.type}`);
    }
  });

  conn.on('close', () => {
    if (playerId && conexiones.get(playerId) === conn) {
      conexiones.delete(playerId);
      console.log(`[Aetherion] ${playerId} se desconectó`);
    }
  });
});

module.exports = { server, game, PUERTO };
