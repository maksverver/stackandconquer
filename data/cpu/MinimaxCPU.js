/**
 * \file MinimaxCPU.js
 *
 * \section LICENSE
 *
 * Copyright (C) 2024 Maks Verver
 *
 * This file is part of StackAndConquer.
 *
 * StackAndConquer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * StackAndConquer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with StackAndConquer.  If not, see <https://www.gnu.org/licenses/>.
 *
 * \section DESCRIPTION
 *
 * CPU opponent using a Minimax algorithm.
 *
 * Following function can be used to access data from game:
 *   game.getID();
 *   game.getNumOfPlayers();
 *   game.getHeightToWin();
 *   game.getBoardDimensionX();
 *   game.getBoardDimensionY();
 *   game.getOutside();
 *   game.getPadding();
 *
 * Remark: Qt <= 5.11 supports only ECMAScript 5, so
 * ES5 should be chosen for compatibility reasons!
 */

'use strict';

var log = (typeof game === 'object' && game.log) || console.log;

// These variables define the configuration of the board. The current version of
// the AI only supports 2 players and the standard 5x5 board configuration.
//
// (I currently use a bitmask to represent occupied fields, which limits the
// maximum number of fields to 31!)
var ROWS = 5;
var COLS = 5;
var FIELD_COUNT = ROWS * COLS;
var WINNING_HEIGHT = 5;
var PIECES_PER_PLAYER = 20;

// Minimax search depth.
//
// Determines the strength of the AI: higher is better, but slower.
var SEARCH_DEPTH = 4;

// Data used to generate possible moves quickly.
//
// MOVE_TEMPLATES[dst][height] is an array of [src, mask] fields, where
// mask is a bitmask of fields between src and dst.
var MOVE_TEMPLATES = generateMoveTemplates();

// Move that represents passing (an empty array).
var PASS = Object.freeze([]);

function generateMoveTemplates() {
  var moves = [];
  var DR = [-1, -1, -1,  0,  0, +1, +1, +1];
  var DC = [-1,  0, +1, -1, +1, -1,  0, +1];
  for (var r2 = 0; r2 < ROWS; ++r2) {
    for (var c2 = 0; c2 < COLS; ++c2) {
      const dst = r2*COLS + c2;
      moves.push([]);
      for (var height = 0; height < WINNING_HEIGHT; ++height) {
        moves[dst].push([]);
      }
      for (var dir = 0; dir < 8; ++dir) {
        var dr = DR[dir], dc = DC[dir];
        var mask = 0;
        for (var height = 1; height < WINNING_HEIGHT; ++height) {
          var r1 = r2 - dr*height;
          var c1 = c2 - dc*height;
          if (r1 < 0 || r1 >= ROWS || c1 < 0 || c1 >= COLS) break;
          var src = r1*COLS + c1;
          moves[dst][height].push([src, mask]);
          mask |= 1 << src;
        }
      }
    }
  }
  return moves;
}

