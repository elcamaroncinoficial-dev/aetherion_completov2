'use strict';
/**
 * Simula a dos jugadores conectados desde dispositivos distintos: dos
 * clientes WebSocket independientes (usando el WebSocket nativo de
 * Node) hablándole al mismo servidor. Cada uno imprime lo que RECIBE
 * del servidor en tiempo real — así se ve que cuando Ana tira el dado,
 * Bruno se entera al instante sin haber hecho nada, tal como pasaría
 * en dos celulares distintos.
 */
const PUERTO = process.argv[2] ? parseInt(process.argv[2], 10) : 8787;
const URL = `ws://localhost:${PUERTO}`;

function conectar(nombreLog) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === 'estado') {
        const turno = data.jugadores.find((j) => j.id === data.turnoDe);
        console.log(`  [${nombreLog} recibe] → turno de: ${turno ? turno.nombre : '—'} | ` +
          data.jugadores.map((j) => `${j.nombre}: casilla ${j.casilla}, ${j.vidas}♥`).join(' · '));
      } else if (data.type === 'error') {
        console.log(`  [${nombreLog} recibe] ⚠ ERROR: ${data.motivo}`);
      }
    });
  });
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log(`=== Conectando 2 clientes reales a ${URL} ===\n`);

  const anaWs = await conectar('Ana  ');
  const brunoWs = await conectar('Bruno');
  console.log('Ambos clientes conectados.\n');

  console.log('> Ana se une a la partida...');
  anaWs.send(JSON.stringify({ type: 'unirse', playerId: 'ana', nombre: 'Ana', personaje: 'mago' }));
  await esperar(200);

  console.log('\n> Bruno se une a la partida...');
  brunoWs.send(JSON.stringify({ type: 'unirse', playerId: 'bruno', nombre: 'Bruno', personaje: 'hijoDragon' }));
  await esperar(200);

  console.log('\n> Ana tira el dado (es su turno)...');
  anaWs.send(JSON.stringify({ type: 'tirarDado' }));
  await esperar(200);

  console.log('\n> Bruno intenta tirar el dado FUERA de su turno (debe fallar)...');
  brunoWs.send(JSON.stringify({ type: 'tirarDado' }));
  await esperar(200);

  console.log('\n> Ana pasa el turno...');
  anaWs.send(JSON.stringify({ type: 'pasarTurno' }));
  await esperar(200);

  console.log('\n> Ahora sí, Bruno tira el dado en su turno...');
  brunoWs.send(JSON.stringify({ type: 'tirarDado' }));
  await esperar(300);

  console.log('\n=== Demo terminada — cerrando clientes ===');
  anaWs.close();
  brunoWs.close();
  process.exit(0);
}

main();
