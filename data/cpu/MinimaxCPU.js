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
 *
 * Remark: Qt <= 5.11 supports only ECMAScript 5, so
 * ES5 should be chosen for compatibility reasons!
 */

'use strict';

// Note: unlike console.log(), game.log() supports only a single string argument!
var log = typeof game === 'object' ? game.log : console.log;

// Minimax search depth.
//
// Determines the strength of the AI: higher is better, but slower.
var SEARCH_DEPTH = 4;

// Number of pieces per player. This should be configurable, but currently the
// game does not pass this information to the CPU players (issue #11).
var PIECES_PER_PLAYER = 20;

// Move that represents passing (an empty array).
var PASS = Object.freeze([]);

function createConfig(
    rows, cols, inputFields, outside, padding,
    winningHeight, winningScore, piecesPerPlayer, playerCount) {
  if (inputFields.length !== rows * cols) {
    throw new Error('Invalid length of input fields');
  }
  var apiToFieldIndex = [];
  var fieldIndexToApi = [];
  var fieldCount = 0;
  for (var r1 = 0; r1 < rows; ++r1) {
    for (var c1 = 0; c1 < cols; ++c1) {
      var i = cols * r1 + c1;
      if (inputFields[i] === outside || inputFields[i] === padding) {
        apiToFieldIndex.push(-1);
      } else {
        apiToFieldIndex.push(fieldCount++);
        fieldIndexToApi.push(i);
      }
    }
  }
  if (fieldCount > 30) {
    throw new Error('Too many fields (maximum supported: 30)');
  }

  // moves[dst][height] is an array of [src, mask] fields, where
  // mask is a bitmask of fields between src and dst.
  var moves = [];
  var DR = [-1, -1, -1,  0,  0, +1, +1, +1];
  var DC = [-1,  0, +1, -1, +1, -1,  0, +1];
  for (var r2 = 0; r2 < rows; ++r2) {
    for (var c2 = 0; c2 < cols; ++c2) {
      var j = cols * r2 + c2;
      if (inputFields[j] === outside || inputFields[j] === padding) continue;
      var dst = moves.length;
      moves.push([]);
      for (var height = 0; height < winningHeight; ++height) {
        moves[dst].push([]);
      }
      for (var dir = 0; dir < 8; ++dir) {
        var dr = DR[dir], dc = DC[dir];
        var mask = 0;
        for (var height = 1; height < winningHeight; ++height) {
          var r1 = r2 - dr*height;
          var c1 = c2 - dc*height;
          if (r1 < 0 || r1 >= rows || c1 < 0 || c1 >= cols) break;
          var i = cols * r1 + c1;
          if (inputFields[i] === outside || inputFields[i] === padding) break;
          var src = apiToFieldIndex[r1*cols + c1];
          moves[dst][height].push([src, mask]);
          mask |= 1 << src;
        }
      }
    }
  }

  return Object.freeze({
    apiToFieldIndex: Object.freeze(apiToFieldIndex),
    fieldIndexToApi: Object.freeze(fieldIndexToApi),
    fieldCount: fieldCount,
    moves: Object.freeze(moves),
    winningHeight: winningHeight,
    winningScore: winningScore,
    piecesPerPlayer: piecesPerPlayer,
    playerCount: playerCount,
    // These are only used for parseMove() and debug-printing:
    rows: rows,
    cols: cols,
    // Maybe add this to debug-print non-rectangular boards:
    // inputFields: inputFields,
  });
}

function arrayOfValues(len, value) {
  var res = [];
  for (var i = 0; i < len; ++i) res.push(value);
  return res;
}

function arrayOfObjects(len, constructor) {
  var fields = [];
  for (var i = 0; i < len; ++i) fields.push(constructor());
  return fields;
}

