#!/usr/bin/env node
'use strict';

const express = require('express');
const cors = require('cors');

const DEFAULT_PORT = 3000;
const DIFFICULTIES = ['facil', 'medio', 'dificil'];

function readArg(name, argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === `--${name}`) return argv[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Puerto inválido: "${value}". Usá un número entre 1 y 65535.`);
  }
  return port;
}

// Prioridad: argumento > variable de entorno > valor por defecto
function loadConfig(env = process.env, argv = process.argv.slice(2)) {
  const port = parsePort(readArg('port', argv) ?? env.PORT ?? DEFAULT_PORT);

  const defaultDifficulty = String(readArg('difficulty', argv) ?? env.BOT_DIFFICULTY ?? 'medio').toLowerCase();
  if (!DIFFICULTIES.includes(defaultDifficulty)) {
    throw new Error(`Dificultad inválida: "${defaultDifficulty}". Opciones: ${DIFFICULTIES.join(', ')}.`);
  }

  return { port, defaultDifficulty, env: env.NODE_ENV || 'development' };
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

function write(stream, level, message) {
  if (process.env.NODE_ENV === 'test') return;
  stream(`[${new Date().toISOString()}] ${level} ${message}`);
}

const logger = {
  info: (message) => write(console.log, 'INFO ', message),
  warn: (message) => write(console.warn, 'WARN ', message),
  error: (message) => write(console.error, 'ERROR', message)
};

// Orden fijo: hace que los desempates siempre den lo mismo
const DIRECTIONS = ['north', 'south', 'east', 'west'];

const DELTAS = {
  north: { row: -1, col: 0 },
  south: { row: 1, col: 0 },
  east: { row: 0, col: 1 },
  west: { row: 0, col: -1 }
};

function mod(n, m) {
  return ((n % m) + m) % m;
}

// Con wrap los bordes se conectan; sin wrap devuelve null si se sale del tablero
function step(position, direction, steps, board) {
  const delta = DELTAS[direction];
  let row = position.row + delta.row * steps;
  let col = position.col + delta.col * steps;

  if (board.wrap) {
    row = mod(row, board.rows);
    col = mod(col, board.cols);
  } else if (row < 0 || row >= board.rows || col < 0 || col >= board.cols) {
    return null;
  }

  return { row, col };
}

function distance(a, b, board) {
  let dRow = Math.abs(a.row - b.row);
  let dCol = Math.abs(a.col - b.col);

  if (board.wrap) {
    dRow = Math.min(dRow, board.rows - dRow);
    dCol = Math.min(dCol, board.cols - dCol);
  }

  return dRow + dCol;
}

// Solo fichas del jugador con turno y canMove; no pueden caer sobre otra ficha
function getLegalMoves(state) {
  const { board, dice, currentPlayer, pieces } = state;
  const occupied = new Set(pieces.map((p) => `${p.row},${p.col}`));
  const moves = [];

  for (const piece of pieces) {
    if (piece.player !== currentPlayer || !piece.canMove) continue;

    for (const direction of DIRECTIONS) {
      const to = step(piece, direction, dice, board);
      if (!to) continue;
      if (occupied.has(`${to.row},${to.col}`)) continue;

      moves.push({ pieceId: piece.id, direction, to });
    }
  }

  return moves;
}

const MAX_DICE = 3;
const CONQUEST_BONUS = 1000;

function isHouse(position, state) {
  return state.houses.some((h) => h.row === position.row && h.col === position.col);
}

function nearestHouseDistance(position, state) {
  if (state.houses.length === 0) return 0;
  return Math.min(...state.houses.map((h) => distance(position, h, state.board)));
}

function reachableHouses(position, state) {
  const reached = new Set();

  for (let dice = 1; dice <= MAX_DICE; dice++) {
    for (const direction of DIRECTIONS) {
      const to = step(position, direction, dice, state.board);
      if (to && isHouse(to, state)) reached.add(`${to.row},${to.col}`);
    }
  }

  return reached.size;
}

// Parece azar, pero es determinista: el mismo estado da siempre el mismo número
function stateIndex(state, n) {
  const text = JSON.stringify([
    state.currentPlayer,
    state.dice,
    state.pieces.map((p) => [p.id, p.row, p.col, p.canMove]),
    state.houses.map((h) => [h.row, h.col])
  ]);

  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash % n;
}

// Gana el puntaje más alto. Medio conquista o se acerca a la casa más cercana;
// difícil además prefiere quedar al alcance de una casa en el próximo turno
const SCORERS = {
  medio: (move, state) => {
    if (isHouse(move.to, state)) return CONQUEST_BONUS;
    return -nearestHouseDistance(move.to, state);
  },

  dificil: (move, state) => {
    if (isHouse(move.to, state)) return CONQUEST_BONUS;
    return reachableHouses(move.to, state) * 10 - nearestHouseDistance(move.to, state);
  }
};

// Devuelve null si no hay movimientos legales
function chooseMove(state, difficulty = 'medio') {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;

  if (difficulty === 'facil') {
    const move = legalMoves[stateIndex(state, legalMoves.length)];
    return { pieceId: move.pieceId, direction: move.direction };
  }

  const score = SCORERS[difficulty] || SCORERS.medio;

  let best = legalMoves[0];
  let bestScore = score(best, state);

  for (const move of legalMoves.slice(1)) {
    const moveScore = score(move, state);
    if (moveScore > bestScore) {
      best = move;
      bestScore = moveScore;
    }
  }

  return { pieceId: best.pieceId, direction: best.direction };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = (value) => Number.isInteger(value);

// Valida el JSON del juego y lo devuelve normalizado; si algo está mal lanza un 400 con la lista en "details"
function validateState(body) {
  const problems = [];

  if (!isObject(body)) {
    throw new HttpError(400, 'El cuerpo de la solicitud tiene que ser un objeto JSON con el estado del juego.');
  }

  const board = body.board;
  let rows;
  let cols;
  let wrap = true;

  if (!isObject(board)) {
    problems.push('"board" es obligatorio y tiene que ser un objeto: { rows, cols, wrap }.');
  } else {
    if (!isInt(board.rows) || board.rows < 1) problems.push('"board.rows" tiene que ser un entero mayor a 0.');
    else rows = board.rows;

    if (!isInt(board.cols) || board.cols < 1) problems.push('"board.cols" tiene que ser un entero mayor a 0.');
    else cols = board.cols;

    if (board.wrap !== undefined) {
      if (typeof board.wrap !== 'boolean') problems.push('"board.wrap" tiene que ser true o false.');
      else wrap = board.wrap;
    }
  }

  if (!isInt(body.dice) || body.dice < 1) problems.push('"dice" tiene que ser un entero mayor a 0.');
  if (!isInt(body.currentPlayer) || body.currentPlayer < 1) problems.push('"currentPlayer" tiene que ser un entero mayor a 0.');

  let difficulty;
  if (body.difficulty !== undefined && body.difficulty !== null) {
    difficulty = String(body.difficulty).toLowerCase();
    if (!DIFFICULTIES.includes(difficulty)) {
      problems.push(`"difficulty" tiene que ser una de estas: ${DIFFICULTIES.join(', ')}.`);
      difficulty = undefined;
    }
  }

  const insideBoard = (item) =>
    rows === undefined || cols === undefined ||
    (item.row >= 0 && item.row < rows && item.col >= 0 && item.col < cols);

  const pieces = [];
  if (!Array.isArray(body.pieces) || body.pieces.length === 0) {
    problems.push('"pieces" tiene que ser una lista con al menos una ficha.');
  } else {
    const ids = new Set();
    const cells = new Set();

    body.pieces.forEach((piece, i) => {
      const where = `pieces[${i}]`;
      if (!isObject(piece)) {
        problems.push(`${where} tiene que ser un objeto.`);
        return;
      }

      const validId = (typeof piece.id === 'string' && piece.id !== '') || isInt(piece.id);
      if (!validId) problems.push(`${where}.id tiene que ser un texto o un número.`);
      if (!isInt(piece.player) || piece.player < 1) problems.push(`${where}.player tiene que ser un entero mayor a 0.`);
      if (!isInt(piece.row) || !isInt(piece.col)) {
        problems.push(`${where}.row y ${where}.col tienen que ser enteros.`);
      } else if (!insideBoard(piece)) {
        problems.push(`${where} está fuera del tablero (row ${piece.row}, col ${piece.col}).`);
      }
      if (piece.canMove !== undefined && typeof piece.canMove !== 'boolean') {
        problems.push(`${where}.canMove tiene que ser true o false.`);
      }

      if (validId) {
        if (ids.has(piece.id)) problems.push(`${where}.id "${piece.id}" está repetido.`);
        ids.add(piece.id);
      }
      if (isInt(piece.row) && isInt(piece.col)) {
        const cell = `${piece.row},${piece.col}`;
        if (cells.has(cell)) problems.push(`${where}: ya hay otra ficha en la casilla (${piece.row}, ${piece.col}).`);
        cells.add(cell);
      }

      pieces.push({
        id: piece.id,
        player: piece.player,
        row: piece.row,
        col: piece.col,
        canMove: piece.canMove === undefined ? true : piece.canMove
      });
    });
  }

  const houses = [];
  if (!Array.isArray(body.houses)) {
    problems.push('"houses" tiene que ser una lista (puede estar vacía).');
  } else {
    body.houses.forEach((house, i) => {
      const where = `houses[${i}]`;
      if (!isObject(house) || !isInt(house.row) || !isInt(house.col)) {
        problems.push(`${where} tiene que ser un objeto con row y col enteros.`);
        return;
      }
      if (!insideBoard(house)) {
        problems.push(`${where} está fuera del tablero (row ${house.row}, col ${house.col}).`);
        return;
      }
      houses.push({ row: house.row, col: house.col });
    });
  }

  if (problems.length > 0) {
    throw new HttpError(400, 'El estado del juego no es válido.', problems);
  }

  return {
    board: { rows, cols, wrap },
    dice: body.dice,
    currentPlayer: body.currentPlayer,
    pieces,
    houses,
    difficulty
  };
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)} ms)`);
  });

  next();
}

