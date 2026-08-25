'use strict';
/**
 * Cliente de Aetherion. NO tiene lógica de reglas propia — todo lo que
 * hace es: mandar intenciones al servidor por WebSocket, y renderizar
 * lo que el servidor le manda de vuelta. El servidor es la única
 * fuente de verdad (ver server.js).
 */

const EMOJI = { mago: '🧙', guerrero: '🛡️', alquimista: '🧪', helada: '❄️', sombra: '🌑', hijoDragon: '🐉' };
const NOMBRE_PERSONAJE = {
  mago: 'El Mago', guerrero: 'El Guerrero', alquimista: 'El Alquimista',
  helada: 'La Helada', sombra: 'La Sombra', hijoDragon: 'El Hijo del Dragón',
};

let ws = null;
let miId = null;
let miPersonaje = null;
let coords = null; // se carga de /img/coordenadas.json
let ultimoEstado = null;
const fichaEls = new Map(); // playerId -> elemento DOM de la ficha (persistente, para poder animar)
const posicionesAnteriores = {}; // playerId -> {lado, casilla, enBatallaFinal} del render anterior

// Cartas de Poder cuyo efecto necesita que el jugador elija a alguien —
// coincide con las que en el motor esperan opciones.targetId.
const CARTAS_QUE_PIDEN_OBJETIVO = new Set(['intercambio_mano_total', 'robo_forzado', 'inspeccion', 'destino_manipulado', 'castigo_selectivo']);
let retrasarProximaMano = false; // sincroniza la animación de "carta volando" con su aparición real en la mano

// ---------- Elementos ----------
const pantallaLogin = document.getElementById('pantallaLogin');
const pantallaJuego = document.getElementById('pantallaJuego');
const inputNombre = document.getElementById('inputNombre');
const gridPersonajes = document.getElementById('gridPersonajes');
const btnUnirse = document.getElementById('btnUnirse');
const loginStatus = document.getElementById('loginStatus');

const turnoIndicador = document.getElementById('turnoIndicador');
const panelJugadores = document.getElementById('panelJugadores');
const fichasCapa = document.getElementById('fichasCapa');
const btnTirarDado = document.getElementById('btnTirarDado');
const btnPasarTurno = document.getElementById('btnPasarTurno');
const dado3d = document.getElementById('dado3d');
const manoCartas = document.getElementById('manoCartas');
const logWrap = document.getElementById('logWrap');
const toastCapa = document.getElementById('toastCapa');

const CARA_POR_VALOR = { 1: 'rotateX(0deg) rotateY(0deg)', 2: 'rotateY(180deg)', 3: 'rotateY(-90deg)', 4: 'rotateY(90deg)', 5: 'rotateX(-90deg)', 6: 'rotateX(90deg)' };