// Constructs a new state, possibly from an old state returned by toJson().
// Note that inputJson, if given, MUST be valid, or things will get weird!
function State(inputJson) {

  // Pieces on the board. For each field, we store an array of colors 0 and 1.
  var fields = inputJson ? inputJson.fields : [];

  // Next player to move. Either 0 or 1.
  var nextPlayer = inputJson ? inputJson.nextPlayer : 0;

  // Scores for each player. TODO later: support third player.
  var scores = inputJson ? inputJson.scores : [0, 0];

  // Last move played (to prevent reverting)
  var lastMove = inputJson ? inputJson.lastMove : null;

  // Bitmask of occupied fields.
  var occupied = 0;

  // Number of pieces per player.
  var piecesLeft = [PIECES_PER_PLAYER, PIECES_PER_PLAYER];

  if (!inputJson) {
    // Initialize empty fields.
    for (var i = 0; i < FIELD_COUNT; ++i) fields.push([]);
  } else {
    // Recompute `occupied` and `piecesLeft` from given fields.
    for (var i = 0; i < fields.length; ++i) {
      var height = fields[i].length;
      if (height > 0) {
        occupied |= 1 << i;
        for (var j = 0; j < height; ++j) --piecesLeft[fields[i][j]];
      }
    }
  }

  // Executes a move. Important: `move` must be valid!
  function doMove(move) {
    var removed = null;
    if (move.length !== 0) {
      var cnt = move[0];
      var src = move[1];
      var dst = move[2];
      var srcField = fields[src];
      var dstField = fields[dst];
      if (src === dst) {
        --piecesLeft[nextPlayer];
        dstField.push(nextPlayer);
        occupied ^= 1 << dst;
      } else {
        dstField.push.apply(dstField, srcField.splice(srcField.length - cnt));
        if (srcField.length === 0) {
          occupied ^= 1 << src;
        }
        if (dstField.length >= WINNING_HEIGHT) {
          removed = dstField.splice(0);
          var winner = removed[removed.length - 1];
          scores[winner] += 1;
          occupied ^= 1 << dst;
          for (var i = 0; i < removed.length; ++i) ++piecesLeft[removed[i]];
        }
      }
    }
    var undoState = [lastMove, removed];
    nextPlayer = 1 - nextPlayer;
    lastMove = move;
    return undoState;
  }

  // Undoes the last move.
  function undoMove(move, undoState) {
    nextPlayer = 1 - nextPlayer;
    lastMove = undoState[0];
    var removed = undoState[1];
    if (move.length !== 0) {
      var cnt = move[0];
      var src = move[1];
      var dst = move[2];
      var srcField = fields[src];
      var dstField = fields[dst];
      if (src === dst) {
        ++piecesLeft[nextPlayer];
        dstField.pop();
        occupied ^= 1 << dst;
      } else {
        if (removed != null) {
          for (var i = 0; i < removed.length; ++i) --piecesLeft[removed[i]];
          var winner = removed[removed.length - 1];
          scores[winner] -= 1;
          dstField.push.apply(dstField, removed);
          occupied ^= 1 << dst;
        }
        if (srcField.length === 0) {
          occupied ^= 1 << src;
        }
        srcField.push.apply(srcField, dstField.splice(dstField.length - cnt));
      }
    }
  }

  // Evaluates the state with respect to the next player.
  //
  // The current evaluation function is not highly optimized. It can probably
  // be optimized significantly.
  function evaluate() {
    var score = 10000 * (scores[nextPlayer] - scores[1 - nextPlayer]);
    for (var dst = 0; dst < fields.length; ++dst) {
      var dstField = fields[dst];
      var dstHeight = dstField.length;
      if (dstHeight > 0) {
        var options = MOVE_TEMPLATES[dst][dstHeight];
        for (var i = 0; i < options.length; ++i) {
          var src = options[i][0];
          var srcField = fields[src]
          var srcHeight = srcField.length;
          if (srcHeight + dstHeight >= WINNING_HEIGHT && (occupied & options[i][1]) === 0) {
            if (srcField[srcHeight - 1] === nextPlayer) {
              // Winning move found!
              score += 1000;
            } else {
              // Winning move for opponent (though I might still be able to prevent it).
              // Possible improvement: check if I have moves to prevent it.
              score -= 100;
            }
          }
        }
        // Reward piece on top of a tower.
        if (dstField[dstHeight - 1] === nextPlayer) {
          score += 10 * dstHeight;
        } else {
          score -= 10 * dstHeight;
        }
        // Reward pieces on the board.
        for (var i = 0; i < dstHeight; ++i) {
          if (dstField[i] === nextPlayer) {
            score += 1;
          } else {
            score -= 1;
          }
        }
      }
    }
    return score;
  }

  // Generates a list of all possible moves.
  //
  // A move is a triple [cnt, src, dst], or an empty array [] to pass.
  // If cnt == 1 and src == dst, a new piece is placed.
  //
  // Rules of the game: https://spielstein.com/games/mixtour/rules
  function generateMoves() {
    var moves = [];
    var lastCnt = 0, lastSrc = -1, lastDst = -1;
    if (lastMove != null && lastMove.length != 0) {
      lastCnt = lastMove[0];
      lastSrc = lastMove[1];
      lastDst = lastMove[2];
    }
    for (var dst = 0; dst < fields.length; ++dst) {
      var dstHeight = fields[dst].length;
      if (dstHeight === 0) {
        if (piecesLeft[nextPlayer]) {
          moves.push([1, dst, dst]);  // place new piece
        }
      } else {
        var options = MOVE_TEMPLATES[dst][dstHeight];
        for (var i = 0; i < options.length; ++i) {
          var src = options[i][0];
          var srcHeight = fields[src].length;
          if (srcHeight !== 0 && (occupied & options[i][1]) === 0) {
            for (var cnt = 1; cnt <= srcHeight; ++cnt) {
              // Do not allow undoing the last move.
              if (cnt === lastCnt && src == lastDst && dst == lastSrc) continue;
              moves.push([cnt, src, dst]);  // move pieces
            }
          }
        }
      }
    }
    if (moves.length === 0) moves.push(PASS);
    return moves;
  }

  // Logs the current state to standard output in a human-readable format.
  function debugPrint() {
    log('Scores: ' + scores);
    log('Pieces left: ' + piecesLeft);
    log('Player ' + (nextPlayer + 1) + ' to move.');
    for (var r = 0; r < ROWS; ++r) {
      var line = formatRow(r) + '  ';
      for (var c = 0; c < COLS; ++c) {
        var src = r*COLS + c;
        var part = '';
        if (fields[src].length === 0) {
          part = '.';
        } else {
          for (var i = 0; i < fields[src].length; ++i) {
            part += String(fields[src][i] + 1);
          }
        }
        while (part.length < WINNING_HEIGHT) part += ' ';
        line += ' ' + part;
        if (((occupied & (1 << src)) !== 0) != (fields[src].length !== 0)) {
          log('INTERNAL ERROR: occupied does not match fields at ' + src);
        }
      }
      log(line);
    }
    var line = '   ';
    for (var c = 0; c < COLS; ++c) {
      var part = formatCol(c);
      while (part.length < WINNING_HEIGHT) part += ' ';
      line += ' ' + part;
    }
    log(line);
    log('last move: ' + (lastMove ? formatMove(lastMove) : 'none'));
    var moves = generateMoves();
    log(moves.length + ' possible moves: ' + formatMoves(moves));
  }

  // Returns the state as a JSON-serializable object. This does not do a deep
  // clone, so it's invalidated when the state changes! To prevent this, the
  // caller should serialize the object to a string.
  function toJson() {
    return {fields: fields, nextPlayer: nextPlayer, scores: scores, lastMove: lastMove};
  }

  return {
    generateMoves: generateMoves,
    doMove: doMove,
    undoMove: undoMove,
    evaluate: evaluate,
    debugPrint: debugPrint,
    toJson: toJson,
  };
}

