
// Получение HTTP_PORT из среды или использование 8080, если не задано.
HTTP_PORT = process.env.PORT || 8080;


var WebSocketServer = require("ws").Server; // webSocket library


const websocketServerInstance = new WebSocketServer({ noServer: true });
let clientsBySessionId = {}; // list of client connections by session id

// Обработчики сервера WebSocket.
function handleConnection(client, request) {
  console.log("New Connection, session id: ", request.url);
  const requestSessionId = request.url;

  function endClient() {
    // Удалите отключенный клиент из коллекции `клиенты по идентификатору сеанса`.
    for (const sessionId in clientsBySessionId) {
      for (const playerId in clientsBySessionId[sessionId]) {
        if (clientsBySessionId[sessionId][playerId] === client) {
          console.log(`DELETE CLIENT of playerId '${playerId}'`);
          delete clientsBySessionId[sessionId][playerId];

          // Уведомите остальных игроков о том, что один игрок был отключен.
          broadcast(
            sessionId,
            JSON.stringify({
              type: "disconnect",
              playerId: playerId,
            })
          );
        }
      }
    }
    console.log("Connection closed.");
  }

  function clientResponse(data) {
    let message = JSON.parse(data);


    if (message.type === "ping") {
      message.type = "pong";
      client.send(JSON.stringify(message));
      return;
    }

    if (!message?.playerId) {
      const msg = { error: `Wrong message. PlayerId is not set. ${data}` };
      console.error(msg);
      client.send(JSON.stringify(msg));
      return;
    }

    // Сохранение объекта клиентского подключения, если он не существует.
    clientsBySessionId[requestSessionId] =
      clientsBySessionId[requestSessionId] ?? {};

    clientsBySessionId[requestSessionId][message.playerId] =
      clientsBySessionId[requestSessionId][message.playerId] ?? client;

    broadcast(requestSessionId, JSON.stringify(message));
  }

  // Set up client event listeners:
  client.on("message", clientResponse);
  client.on("close", endClient);
}

// Эта функция транслирует сообщения, в частности, всем клиентам WebSocket
function broadcast(sessionId, data) {
  console.log("BROADCAST", sessionId, data);
  // Iterate over the array of clients & send data to each.
  for (const playerId in clientsBySessionId[sessionId]) {
    console.log("SEND", `${data} to '${playerId}'`);
    clientsBySessionId[sessionId][playerId].send(data);
  }
}

// Подключения к клиентам.
websocketServerInstance.on("connection", handleConnection);

// Запуск простого HTTP-сервера для обслуживания статических файлов.
var http = require("http");
var fs = require("fs");
var path = require("path");

let httpServer = http
  .createServer(function (request, response) {
    var webRoot = __dirname;
    var filePath = webRoot + request.url;
    if (filePath == webRoot + "/") filePath = webRoot + "/index.html";

    var extname = path.extname(filePath);
    var contentType = "text/html";
    switch (extname) {
      case ".ico":
        contentType = "image/x-icon";
        break;
      case ".js":
        contentType = "text/javascript";
        break;
      case ".css":
        contentType = "text/css";
        break;
      case ".json":
        contentType = "application/json";
        break;
      case ".png":
        contentType = "image/png";
        break;
      case ".jpg":
        contentType = "image/jpg";
        break;
      case ".svg":
        contentType = "image/svg+xml";
        break;
      case ".wav":
        contentType = "audio/wav";
        break;
    }

    fs.readFile(filePath, function (error, content) {
      if (error) {
        if (error.code == "ENOENT") {
          // If file is not found send the default page instead.
          // Uses to handle URLs like <origin>/<session_id>.
          fs.readFile(webRoot + "/index.html", function (error, content) {
            response.writeHead(200, { "Content-Type": contentType });
            response.end(content, "utf-8");
          });
        } else {
          response.writeHead(500);
          response.end(
            "Sorry, check with the site admin for error: " +
              error.code +
              " ..\n"
          );
          response.end();
        }
      } else {
        response.writeHead(200, { "Content-Type": contentType });
        response.end(content, "utf-8");
      }
    });
  })
  .listen(HTTP_PORT);

console.log(`HTTP/WS server is running on port ${HTTP_PORT}...`);

// Инициализируйте обработку соединения WebSocket через HTTP.
httpServer.on("upgrade", function upgrade(request, socket, head) {
  websocketServerInstance.handleUpgrade(
    request,
    socket,
    head,
    function done(client) {
      websocketServerInstance.emit("connection", client, request);
    }
  );
});


process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});