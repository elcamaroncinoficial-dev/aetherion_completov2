'use strict';
/**
 * Mazo genérico: cubre la regla común a todos los mazos del reglamento:
 * "Los mazos nunca se mezclan entre sí. Si un mazo se termina, se
 * barajan sus descartes y se forma uno nuevo."
 */
class Deck {
  constructor(cartas) {
    this.original = cartas; // referencia inmutable al catálogo completo
    this.mazo = shuffle([...cartas]);
    this.descarte = [];
  }

  robar() {
    if (this.mazo.length === 0) {
      if (this.descarte.length === 0) {
        throw new Error('Mazo y descarte vacíos: no hay cartas para robar.');
      }
      this.mazo = shuffle(this.descarte);
      this.descarte = [];
    }
    const carta = this.mazo.pop();
    this.descarte.push(carta);
    return carta;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { Deck, shuffle };
