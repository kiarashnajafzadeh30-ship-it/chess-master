var board = null;
var game = new Chess();
var $status = $('#status');

// متغیرهای آنلاین
var peer = null;
var conn = null;
var isHost = false; // آیا ما میزبان (سفید) هستیم یا مهمان (سیاه)؟

function getPlayerName(color) {
  var mode = $('#gameMode').val();
  
  if (mode === 'pve') {
    return color === 'w' ? ($('#whitePlayerName').val() || "شما ⚪") : "ربات 🤖";
  }
  if (mode === 'online') {
    if (color === 'w') return isHost ? "شما (میزبان ⚪)" : "حریف (میزبان ⚪)";
    if (color === 'b') return isHost ? "حریف (مهمان ⚫)" : "شما (مهمان ⚫)";
  }

  if (color === 'w') {
    let name = $('#whitePlayerName').val();
    return name.trim() === "" ? "سفید ⚪" : name;
  } else {
    let name = $('#blackPlayerName').val();
    return name.trim() === "" ? "سیاه ⚫" : name;
  }
}

function onDragStart (source, piece, position, orientation) {
  if (game.game_over()) return false;
  
  var mode = $('#gameMode').val();
  
  // جلوگیری از حرکت دادن مهره حریف
  if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
      (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
    return false;
  }

  // قوانین حالت ربات
  if (mode === 'pve' && game.turn() === 'b') return false; 

  // قوانین حالت آنلاین (اگر نوبت ما نباشه، نمی‌تونیم حرکت کنیم)
  if (mode === 'online') {
    if (isHost && game.turn() === 'b') return false; // میزبان فقط سفید
    if (!isHost && game.turn() === 'w') return false; // مهمان فقط سیاه
  }
}

function onDrop (source, target) {
  var move = game.move({
    from: source,
    to: target,
    promotion: 'q'
  });

  if (move === null) return 'snapback';

  updateStatus();

  var mode = $('#gameMode').val();

  // اگر آنلاین بازی می‌کنیم، حرکت رو برای حریف بفرست
  if (mode === 'online' && conn) {
    conn.send({ from: source, to: target });
  }

  // اگر با ربات بازی می‌کنیم، ربات حرکت کنه
  if (mode === 'pve' && !game.game_over()) {
    setTimeout(makeBotMove, 500); 
  }
}

// دریافت حرکت از حریف آنلاین
function onReceiveMove(data) {
  game.move({
    from: data.from,
    to: data.to,
    promotion: 'q'
  });
  board.position(game.fen());
  updateStatus();
}

function onSnapEnd () {
  board.position(game.fen());
}

function makeBotMove() {
  if (game.game_over()) return;

  var possibleMoves = game.moves({ verbose: true });
  var bestMove = null;

  for (var i = 0; i < possibleMoves.length; i++) {
    if (possibleMoves[i].flags.indexOf('c') !== -1 || possibleMoves[i].captured) {
      bestMove = possibleMoves[i];
      break;
    }
  }

  if (!bestMove) {
    var randomIndex = Math.floor(Math.random() * possibleMoves.length);
    bestMove = possibleMoves[randomIndex];
  }

  game.move(bestMove);
  board.position(game.fen(), false); 
  updateStatus();
}

function updateStatus () {
  var status = '';
  var moveColor = game.turn();

  if (game.in_checkmate()) {
    let winner = moveColor === 'w' ? getPlayerName('b') : getPlayerName('w');
    status = 'بازی تموم شد! ' + winner + ' برد! 🏆';
  } else if (game.in_draw()) {
    status = 'مساوی شد! 🤝';
  } else {
    let currentPlayer = moveColor === 'w' ? getPlayerName('w') : getPlayerName('b');
    status = 'نوبت: ' + currentPlayer;
    
    if (game.in_check()) {
      status += ' (کیش!) ⚠️';
    }
  }

  $status.html(status);
}

function restartGame() {
  game.reset();
  board.start();
  updateStatus();
}

function flipBoard() {
  board.flip();
}

function changeMode() {
  var mode = $('#gameMode').val();
  
  if (mode === 'pve') {
    $('#blackPlayerName').val('ربات 🤖').prop('disabled', true);
    $('#whitePlayerName').prop('disabled', false);
    $('#online-section').hide();
  } else if (mode === 'pvp') {
    $('#blackPlayerName').prop('disabled', false);
    if ($('#blackPlayerName').val() === 'ربات 🤖') $('#blackPlayerName').val('');
    $('#whitePlayerName').prop('disabled', false);
    $('#online-section').hide();
  } else if (mode === 'online') {
    $('#online-section').show();
    $('#whitePlayerName').prop('disabled', true);
    $('#blackPlayerName').prop('disabled', true);
  }
  
  restartGame(); 
}
// ================= توابع بازی آنلاین =================
function createRoom() {
  document.getElementById("roomCodeDisplay").innerText = "در حال ساخت اتاق...";
  peer = new Peer(); 
  
  peer.on('open', function(id) {
    document.getElementById("roomCodeDisplay").innerText = "کد اتاق شما: " + id;
    isHost = true; // ما میزبانیم
    board.orientation('white');
  });

  peer.on('connection', function(connection) {
    conn = connection;
    document.getElementById("roomCodeDisplay").innerText = "حریف متصل شد! شما سفید هستید.";
    document.getElementById("status").innerText = "بازی شروع شد!";
    
    conn.on('data', function(data) {
      onReceiveMove(data);
    });
  });
}

function joinRoom() {
  var roomCode = document.getElementById("roomCodeInput").value;
  if (!roomCode) return alert("اول کد اتاق رو وارد کن!");
  
  document.getElementById("roomCodeDisplay").innerText = "در حال اتصال...";
  peer = new Peer();
  
  peer.on('open', function() {
    conn = peer.connect(roomCode);
    
    conn.on('open', function() {
      document.getElementById("roomCodeDisplay").innerText = "به اتاق متصل شدی! شما سیاه هستید.";
      isHost = false; // ما مهمانیم
      board.orientation('black'); // صفحه رو برای سیاه می‌چرخونیم
    });

    conn.on('data', function(data) {
      onReceiveMove(data);
    });
  });

  peer.on('error', function(err) {
    document.getElementById("roomCodeDisplay").innerText = "خطا: کد اتاق اشتباهه یا میزبان آفلاینه.";
  });
}
// ======================================================

var config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
  pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
};

board = Chessboard('myBoard', config);

$('#whitePlayerName, #blackPlayerName').on('input', updateStatus);

updateStatus();