// Constructs a new state, possibly from an old state returned by toJson().
// Note that inputJson, if given, MUST be valid, or things will get weird!
function State(cfg, inputJson) {

  // Pieces on the board. For each field, we store an array of colors 0 and 1.
  var fields = inputJson ? inputJson.fields : arrayOfObjects(cfg.fieldCount, Array);

  // Next player to move. Either 0 or 1.
  var nextPlayer = inputJson ? inputJson.nextPlayer : 0;

  // Number of towers each player needs to win.
  var scoresLeft = inputJson ? inputJson.scoresLeft : arrayOfValues(cfg.playerCount, cfg.winningScore);

  // Last move played (to prevent reverting)
  var lastMove = inputJson ? inputJson.lastMove : null;

  // Bitmask of occupied fields.
  var occupied = 0;

  // Number of pieces per player.
  var piecesLeft = arrayOfValues(cfg.playerCount, cfg.piecesPerPlayer);

  if (inputJson) {
    // Recompute `occupied` and `piecesLeft` from given fields.
    for (var i = 0; i < fields.length; ++i) {
      var height = fields[i].length;
      if (height > 0) {
        occupied |= 1 << i;
        for (var j = 0; j < height; ++j) --piecesLeft[fields[i][j]];
      }
    }
  }

  // Returns the player index of the winner, or -1 if there is no winner.
  function getWinner() {
    return scoresLeft.indexOf(0);
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
        if (dstField.length >= cfg.winningHeight) {
          removed = dstField.splice(0);
          var winner = removed[removed.length - 1];
          scoresLeft[winner] -= 1;
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
          scoresLeft[winner] += 1;
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
    var winner = getWinner();
    if (winner !== -1) return winner === nextPlayer ? 1000000000 : -1000000000;

    var score = 10000 * (scoresLeft[1 - nextPlayer] - scoresLeft[nextPlayer]);
    for (var dst = 0; dst < fields.length; ++dst) {
      var dstField = fields[dst];
      var dstHeight = dstField.length;
      if (dstHeight > 0) {
        var options = cfg.moves[dst][dstHeight];
        for (var i = 0; i < options.length; ++i) {
          var src = options[i][0];
          var srcField = fields[src]
          var srcHeight = srcField.length;
          if (srcHeight + dstHeight >= cfg.winningHeight && (occupied & options[i][1]) === 0) {
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
            score += 1 + i;
          } else {
            score -= 1 + i;
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
  // Rules of the game:
  //  - https://spielstein.com/games/mixtour/rules (2 players)
  //  - https://spielstein.com/games/mixtour/rules/a-trois (3 players)
  function generateMoves() {
    if (getWinner() !== -1) return [];  // Game is over
    var moveTemplates = cfg.moves;
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
        var options = moveTemplates[dst][dstHeight];
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
  //
  // This currently only works for rectangular boards without holes, like the
  // default 5x5 board.
  function debugPrint() {
    log('Scores left: ' + scoresLeft);
    log('Pieces left: ' + piecesLeft);
    log('Player ' + (nextPlayer + 1) + ' to move.');
    for (var r = 0; r < cfg.rows; ++r) {
      var line = formatRow(r) + '  ';
      for (var c = 0; c < cfg.cols; ++c) {
        var src = r*cfg.cols + c;
        var part = '';
        if (fields[src].length === 0) {
          part = '.';
        } else {
          for (var i = 0; i < fields[src].length; ++i) {
            part += String(fields[src][i] + 1);
          }
        }
        while (part.length < cfg.winningHeight) part += ' ';
        line += ' ' + part;
        if (((occupied & (1 << src)) !== 0) != (fields[src].length !== 0)) {
          log('INTERNAL ERROR: occupied does not match fields at ' + src);
        }
      }
      log(line);
    }
    var line = '   ';
    for (var c = 0; c < cfg.cols; ++c) {
      var part = formatCol(c);
      while (part.length < cfg.winningHeight) part += ' ';
      line += ' ' + part;
    }
    log(line);
    log('last move: ' + (lastMove ? formatMove(cfg, lastMove) : 'none'));
    var moves = generateMoves();
    log(moves.length + ' possible moves: ' + formatMoves(cfg, moves));
  }

  // Returns the state as a JSON-serializable object. This does not do a deep
  // clone, so it's invalidated when the state changes! To prevent this, the
  // caller should serialize the object to a string.
  function toJson() {
    return {fields: fields, nextPlayer: nextPlayer, scoresLeft: scoresLeft, lastMove: lastMove};
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
    var moves = state.generateMoves();
    if (moves.length === 0) {
      // Game is over. Adjust value by `depthLeft` to reward quicker wins.
      var value = state.evaluate();
      if (value > 0) value += depthLeft;
      if (value < 0) value -= depthLeft;
      return value;
    };
    var bestValue = -Infinity;
    for (var i = 0; i < moves.length; ++i) {
      var move = moves[i];
      var undoState = state.doMove(move);
      var value = -search(depthLeft - 1, -beta, -alpha);
      state.undoMove(move, undoState);
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
    var undoState = state.doMove(move);
    var value = -search(SEARCH_DEPTH - 1, -Infinity, -bestValue + 1);
    state.undoMove(move, undoState);
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

function calculateScoresLeft(cfg, scores) {
  var scoresLeft = [];
  for (var i = 0; i < scores.length; ++i) {
    scoresLeft.push(cfg.winningScore - scores[i]);
  }
  return scoresLeft;
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
  if (game.getNumOfPlayers() !== 2) {
    throw new Error('Unsupported number of players!');
  }
}

function callCPU(jsonBoard, jsonMoves, nDirection) {
  var board = JSON.parse(jsonBoard);
  var legalMoves = JSON.parse(jsonMoves);

  // Possible optimization: cache this between calls to callCPU(), assuming that
  // the game configuration including board layout does not change in between.
  var cfg = createConfig(
    game.getBoardDimensionY() + 2 * game.getHeightToWin(),
    game.getBoardDimensionX() + 2 * game.getHeightToWin(),
    board,
    game.getOutside(),
    game.getPadding(),
    game.getHeightToWin(),
    game.getTowersToWin(),
    PIECES_PER_PLAYER,
    game.getNumOfPlayers(),
  );

  var myId = game.getID();
  if (myId < 1 || myId > cfg.playerCount) throw new Error('Invalid player id');

  if (legalMoves.length === 0) throw new Error('No moves available');
  if (legalMoves.length === 1) return legalMoves[0];

  // Convert legal moves from API format. We need to do this because the game
  // won't tell us what the last move was (issue #9), but it is omitted from the
  // legal moves. Also, my AI allows building a tower that gives a point to the
  // opponent while the game does not seem to allow this, so using legalMoves as
  // the source of truth prevents making moves the game considers illegal.
  var moves = [];
  for (var i = 0; i < legalMoves.length; ++i) {
    const apiMove = legalMoves[i];
    if (apiMove[0] === -1) {
      // Place a new piece: [-1, 1, dst] => [1, dst, dst]
      moves.push([apiMove[1], cfg.apiToFieldIndex[apiMove[2]], cfg.apiToFieldIndex[apiMove[2]]]);
    } else {
      // Move a stack: [src, cnt, dst] => [cnt, src, dst]
      moves.push([apiMove[1], cfg.apiToFieldIndex[apiMove[0]], cfg.apiToFieldIndex[apiMove[2]]]);
    }
  }

  var fields = [];
  for (var i = 0; i < cfg.fieldCount; ++i) {
    var field = [];
    var string = board[cfg.fieldIndexToApi[i]];
    for (var j = 0; j < string.length; ++j) {
      var piece = string.charCodeAt(j) - '1'.charCodeAt(0);
      if (piece < 0 || piece >= cfg.playerCount) throw new Error('Invalid piece');
      field.push(piece);
    }
    fields.push(field);
  }
  if (fields.length !== cfg.fieldCount) throw new Error('Invalid number of fields');

  var state = State(cfg, {
    fields: fields,
    nextPlayer: myId - 1,
    scoresLeft: calculateScoresLeft(cfg, game.getScores()),
    lastMove: null,  // issue #9
  });
  var result = findBestMoves(state, moves);
  var bestMoves = result[0];
  var bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  log(moves.length + ' moves, ' + bestMoves.length + ' best with value ' + result[1] + ': ' +
        formatMoves(cfg, bestMoves) + '; selected ' + formatMove(cfg, bestMove) + ' at random');
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
function parseMove(cfg, move) {
  if (move === 'pass') return [];
  if (move.length < 2 || move.length > 5) return undefined;
  var i = 0;
  var cnt = move.length % 2 === 1 ? move.charCodeAt(i++) - '0'.charCodeAt(0) : 1;
  var c1 = move.charCodeAt(i++) - 'a'.charCodeAt(0);
  var r1 = move.charCodeAt(i++) - '1'.charCodeAt(0);
  var c2 = i < move.length ? move.charCodeAt(i++) - 'a'.charCodeAt(0) : c1;
  var r2 = i < move.length ? move.charCodeAt(i++) - '1'.charCodeAt(0) : r1;
  if (cnt > 0 && cnt < cfg.winningHeight && r1 >= 0 && r1 < cfg.rows && c1 >= 0 && c1 < cfg.cols) {
    return [cnt, r1*cfg.rows + c1, r2*cfg.rows + c2];
  }
}

function formatRow(row) {
  return String(row + 1);
}

function formatCol(col) {
  return String.fromCharCode('a'.charCodeAt(0) + col);
}

function formatMove(cfg, move) {
  if (move.length === 0) return 'pass';
  var cols = cfg.cols;
  var c1 = move[1] % cols;
  var r1 = (move[1] - c1) / cols;
  var c2 = move[2] % cols;
  var r2 = (move[2] - c2) / cols;
  var res = '';
  if (move[0] != 1) res += String(move[0]);
  res += formatCol(c1) + formatRow(r1);
  if (r1 != r2 || c1 != c2) res += formatCol(c2) + formatRow(r2);
  return res;
}

function formatMoves(cfg, moves) {
  var res = '';
  for (var i = 0; i < moves.length; ++i) {
    if (i > 0) res += ' ';
    res += formatMove(cfg, moves[i]);
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
  var cfg = createConfig(5, 5, ".........................", '#', '-', 5, 3, 20, 2);

  var undoStack = [];
  var redoStack = [];
  var state = State(cfg);
  state.debugPrint();

  var currentLineHandler = defaultLineHandler;

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
        var undoState = state.doMove(move);
        undoStack.push([move, undoState]);
        state.debugPrint();
      }
    } else if (line == 'eval') {
      log(state.evaluate());
    } else if (line === 'best') {
      var result = findBestMoves(state, state.generateMoves());
      log(result[0].length + ' best move(s) with value ' + result[1] + ': ' + formatMoves(cfg, result[0]));
    } else {
      var move = parseMove(cfg, line);
      if (move == null) {
        log('Could not parse move!');
      } else if (indexOfMove(state.generateMoves(), move) < 0) {
        log('Invalid move!')
      } else {
        var undoState = state.doMove(move);
        undoStack.push([move, undoState]);
        redoStack.length = 0;
        state.debugPrint();
      }
    }
  }

  function loadLineHandler(line) {
    currentLineHandler = defaultLineHandler;
    try {
      var newState = State(cfg, JSON.parse(line));
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
  rl.on('line', (line) => currentLineHandler(line));
  rl.once('close', () => log('EOF'));
}

if (typeof game === 'undefined') {
  log('Starting standalone.');
  runStandalone();
}
