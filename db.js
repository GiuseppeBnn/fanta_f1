const mysql = require("mysql2");
const axios = require("axios");
const argon2 = require("argon2");

const pool = createPool();

function createPool() {
  let pool = mysql.createPool({
    host: "localhost",
    user: "admin",
    password: "admin",
    database: "ff1",
    waitForConnections: true,
    connectionLimit: 10,
  });
  return pool;
}

const inizializeDatabase = () => {
  pool.execute(
    `
    CREATE TABLE IF NOT EXISTS pilots (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255) NOT NULL
  )
`,
    (err) => {
      if (err) {
        console.error("Errore durante la creazione della tabella:", err);
      } else {
        console.log("Tabella dei piloti creata con successo!");
      }
    }
  );
  insertPilots();
  //TODO: creare tabella dei team
  createPointsTable();
  createUsersTable();
  insertCoins();
  createTeamTable();

};

function getPilots() {
  const url = "http://ergast.com/api/f1/2023/drivers.json";

  // Funzione per ottenere i dati dei piloti dalla Ergast API
  async function getDriversData() {
    try {
      const response = await axios.get(url);
      const driversData = response.data.MRData.DriverTable.Drivers;
      return driversData;
    } catch (error) {
      console.error("Errore durante la richiesta:", error.message);
      throw error;
    }
  }
  return getDriversData();
}

function insertPilots() {
  //insert pilots json to db
  getPilots().then((pilots) => {
    pilots.forEach((pilot) => {
      if (pilot.permanentNumber == 33) pilot.permanentNumber = 1;
      pool.execute(
        `
          INSERT INTO pilots (id, name, surname)
          VALUES (?,?,?)
          ON DUPLICATE KEY UPDATE name = VALUES(name), surname = VALUES(surname)
          `,
        [pilot.permanentNumber, pilot.givenName, pilot.familyName],
        (err) => {
          if (err) {
            console.error("Errore durante l'inserimento dei dati:", err);
          } else {
            console.log("Dati inseriti con successo!");
          }
        }
      );
    });
  });
}

// funzione che crea e aggiorna la tabella dei punti mondiale da ergast
function createPointsTable() {
  const url = "http://ergast.com/api/f1/2023/driverStandings.json";
  axios.get(url).then((response) => {
    const standings = response.data.MRData.StandingsTable.StandingsLists[0].DriverStandings;

    pool.execute(
      `
          CREATE TABLE IF NOT EXISTS points (
            position INT PRIMARY KEY,
            driver_name VARCHAR(255) NOT NULL,
            points INT NOT NULL,
            wins INT NOT NULL,
            driverId INT NOT NULL,
            UNIQUE (driverId),
            UNIQUE (position))
          `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella:", err);
        } else {
          console.log("Tabella dei punti creata con successo!");
        }
      }
    );
    standings.forEach((standing) => {
      if (standing.Driver.permanentNumber == 33) standing.Driver.permanentNumber = 1;
      pool.execute(
        `
            INSERT INTO points (position, driver_name, points, wins, driverId)
            VALUES (?,?,?,?,?)
            ON DUPLICATE KEY UPDATE driverId = VALUES(driverId), driver_name = VALUES(driver_name), points = VALUES(points), wins = VALUES(wins)
            `,
        [standing.position, standing.Driver.givenName + " " + standing.Driver.familyName, standing.points, standing.wins, standing.Driver.permanentNumber],
        (err) => {
          if (err) {
            console.error("Errore durante l'inserimento dei dati:", err);
          } else {
            console.log("Dati inseriti con successo!");
          }
        }
      );
    });
  });
};

//crea tabella autenticazione utenti
function createUsersTable() {
  pool.execute(
    `
    CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    UNIQUE (username))
  `,
    (err) => {
      if (err) {
        console.error("Errore durante la creazione della tabella:", err);
      } else {
        console.log("Tabella degli utenti creata con successo!");
      }
    }
  );
  //insert if not exist admin user
  argon2.hash("9899").then((hash) => {
    const criptedPassword = hash;
    pool.execute(
      `
      INSERT INTO users (username, password, role)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE username = VALUES(username), password = VALUES(password), role = VALUES(role)    `,
      ["giusbon", criptedPassword, "admin"],
      (err) => {
        if (err) {
          console.error("Errore durante l'inserimento dei dati:", err);
        } else {
          console.log("Dati inseriti con successo!");
        }
      }
    );
  });
}
async function insertUser(username, password) {  //ritorna false se già presente nel db, true se inserito con successo
  return new Promise((resolve, reject) => {
    argon2.hash(password).then((hash) => {
      const criptedPassword = hash;
      pool.execute(
        `
        INSERT INTO users (username, password, role)
        VALUES (?,?,?)
        `,
        [username, criptedPassword, "user"],
        (err) => {
          if (err) {
            console.error("Errore durante l'inserimento dei dati:", err);
            resolve(false);
          } else {
            console.log("Dati inseriti con successo!");
            resolve(true);
          }
        }
      );
    });
  });
}


