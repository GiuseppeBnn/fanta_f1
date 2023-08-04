const db = require("./db");

db.getPilots().then((pilots) => {
    console.log(pilots);
    }
);