// Finds the best move among the given `moves`, using a Minimax search algorithm
// (actually Negamax, to be technical) with alpha-beta pruning.
//
// Opportunities for optimization:
//
//  - move ordering by shallow search
//  - instead of calling generateMoves(), generate moves incrementally, to
//    avoid wasting work when a beta-cutoff happens.
//  - add a transposition table?
//
function findBestMoves(state, moves) {

  function search(depthLeft, alpha, beta) {
    if (depthLeft === 0) {
      return state.evaluate();
    }
    var bestValue = -Infinity;
    var moves = state.generateMoves();
    for (var i = 0; i < moves.length; ++i) {
      var move = moves[i];
      var removed = state.doMove(move);
      var value = -search(depthLeft - 1, -beta, -alpha);
      state.undoMove(move, removed);
      if (value > bestValue) {
        bestValue = value;
        if (value > alpha) alpha = value;
        if (value >= beta) break;
      }
    }
    return bestValue;
  }

  var bestMoves = [];
  var bestValue = -Infinity;
  for (var i = 0; i < moves.length; ++i) {
    var move = moves[i];
    var removed = state.doMove(move);
    var value = -search(SEARCH_DEPTH - 1, -Infinity, -bestValue + 1);
    state.undoMove(move, removed);
    if (value > bestValue) {
      bestValue = value;
      bestMoves.length = 0;
    }
    if (value === bestValue) {
      bestMoves.push(move);
    }
  }
  return [bestMoves, bestValue];
}

function arrayEquals(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
  return true;
}

function indexOfMove(moves, move) {
  for (var i = 0; i < moves.length; ++i) {
    if (arrayEquals(move, moves[i])) return i;
  }
  return -1;
}


