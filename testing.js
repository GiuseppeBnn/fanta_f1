const db = require("./db");

db.getPilotsValues().then((pilots) => {
    console.log(pilots);
});