function mostrarToast(texto) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  toastCapa.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- Login ----------
gridPersonajes.addEventListener('click', (e) => {
  const btn = e.target.closest('.personaje-btn');
  if (!btn) return;
  [...gridPersonajes.children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  miPersonaje = btn.dataset.p;
  actualizarBotonUnirse();
});
inputNombre.addEventListener('input', actualizarBotonUnirse);
function actualizarBotonUnirse() {
  btnUnirse.disabled = !(inputNombre.value.trim().length > 0 && miPersonaje);
}

btnUnirse.addEventListener('click', () => {
  const nombre = inputNombre.value.trim();
  miId = 'p_' + nombre.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Math.floor(Math.random() * 1000);
  conectar(() => {
    ws.send(JSON.stringify({ type: 'unirse', playerId: miId, nombre, personaje: miPersonaje }));
  });
});

function conectar(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener('open', () => { loginStatus.textContent = ''; onOpen(); });
  ws.addEventListener('close', () => { loginStatus.textContent = 'Se perdió la conexión con el servidor.'; });
  ws.addEventListener('error', () => { loginStatus.textContent = 'No se pudo conectar al servidor.'; });
  ws.addEventListener('message', (ev) => manejarMensaje(JSON.parse(ev.data)));
}

// ---------- Mensajes del servidor ----------
function manejarMensaje(msg) {
  if (msg.type === 'error') {
    console.warn('[servidor]', msg.motivo);
    if (pantallaLogin.style.display !== 'none') loginStatus.textContent = msg.motivo;
    return;
  }
  if (msg.type === 'estado') {
    if (pantallaLogin.style.display !== 'none') {
      pantallaLogin.style.display = 'none';
      pantallaJuego.style.display = 'flex';
      cargarCoordenadas();
    }
    ultimoEstado = msg;
    render(msg);
    (msg.eventos || []).forEach(procesarEvento);
    return;
  }
  if (msg.type === 'mano') {
    if (retrasarProximaMano) {
      retrasarProximaMano = false;
      setTimeout(() => renderMano(msg.cartas), 680);
    } else {
      renderMano(msg.cartas);
    }
    return;
  }
  if (msg.type === 'combateResultado') {
    mostrarResultadoCombate(msg.correcto);
    return;
  }
  if (msg.type === 'combateNoEvaluable') {
    // Las 2 cartas de respuesta genuinamente abierta (p.ej. un palíndromo
    // cualquiera) no tienen una única respuesta que el servidor pueda
    // comparar por texto — se le pregunta directamente al jugador, igual
    // que se validaría en la mesa física.
    const acerto = confirm(msg.motivo + '\n\n¿Tu respuesta fue correcta?');
    mostrarResultadoCombate(acerto);
    return;
  }
}

async function cargarCoordenadas() {
  if (coords) return;
  const r = await fetch('/img/coordenadas.json');
  coords = await r.json();
}

// ---------- Render del estado ----------
function render(estado) {
  turnoIndicador.innerHTML = estado.turnoDe
    ? `Turno de: <b>${nombrePorId(estado, estado.turnoDe)}</b>`
    : '—';

  panelJugadores.innerHTML = '';
  estado.jugadores.forEach((j) => {
    const chip = document.createElement('div');
    chip.className = 'jugador-chip' + (j.id === estado.turnoDe ? ' mi-turno' : '') + (j.atrapado ? ' atrapado' : '');
    chip.innerHTML = `
      <span class="emoji">${EMOJI[j.personaje] || '🎭'}</span>
      <span>${j.nombre}${j.id === miId ? ' (tú)' : ''}</span>
      <span class="vidas">♥${j.vidas}</span>
      <span class="casilla">#${j.enBatallaFinal ? '53' : j.casilla}</span>
    `;
    panelJugadores.appendChild(chip);
  });

  renderFichas(estado);

  const esMiTurno = estado.turnoDe === miId;
  const yo = estado.jugadores.find((j) => j.id === miId);
  const combateActivoMio = yo && yo.combateActivo;
  btnTirarDado.disabled = !esMiTurno || !!combateActivoMio;
  btnPasarTurno.disabled = !esMiTurno;

  logWrap.innerHTML = (estado.log || []).map((l) => `<div>${l}</div>`).join('');
  logWrap.scrollTop = logWrap.scrollHeight;

  if (combateActivoMio && !document.getElementById('modalCombate').dataset.abiertoPara) {
    abrirModalCombate(yo.combateActivo);
  }
}

function nombrePorId(estado, id) {
  const j = estado.jugadores.find((x) => x.id === id);
  return j ? j.nombre : id;
}

function renderFichas(estado) {
  if (!coords) return;
  estado.jugadores.forEach((j) => {
    const anterior = posicionesAnteriores[j.id];
    const el = asegurarFichaEl(j);
    el.title = j.nombre;
    el.style.background = j.lado === 'azul' ? 'rgba(40,80,150,0.9)' : 'rgba(150,45,40,0.9)';

    const destino = j.enBatallaFinal ? coords.batalla_final : (coords[j.lado] || []).find((c) => c.casilla === j.casilla);
    if (!destino) return;

    const huboMovimientoNormal = anterior && !anterior.enBatallaFinal && !j.enBatallaFinal &&
      anterior.lado === j.lado && anterior.casilla !== j.casilla && Math.abs(anterior.casilla - j.casilla) <= 15;

    if (huboMovimientoNormal) {
      caminarFicha(el, j.lado, anterior.casilla, j.casilla);
    } else {
      el.style.left = (destino.x * 100) + '%';
      el.style.top = (destino.y * 100) + '%';
    }

    posicionesAnteriores[j.id] = { lado: j.lado, casilla: j.casilla, enBatallaFinal: j.enBatallaFinal };
  });

  // limpia fichas de jugadores que ya no están (por si acaso)
  const idsActuales = new Set(estado.jugadores.map((j) => j.id));
  for (const [id, el] of fichaEls.entries()) {
    if (!idsActuales.has(id)) { el.remove(); fichaEls.delete(id); delete posicionesAnteriores[id]; }
  }
}

function asegurarFichaEl(j) {
  let el = fichaEls.get(j.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'ficha';
    el.textContent = EMOJI[j.personaje] || '';
    fichasCapa.appendChild(el);
    fichaEls.set(j.id, el);
  }
  return el;
}

/** Anima la ficha paso a paso por cada casilla intermedia, en vez de deslizarse en línea recta sobre el arte. */
function caminarFicha(el, lado, desde, hasta) {
  const lista = coords[lado] || [];
  const paso = desde < hasta ? 1 : -1;
  const secuencia = [];
  for (let n = desde + paso; ; n += paso) {
    const pt = lista.find((c) => c.casilla === n);
    if (pt) secuencia.push(pt);
    if (n === hasta) break;
  }
  if (secuencia.length === 0) return;

  el.classList.add('caminando');
  let i = 0;
  function siguientePaso() {
    if (i >= secuencia.length) { el.classList.remove('caminando'); return; }
    const pt = secuencia[i++];
    el.style.left = (pt.x * 100) + '%';
    el.style.top = (pt.y * 100) + '%';
    setTimeout(siguientePaso, 230);
  }
  siguientePaso();
}

function renderMano(cartas) {
  manoCartas.innerHTML = '';
  cartas.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'carta-mano';
    div.innerHTML = `<img src="/cartas/poder/poder_${c.id}.jpg" alt="${c.nombre}">`;
    div.title = c.nombre;
    div.addEventListener('click', () => jugarCartaDesdeManoUI(c));
    manoCartas.appendChild(div);
  });
}