/////////////////////////////////////////
//  API entry points used by the game  //
/////////////////////////////////////////

function initCPU() {
  // Currently we only support one game configuration.
  if (game.getBoardDimensionX() !== COLS ||
      game.getBoardDimensionY() !== ROWS ||
      game.getHeightToWin() !== WINNING_HEIGHT ||
      game.getNumOfPlayers() !== 2) {
    throw new Error('Unsupported game configuration!');
  }
}

function callCPU(jsonBoard, jsonMoves, nDirection) {
  var myId = game.getID();
  var outside = game.getOutside();
  var padding = game.getPadding();

  if (myId < 1 || myId > 2) throw new Error('Invalid player id');

  var legalMoves = JSON.parse(jsonMoves);
  if (legalMoves.length === 0) throw new Error('No moves available');
  if (legalMoves.length === 1) return legalMoves[0];

  var fieldIndices = [];
  var fields = [];
  var board = JSON.parse(jsonBoard);
  for (var i = 0; i < board.length; ++i) {
    if (board[i] === outside || board[i] === padding) {
      fieldIndices.push(-1);
    } else {
      fieldIndices.push(fields.length);
      var field = [];
      for (var j = 0; j < board[i].length; ++j) {
        var piece = board[i].charCodeAt(j) - '1'.charCodeAt(0);
        if (piece < 0 || piece > 1) throw new Error('Invalid piece');
        field.push(piece);
      }
      fields.push(field);
    }
  }
  if (fields.length !== FIELD_COUNT) throw new Error('Invalid number of fields');

  // Convert legal moves from API format. (We need to do this because the game
  // won't tell us what the last move was, but it is omitted from the legal
  // moves. Also, my AI allows building a tower that gives a point to the
  // opponent while the game does not seem to allow this.)
  var moves = [];
  for (var i = 0; i < legalMoves.length; ++i) {
    const apiMove = legalMoves[i];
    if (apiMove[0] === -1) {
      // Place a new piece: [-1, 1, dst] => [1, dst, st]
      moves.push([apiMove[1], fieldIndices[apiMove[2]], fieldIndices[apiMove[2]]]);
    } else {
      // Move a stack: [src, cnt, dst] => [cnt, src, dst]
      moves.push([apiMove[1], fieldIndices[apiMove[0]], fieldIndices[apiMove[2]]]);
    }
  }

  var state = new State({fields: fields, nextPlayer: myId - 1, scores: [0, 0], lastMove: null});
  var result = findBestMoves(state, moves);
  var bestMoves = result[0];
  var bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  log(bestMoves.length + ' best move(s) with value ' + result[1] + ': ' +
        formatMoves(bestMoves) + '; choosing ' + formatMove(bestMove) + ' at random');
  var moveIndex = indexOfMove(moves, bestMove);
  if (moveIndex < 0) throw new Error('Best move not found somehow?!');
  return legalMoves[moveIndex];
}


////////////////////////////////////////////////////////
//  Code below is used for command-line testing only  //
////////////////////////////////////////////////////////


// Parses a move string into an array [cnt, src, dst], indicating that `cnt`
// stones are moved from `src` to `dst`. (If a new stone is placed on an empty
// field, src == dst and cnt == 1.)
//
// Moves are formatted in 2 to 5 characters: [<count>] <c1> <r1> [<c2> <r2>],
// where <count> defaults to 1 if omitted, and <c2> and <r2> are equal to
// <r1> and <r2> if omitted.
//
//  c2    -> [1, 7, 7]
//  3c2e4 -> [3, 7, 19]
//
// If the move cannot be parsed, undefined is returned. This function DOES NOT
// validate the move beyond checking the coordinates are valid.
function parseMove(move) {
  if (move === 'pass') return [];
  if (move.length < 2 || move.length > 5) return undefined;
  var i = 0;
  var cnt = move.length % 2 === 1 ? move.charCodeAt(i++) - '0'.charCodeAt(0) : 1;
  var c1 = move.charCodeAt(i++) - 'a'.charCodeAt(0);
  var r1 = move.charCodeAt(i++) - '1'.charCodeAt(0);
  var c2 = i < move.length ? move.charCodeAt(i++) - 'a'.charCodeAt(0) : c1;
  var r2 = i < move.length ? move.charCodeAt(i++) - '1'.charCodeAt(0) : r1;
  if (cnt > 0 && cnt < WINNING_HEIGHT && r1 >= 0 && r1 < ROWS && c1 >= 0 && c1 < COLS) {
    return [cnt, r1*ROWS + c1, r2*ROWS + c2];
  }
}