async function queryUser(username) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM users WHERE username = ?
      `,
      [username],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dell'utente:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(result[0]);
          } else {
            console.log("Utente non trovato");
            resolve(null);
          }
        }
      }
    );
  });
}

async function verifyCredentials(username, password) {
  let res = await queryUser(username);
  console.log(res);
  let isCorrect = await verifyHash(password, res.password);
  if (isCorrect) {
    return true;
  }
  return false;
}

async function verifyHash(password, hash) {
  return await argon2.verify(hash, password).then((esito) => {
    if (esito) {
      console.log("Password corretta");
      return true;
    } else {
      console.log("Password errata");
      return false;
    }
  });
}

function verifyAdminAccess(username) {
  const connection = adminConnection();
  connection.query(
    `
    SELECT * FROM users WHERE username = ?
    `,
    [username],
    (err, result) => {
      if (err) {
        console.error("Errore durante la ricerca dell'amministratore:", err);
      } else {
        if (result.length > 0) {
          if (result[0].role == "admin") {
            return true;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
    }
  );
}

//funzione che crea il database dei coins di costo per ogni pilota
async function createCoinsTable() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      CREATE TABLE IF NOT EXISTS coins (
      driverId INT PRIMARY KEY,
      coins INT NOT NULL,
      UNIQUE (driverId))
    `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella:", err);
          reject(err);
        } else {
          console.log("Tabella dei coins creata con successo!");
          resolve(true);
        }
      }
    );
  });
}

async function insertCoins() {

  let pilot_values = {
    "1": 1500,
    "2": 50,
    "3": 100,
    "4": 500,
    "10": 80,
    "11": 1200,
    "14": 800,
    "16": 1000,
    "18": 200,
    "20": 60,
    "21": 10,
    "22": 150,
    "23": 300,
    "24": 100,
    "27": 100,
    "31": 150,
    "44": 1000,
    "55": 900,
    "63": 800,
    "77": 80,
    "81": 450
  };
  let wait = await createCoinsTable();
  if (wait) {
    for (let i = 0; i < Object.keys(pilot_values).length; i++) {
      pool.execute(
        `
        INSERT INTO coins (driverId, coins)
        VALUES (?,?)
        ON DUPLICATE KEY UPDATE driverId = VALUES(driverId), coins = VALUES(coins)
        `,
        [Object.keys(pilot_values)[i], Object.values(pilot_values)[i]],
        (err) => {
          if (err) {
            console.error("Errore durante l'inserimento dei dati:", err);
          } else {
            console.log("Punti inseriti con successo!");
          }
        }
      );
    }
  }
}

async function updateScore(newScore) {    //dove newScore è un oggetto con chiave l'id del pilota e valore il punteggio da aggiungere
  return new Promise((resolve, reject) => {
    for (let i = 0; i < Object.keys(newScore).length; i++) {
      pool.execute(
        `
      UPDATE coins SET coins = ? WHERE driverId = ?
      `,
        [Object.values(newScore)[i], Object.keys(newScore)[i]],
        (err) => {
          if (err) {
            console.error("Errore durante l'aggiornamento dei dati:", err);
            reject(err);
          } else {
            console.log("Punti aggiornati con successo!");
          }
        }
      );
    }
    resolve(true);
  });
}


async function createTeamTable() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      CREATE TABLE IF NOT EXISTS teams (
      teamId INT PRIMARY KEY,
      teamName VARCHAR(50) NOT NULL,
      idPilot1 INT NOT NULL,
      idPilot2 INT NOT NULL,
      score FLOAT NOT NULL,
      UNIQUE (teamId))
    `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella:", err);
          reject(err);
        } else {
          console.log("Tabella dei team creata con successo!");
          resolve(true);
        }
      }
    );
  });
}

async function insertTeam(userId, pilot1, pilot2, teamName) {
  return new Promise((resolve, reject) => {
    let idPilot1 = pilot1.driverId;
    let idPilot2 = pilot2.driverId;
    pool.execute(
      `
      INSERT INTO teams (teamId, teamName, idPilot1, idPilot2)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE teamId = VALUES(teamId), teamName = VALUES(teamName), idPilot1 = VALUES(idPilot1), idPilot2 = VALUES(idPilot2)
      `,
      [userId, teamName, idPilot1, idPilot2],
      (err) => {
        if (err) {
          console.error("Errore durante l'inserimento del team:", err);
          reject(err);
        } else {
          console.log("Team inserito con successo!");
          resolve(true);
        }
      }
    );
  });
}
async function getTeam(userId) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM teams WHERE teamId = ?
      `,
      [userId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca del team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            console.log("Team trovato con successo!");
            resolve(result[0]);
          } else {
            console.log("Team non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}
async function getTeams() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM teams
      `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            console.log("Team trovati con successo!");
            resolve(result);
          } else {
            console.log("Team non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

async function getUsersTeamScore(){
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM teams ORDER BY score DESC
      `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            console.log("Team trovati con successo!");
            resolve(result);
          } else {
            console.log("Team non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}













//esporta modulo
module.exports = {getTeams, getTeam, inizializeDatabase, insertUser, verifyAdminAccess, verifyCredentials, queryUser, getPilots, updateScore, insertTeam, getTeams };