// ---------- Acciones del jugador ----------
btnTirarDado.addEventListener('click', () => {
  ws.send(JSON.stringify({ type: 'tirarDado' }));
  btnTirarDado.disabled = true;
});
btnPasarTurno.addEventListener('click', () => {
  ws.send(JSON.stringify({ type: 'pasarTurno' }));
});

function jugarCartaDesdeManoUI(carta) {
  if (CARTAS_QUE_PIDEN_OBJETIVO.has(carta.id)) {
    abrirSelectorObjetivo(carta);
    return;
  }
  if (!confirm(`¿Jugar "${carta.nombre}"?`)) return;
  ws.send(JSON.stringify({ type: 'jugarCartaPoder', cartaId: carta.id }));
}

// ---------- Selector de objetivo ----------
const modalObjetivo = document.getElementById('modalObjetivo');
const objetivoTitulo = document.getElementById('objetivoTitulo');
const objetivoLista = document.getElementById('objetivoLista');
const btnCancelarObjetivo = document.getElementById('btnCancelarObjetivo');

function abrirSelectorObjetivo(carta) {
  objetivoTitulo.textContent = `"${carta.nombre}" — ¿A quién afecta?`;
  objetivoLista.innerHTML = '';
  const otros = (ultimoEstado ? ultimoEstado.jugadores : []).filter((j) => j.id !== miId);
  if (otros.length === 0) {
    objetivoLista.innerHTML = '<div style="font-family:Verdana,sans-serif;font-size:12px;color:#9a92a0;">No hay otros jugadores todavía.</div>';
  }
  otros.forEach((j) => {
    const btn = document.createElement('button');
    btn.className = 'objetivo-btn';
    btn.innerHTML = `<span class="emoji">${EMOJI[j.personaje] || '🎭'}</span><span>${j.nombre} — casilla ${j.enBatallaFinal ? '53' : j.casilla}, ♥${j.vidas}</span>`;
    btn.addEventListener('click', () => {
      modalObjetivo.style.display = 'none';
      ws.send(JSON.stringify({ type: 'jugarCartaPoder', cartaId: carta.id, opciones: { targetId: j.id } }));
    });
    objetivoLista.appendChild(btn);
  });
  modalObjetivo.style.display = 'flex';
}
btnCancelarObjetivo.addEventListener('click', () => { modalObjetivo.style.display = 'none'; });