function formatRow(row) {
  return String(row + 1);
}

function formatCol(col) {
  return String.fromCharCode('a'.charCodeAt(0) + col);
}

function formatMove(move) {
  if (move.length === 0) return 'pass';
  var c1 = move[1] % COLS;
  var r1 = (move[1] - c1) / COLS;
  var c2 = move[2] % COLS;
  var r2 = (move[2] - c2) / COLS;
  var res = '';
  if (move[0] != 1) res += String(move[0]);
  res += formatCol(c1) + formatRow(r1);
  if (r1 != r2 || c1 != c2) res += formatCol(c2) + formatRow(r2);
  return res;
}

function formatMoves(moves) {
  var res = '';
  for (var i = 0; i < moves.length; ++i) {
    if (i > 0) res += ' ';
    res += formatMove(moves[i]);
  }
  return res;
}

// Run text-based interface (requires node.js)
//
// Supports the following commands:
//
//  save  dumps the current state as a JSON string
//  load  loads a state from a JSON string
//  undo  undoes the last move
//  redo  redoes the move that was last undone
//  eval  evaluates the current position
//  best  reports the best moves (according to the Minimax search algorithm)
//  <move> play a move, where a move is formatted like:
//          pass
//          a1 (place a new piece on field a1)
//          3a1b2 (move 3 pieces from a1 to b2)
//
function runStandalone() {
  var undoStack = [];
  var redoStack = [];
  var state = State();
  state.debugPrint();

  function defaultLineHandler(line) {
    if (line === 'save') {
      log(JSON.stringify(state.toJson()));
    } else if (line === 'load') {
      log('Enter the JSON state to load on the next line:');
      currentLineHandler = loadLineHandler;
    } else if (line === 'undo') {
      if (undoStack.length === 0) {
        log('Undo stack is empty!');
      } else {
        var item = undoStack.pop();
        redoStack.push(item[0]);
        state.undoMove(item[0], item[1]);
        state.debugPrint();
      }
    } else if (line === 'redo') {
      if (redoStack.length === 0) {
        log('Redo stack is empty!');
      } else {
        var move = redoStack.pop();
        var removed = state.doMove(move);
        undoStack.push([move, removed]);
        state.debugPrint();
      }
    } else if (line == 'eval') {
      log(state.evaluate());
    } else if (line === 'best') {
      var result = findBestMoves(state, state.generateMoves());
      log(result[0].length + ' best move(s) with value ' + result[1] + ': ' + formatMoves(result[0]));
    } else {
      var move = parseMove(line);
      if (move == null) {
        log('Could not parse move!');
      } else if (indexOfMove(state.generateMoves(), move) < 0) {
        log('Invalid move!')
      } else {
        var removed = state.doMove(move);
        undoStack.push([move, removed]);
        redoStack.length = 0;
        state.debugPrint();
      }
    }
  }

  function loadLineHandler(line) {
    currentLineHandler = defaultLineHandler;
    try {
      var newState = State(JSON.parse(line));
      newState.debugPrint();
      // Order matters here. Only overwrite state if debugPrint() succeeds,
      // so that if the state is invalid, we keep the old state.
      state = newState;
      undoStack.length = 0;
      redoStack.length = 0;
    } catch (e) {
      log(e);
      log('Failed to load JSON state!');
    }
  }

  // Use Node.js readline library to process input.
  var readline = require('readline');
  var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout});
  var currentLineHandler = defaultLineHandler;
  rl.on('line', (line) => currentLineHandler(line));
  rl.once('close', () => log('EOF'));
}

if (typeof game === 'undefined') {
  log('Starting standalone.');
  runStandalone();
}

// Future improvements:
//
//  - add tests
//  - add benchmarks (before attempting further optimizations)
//  - optimize search and evaluation functions
//  - support arbitrary board configurations
//  - support more than 2 players
//