function notFound(req, res, next) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// Express exige los 4 parámetros para reconocerlo como manejador de errores
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    logger.warn(`${req.method} ${req.originalUrl} -> ${err.status}: ${err.message}`);
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  if (err && err.type === 'entity.parse.failed') {
    logger.warn(`${req.method} ${req.originalUrl} -> 400: JSON inválido`);
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es un JSON válido.' });
  }
  if (err && err.type === 'entity.too.large') {
    logger.warn(`${req.method} ${req.originalUrl} -> 413: cuerpo demasiado grande`);
    return res.status(413).json({ error: 'El cuerpo de la solicitud es demasiado grande.' });
  }

  logger.error(`${req.method} ${req.originalUrl} -> 500: ${err && err.stack ? err.stack : err}`);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

function createRouter({ defaultDifficulty }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  router.post('/move', (req, res) => {
    if (!req.is('application/json')) {
      throw new HttpError(400, 'El Content-Type tiene que ser application/json.');
    }

    const state = validateState(req.body);
    const move = chooseMove(state, state.difficulty || defaultDifficulty);

    if (!move) {
      throw new HttpError(400, 'No hay movimientos legales para este estado.');
    }

    res.status(200).json(move);
  });

  return router;
}

function createApp(config) {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.use(createRouter(config));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

function start() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const app = createApp(config);

  const server = app.listen(config.port, () => {
    logger.info(`Bot listo en http://localhost:${config.port}`);
    logger.info(`Dificultad por defecto: ${config.defaultDifficulty} | Rutas: GET /health, POST /move`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`El puerto ${config.port} ya está en uso. Probá con otro: node bot.js --port 4000`);
    } else {
      logger.error(error.message);
    }
    process.exit(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      logger.info(`Recibí ${signal}, cerrando el servidor...`);
      server.close(() => process.exit(0));
    });
  }
}

// Arranca solo con "node bot.js"; si lo importás desde otro archivo, no
if (require.main === module) start();

module.exports = { createApp, chooseMove, getLegalMoves, validateState, loadConfig };