// ---------- Eventos → animaciones ----------
function procesarEvento(ev) {
  if (ev.tipo === 'dadoTirado') {
    animarDado(ev.valor, ev.playerId === miId);
  }
  if (ev.tipo === 'cartaRevelada') {
    if (ev.playerId === miId) {
      abrirModalCartaSimple(ev.mazo, ev.cartaId, ev.cartaNombre, ev.playerId);
    } else {
      // Antes esto también abría el modal en TODAS las pantallas — se
      // sentía invasivo y "torpe" cuando le pasaba a otro jugador. Ahora
      // solo un aviso breve, sin interrumpir tu pantalla.
      const nombre = ultimoEstado ? nombrePorId(ultimoEstado, ev.playerId) : '';
      const etiqueta = { trampa: 'Trampa', portal: 'Portal' }[ev.mazo] || ev.mazo;
      mostrarToast(`${nombre} cayó en ${etiqueta}: "${ev.cartaNombre}"`);
    }
  }
  if (ev.tipo === 'cartaAManoDePoder') {
    if (ev.playerId === miId) {
      retrasarProximaMano = true;
      volarCartaAMano();
    } else {
      const nombre = ultimoEstado ? nombrePorId(ultimoEstado, ev.playerId) : '';
      mostrarToast(`${nombre} robó una carta de Poder`);
    }
  }
  if (ev.tipo === 'combateIniciado' && ev.playerId !== miId) {
    const nombre = ultimoEstado ? nombrePorId(ultimoEstado, ev.playerId) : '';
    mostrarToast(`${nombre} entra en Combate: "${ev.cartaNombre}"`);
  }
}

/** Anima una carta (boca abajo) volando desde el centro del tablero hasta tu mano. */
function volarCartaAMano() {
  const boardRect = document.getElementById('boardWrap').getBoundingClientRect();
  const manoRect = manoCartas.getBoundingClientRect();

  const vol = document.createElement('div');
  vol.className = 'carta-volando';
  vol.innerHTML = '<img src="/cartas/poder/reverso_rojo.jpg">';
  const anchoInicial = 46, altoInicial = 66;
  vol.style.width = anchoInicial + 'px';
  vol.style.height = altoInicial + 'px';
  vol.style.left = (boardRect.left + boardRect.width / 2 - anchoInicial / 2) + 'px';
  vol.style.top = (boardRect.top + boardRect.height / 2 - altoInicial / 2) + 'px';
  document.body.appendChild(vol);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const destinoX = manoRect.left + Math.min(40, manoRect.width / 2);
      const destinoY = manoRect.top + manoRect.height / 2;
      vol.style.left = destinoX + 'px';
      vol.style.top = destinoY + 'px';
      vol.style.width = '20px';
      vol.style.height = '28px';
      vol.style.transform = 'rotate(15deg)';
    });
  });

  setTimeout(() => vol.remove(), 700);
}

function animarDado(valor, esMio) {
  dado3d.classList.remove('rodando');
  void dado3d.offsetWidth; // fuerza reflow para poder re-disparar la animación
  dado3d.classList.add('rodando');
  setTimeout(() => {
    dado3d.classList.remove('rodando');
    dado3d.style.transform = CARA_POR_VALOR[valor];
    if (esMio) btnTirarDado.disabled = true; // se re-habilita cuando vuelva a ser tu turno, vía render()
  }, 900);
}

// ---------- Modal Trampa/Portal/Poder (auto-resuelto) ----------
const modalCarta = document.getElementById('modalCarta');
const cardTrampaPortal = document.getElementById('cardTrampaPortal');
const imgCartaReverso = document.getElementById('imgCartaReverso');
const imgCartaFrente = document.getElementById('imgCartaFrente');
const tapHintCarta = document.getElementById('tapHintCarta');
const effectBanner = document.getElementById('effectBanner');
const btnContinuarCarta = document.getElementById('btnContinuarCarta');

function abrirModalCartaSimple(mazo, cartaId, cartaNombre, playerId) {
  cardTrampaPortal.classList.remove('flipped');
  effectBanner.classList.remove('show');
  btnContinuarCarta.style.display = 'none';
  tapHintCarta.style.display = 'block';
  imgCartaReverso.src = `/cartas/${mazo}/reverso${mazo === 'portal' ? '_rojo' : ''}.jpg`;
  imgCartaFrente.src = `/cartas/${mazo}/${mazo}_${cartaId}.jpg`;
  modalCarta.style.display = 'flex';

  const nombreJugador = ultimoEstado ? nombrePorId(ultimoEstado, playerId) : '';
  cardTrampaPortal.onclick = () => {
    if (cardTrampaPortal.classList.contains('flipped')) return;
    cardTrampaPortal.classList.add('flipped');
    tapHintCarta.style.display = 'none';
    setTimeout(() => {
      effectBanner.textContent = `${nombreJugador} — "${cartaNombre}"`;
      effectBanner.classList.add('show');
      btnContinuarCarta.style.display = 'inline-block';
    }, 500);
  };
  btnContinuarCarta.onclick = () => { modalCarta.style.display = 'none'; };
}

