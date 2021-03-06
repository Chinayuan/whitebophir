var iolib = require('socket.io')
	, path = require("path")
	, fs = require('fs')
	, BoardData = require("./boardData.js").BoardData;


var boards = {
	"anonymous": {
		"data": new BoardData("anonymous"),
	}
};

function noFail(fn) {
	return function noFailWrapped(arg) {
		try {
			return fn(arg);
		} catch (e) {
			console.trace(e);
		}
	}
}

function startIO(app) {
	io = iolib(app);
	io.on('connection', noFail(socketConnection));
	return io;
}

function socketConnection(socket) {
	socket.on("getboard", noFail(function onGetBoard(name) {

		// Default to the public board
		if (!name) name = "anonymous";

		if (!boards[name]) {
			boards[name] = {
				"data": new BoardData(name)
			};
		}

		var board_data = boards[name].data;

		// Join the board
		socket.join(name);

		//Send all the board's data as soon as it's loaded
		var sendIt = function () {
			board_data.getAll(function (data) {
				socket.emit("broadcast", data);
			});
		};

		if (board_data.ready) sendIt();
		else board_data.on("ready", sendIt);
	}));

	socket.on('broadcast', noFail(function onBroadcast(message) {
		var boardName = message.board || "anonymous";
		var data = message.data;

		if (!data) {
			console.warn("Received invalid message: %s.", JSON.stringify(message));
			return;
		}

		//Send data to all other users connected on the same board
		socket.broadcast.to(boardName).emit('broadcast', data);

		saveHistory(boardName, data);
	}));
}

function saveHistory(boardName, message) {
	if (!(boardName in boards)) throw new Error("Missing board cannot be saved: ", boardName);
	var id = message.id;
	var boardData = boards[boardName].data;
	switch (message.type) {
		case "delete":
			if (id) boardData.delete(id);
			break;
		case "update":
			delete message.type;
			if (id) boardData.update(id, message);
			break;
		case "child":
			boardData.addChild(message.parent, message);
			break;
		default: //Add data
			if (!id) throw new Error("Invalid message: ", message);
			boardData.set(id, message);
	}
}

function generateUID(prefix, suffix) {
	var uid = Date.now().toString(36); //Create the uids in chronological order
	uid += (Math.round(Math.random() * 36)).toString(36); //Add a random character at the end
	if (prefix) uid = prefix + uid;
	if (suffix) uid = uid + suffix;
	return uid;
}

if (exports) {
	exports.start = function (app) {
		boards["anonymous"].data.on("ready", function () {
			startIO(app);
		});
	};
}
