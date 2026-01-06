
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("db.sqlite");

// Import the package
const { SqliteGuiNode } = require("sqlite-gui-node");

// use the GUI
SqliteGuiNode(db).catch((err) => {
  console.error("Error starting the GUI:", err);
});


