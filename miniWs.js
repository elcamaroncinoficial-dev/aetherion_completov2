'use strict';
/**
 * Implementación mínima del protocolo WebSocket (RFC 6455) usando solo
 * módulos nativos de Node (http, crypto, net) — sin paquetes externos,
 * porque este sandbox no tiene acceso a internet para instalar 'ws'.
 *
 * Cubre lo suficiente para el motor de Aetherion: handshake, frames de
 * texto (JSON), cierre limpio. No cubre fragmentación multi-frame ni
 * extensiones — de sobra para esta demo y para desarrollo temprano.
 */
const http = require('http');
const crypto = require('crypto');
const EventEmitter = require('events');

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + MAGIC).digest('base64');
}

/** Envuelve un socket TCP ya "upgradeado" con framing WebSocket básico. */
class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this._buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this.emit('close'));
    socket.on('error', (err) => this.emit('error', err));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._tryParseFrames();
  }

  _tryParseFrames() {
    while (this._buffer.length >= 2) {
      const first = this._buffer[0];
      const second = this._buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._buffer.length < 4) return;
        payloadLen = this._buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buffer.length < 10) return;
        payloadLen = Number(this._buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = offset + maskLen + payloadLen;
      if (this._buffer.length < totalLen) return; // esperar más datos

      let payload = this._buffer.subarray(offset + maskLen, totalLen);
      if (masked) {
        const mask = this._buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ mask[i % 4];
        payload = unmasked;
      }

      this._buffer = this._buffer.subarray(totalLen);

      if (opcode === 0x8) { // close
        this.emit('close');
        this.socket.end();
      } else if (opcode === 0x1) { // texto
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === 0x9) { // ping -> pong
        this._sendFrame(payload, 0xA);
      }
    }
  }

  send(obj) {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
    this._sendFrame(Buffer.from(json, 'utf8'), 0x1);
  }

  _sendFrame(payload, opcode) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  close() {
    this._sendFrame(Buffer.alloc(0), 0x8);
    this.socket.end();
  }
}

/** Servidor WebSocket mínimo: escucha en `port`, emite 'connection' con cada WSConnection.
 *  `requestHandler(req,res)` opcional: si se pasa, atiende peticiones HTTP normales
 *  (no-upgrade) — así el mismo servidor puede servir la página del cliente. */
class WSServer extends EventEmitter {
  constructor(port, requestHandler) {
    super();
    this.httpServer = http.createServer((req, res) => {
      if (requestHandler) return requestHandler(req, res);
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Este puerto solo habla WebSocket.');
    });

    this.httpServer.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) { socket.destroy(); return; }
      const accept = acceptKey(key);
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      const conn = new WSConnection(socket);
      this.emit('connection', conn);
    });

    this.httpServer.listen(port);
  }

  close(cb) {
    this.httpServer.close(cb);
  }
}

module.exports = { WSServer };