// ---------- Modal Combate ----------
const modalCombate = document.getElementById('modalCombate');
const cardCombate = document.getElementById('cardCombate');
const imgCombateFrente = document.getElementById('imgCombateFrente');
const tapHintCombate = document.getElementById('tapHintCombate');
const timerWrap = document.getElementById('timerWrap');
const timerBar = document.getElementById('timerBar');
const timerNum = document.getElementById('timerNum');
const answerWrap = document.getElementById('answerWrap');
const answerInput = document.getElementById('answerInput');
const btnResponder = document.getElementById('btnResponder');
const resultBanner = document.getElementById('resultBanner');
const sceneRespuesta = document.getElementById('sceneRespuesta');
const cardRespuesta = document.getElementById('cardRespuesta');
const imgRespuestaFrente = document.getElementById('imgRespuestaFrente');
const tapHintRespuesta = document.getElementById('tapHintRespuesta');
const optionsWrapCombate = document.getElementById('optionsWrapCombate');
const optTitleCombate = document.getElementById('optTitleCombate');
const optACombate = document.getElementById('optACombate');
const optBCombate = document.getElementById('optBCombate');

let timerInterval = null;
let combateGano = null;

function abrirModalCombate(combate) {
  modalCombate.dataset.abiertoPara = combate.cartaId;
  cardCombate.classList.remove('flipped');
  imgCombateFrente.src = `/cartas/combate/combate_${combate.cartaId}.jpg`;
  tapHintCombate.style.display = 'block';
  timerWrap.classList.remove('show');
  answerWrap.classList.remove('show');
  resultBanner.classList.remove('show');
  sceneRespuesta.style.display = 'none';
  cardRespuesta.classList.remove('flipped');
  tapHintRespuesta.style.display = 'none';
  optionsWrapCombate.classList.remove('show');
  modalCombate.style.display = 'flex';

  cardCombate.onclick = () => {
    if (cardCombate.classList.contains('flipped')) return;
    cardCombate.classList.add('flipped');
    tapHintCombate.style.display = 'none';
    setTimeout(() => iniciarTemporizador(combate), 500);
  };

  imgRespuestaFrente.src = `/cartas/respuesta/respuesta_${combate.cartaId}.jpg`;
}

function iniciarTemporizador(combate) {
  timerWrap.classList.add('show');
  answerWrap.classList.add('show');
  answerInput.value = '';
  answerInput.focus();
  let restante = combate.tiempoSegundos;
  actualizarTimerUI(restante, combate.tiempoSegundos);
  timerInterval = setInterval(() => {
    restante--;
    actualizarTimerUI(restante, combate.tiempoSegundos);
    if (restante <= 0) { clearInterval(timerInterval); finalizarRespuesta(); }
  }, 1000);
}
function actualizarTimerUI(restante, total) {
  timerNum.textContent = restante + 's';
  const pct = (restante / total) * 100;
  timerBar.style.width = pct + '%';
  timerBar.classList.toggle('warn', restante <= 10);
}

btnResponder.addEventListener('click', () => { clearInterval(timerInterval); enviarRespuestaAlServidor(); });
answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearInterval(timerInterval); enviarRespuestaAlServidor(); } });

function enviarRespuestaAlServidor() {
  timerWrap.classList.remove('show');
  answerWrap.classList.remove('show');
  ws.send(JSON.stringify({ type: 'responderCombate', texto: answerInput.value }));
}

function mostrarResultadoCombate(correcto) {
  combateGano = correcto;
  resultBanner.textContent = correcto ? '✓ ¡Correcto!' : '✗ Incorrecto';
  resultBanner.className = 'result-banner show ' + (correcto ? 'win' : 'lose');
  sceneRespuesta.style.display = 'block';
  tapHintRespuesta.style.display = 'block';
}

cardRespuesta.addEventListener('click', () => {
  if (cardRespuesta.classList.contains('flipped')) return;
  cardRespuesta.classList.add('flipped');
  tapHintRespuesta.style.display = 'none';
  setTimeout(() => {
    optTitleCombate.textContent = combateGano ? 'Elige tu recompensa' : 'Elige tu castigo';
    optionsWrapCombate.classList.add('show');
  }, 500);
});

function elegirOpcionCombate(opcion) {
  ws.send(JSON.stringify({ type: 'resolverCombate', gano: combateGano, opcion }));
  modalCombate.style.display = 'none';
  delete modalCombate.dataset.abiertoPara;
}
optACombate.addEventListener('click', () => elegirOpcionCombate('A'));
optBCombate.addEventListener('click', () => elegirOpcionCombate('B'));
