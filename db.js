const mysql = require("mysql2");
const axios = require("axios");
const argon2 = require("argon2");
const cron = require("node-cron");

const pool = createPool();
const maxCoinBudget = 2000;
let pilotsNicks = {};
let pilotsGlobalInfo = {};
let allRoundResults = [];
let pilotsAllRoundsResults = {};
let lastRoundNum;

async function cachePilotsGlobalInfo() {
  let pilots = await getPilots();
  pilots.forEach((pilot) => {
    if (pilot.permanentNumber == 33) pilot.permanentNumber = 1;
    pilotsGlobalInfo[pilot.permanentNumber] = pilot;
  });
}

function createPool() {
  let pool = mysql.createPool({
    host: "localhost",
    user: "admin",
    password: "admin",
    database: "ff1",
    waitForConnections: true,
    connectionLimit: 20,
  });
  return pool;
}

const inizializeDatabase = async () => {
  await setLastRoundNumber();
  await getPilotsNicks();
  await updateAllRoundsResultsCache();
  await updatePilotsAllRoundsResultsCache();
  await cachePilotsGlobalInfo();

  await newSeasonCleanup();
  await inizializePilotsTable();
  await insertPilots();

  //await createPointsTable();
  //await populatePointsTable();
  await createUsersTable();
  await insertCoins();
  await createTeamTable();
  await createBonusTable();
  await retrieveAllRoundResults();
  await insertTestStandings();

  insertTestUsers();

};


async function inizializePilotsTable() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `CREATE TABLE IF NOT EXISTS pilots (
        id INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        surname VARCHAR(255) NOT NULL,
        score VARCHAR(1000)
      )
  `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella:", err);
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });

}

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
            //console.log("Dati inseriti con successo!");
          }
        }
      );
    });
  });
}

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
        //console.log("Tabella degli utenti creata con successo!");
        insertAdmin();
        insertTestAccount();
      }
    }
  );
  function insertTestAccount() {
    //insert if not exist test user
    insertUser("test", "test");
  }

  function insertAdmin() {
    //insert if not exist admin user
    argon2.hash("admin").then((hash) => {
      const criptedPassword = hash;
      pool.execute(
        `
      INSERT INTO users (username, password, role)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE username = VALUES(username), password = VALUES(password), role = VALUES(role)    `,
        ["admin", criptedPassword, "admin"],
        (err) => {
          if (err) {
            console.error("Errore durante l'inserimento dei dati:", err);
          } else {
            //console.log("Dati inseriti con successo!");
          }
        }
      );
    });
  }
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
            //console.log("Dati inseriti con successo!");
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

function retrieveLastRoundResults() {
  return allRoundResults[lastRoundNum-1];
}

async function verifyCredentials(username, password) {
  let res = await queryUser(username);
  if (res == null) {
    return false;
  }
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
  pool.execute(
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
            //console.log("Punti inseriti con successo!");
          }
        }
      );
    }
  }
}

async function updatePilotCoins(newScore) {    //dove newScore è un oggetto con chiave l'id del pilota e valore il punteggio da aggiungere
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
            //console.log("Punti aggiornati con successo!");
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
      idPilots VARCHAR(50) NOT NULL,
      score FLOAT NOT NULL,
      UNIQUE (teamId))
    `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella:", err);
          reject(err);
        } else {
          //console.log("Tabella dei team creata con successo!");
          resolve(true);
        }
      }
    );
  });
}

async function insertTeam(userId, teamName, pilots, score) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      INSERT INTO teams (teamId, teamName, idPilots, score)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE teamId = VALUES(teamId), teamName = VALUES(teamName), idPilots = VALUES(idPilots), score = VALUES(score)
      `,
      [userId, teamName, pilots, score],
      (err) => {
        if (err) {
          console.error("Errore durante l'inserimento del team:", err);
          reject(err);
        } else {
          //console.log("Team inserito con successo!");
          resolve(true);
        }
      }
    );
  });
}


async function getTeam(userId) {
  console.log("Ricerca del team...", userId)
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
            //console.log("Team trovato con successo!");
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
      SELECT * FROM teams ORDER BY score DESC
      `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            //console.log("Team trovati con successo!");
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

async function createBonusTable() {    //da rimuovere
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      CREATE TABLE IF NOT EXISTS bonus (
        driverId INT PRIMARY KEY,
        positionGainedBonus INT,
        fastestLapBonus INT,
        UNIQUE (driverId))
      `,
      (err) => {
        if (err) {
          console.error("Errore durante la creazione della tabella bonus:", err);
          reject(err);
        } else {
          //console.log("Tabella dei bonus creata con successo!");
          resolve(true);
        }
      }
    );
  })
}

function calculateBonus(lastRoundResult) {
  let positionGainedBonus = calculatePositionGainedBonus(lastRoundResult);
  let fastestLapBonus = calculateFastestLapBonus(lastRoundResult);
  let bonus = {};
  for (let i = 0; i < Object.keys(positionGainedBonus).length; i++) {
    let driverId = Object.keys(positionGainedBonus)[i];
    bonus[driverId] = positionGainedBonus[driverId] + fastestLapBonus[driverId];
  }
  return bonus;
}
function calculatePositionGainedBonus(lastRoundResult) {  //ritorna un oggetto con chiave l'id del pilota e valore il punteggio da aggiungere
  let positionGainedBonus = {};
  let length = lastRoundResult.MRData.RaceTable.Races[0].Results.length;
  let results = lastRoundResult.MRData.RaceTable.Races[0].Results;
  for (let i = 0; i < length; i++) {
    let driverId = results[i].number;
    let positionGained = results[i].grid - results[i].position;
    positionGainedBonus[driverId] = positionGained * 2;
  }
  return positionGainedBonus;
}
function calculateFastestLapBonus(lastRoundResult) {  //ritorna un oggetto con chiave l'id del pilota e valore il punteggio da aggiungere
  let fastestLapBonus = {};
  let length = lastRoundResult.MRData.RaceTable.Races[0].Results.length;
  let results = lastRoundResult.MRData.RaceTable.Races[0].Results;
  for (let i = 0; i < length; i++) {
    let driverId = results[i].number;
    let fastestLapRank = 0;
    try {
      fastestLapRank = results[i].FastestLap.rank;
    } catch (err) { }
    if (fastestLapRank == 1) {
      fastestLapBonus[driverId] = 5;  //punteggio da rivedere
    }
    else {
      fastestLapBonus[driverId] = 0;
    }
  }
  return fastestLapBonus;
}

async function getRoundResult(roundNumber) {
  let RoundResult = await axios.get('http://ergast.com/api/f1/current/' + roundNumber + '/results.json');
  return RoundResult.data;
}

function calculateRacePointsScore(lastRoundResult) {
  let finalPositionScore = {};
  let results = lastRoundResult.MRData.RaceTable.Races[0].Results;
  for (let i = 0; i < results.length; i++) {
    let driverId = results[i].number;
    let points = results[i].points;
    finalPositionScore[driverId] = points;
  }
  return finalPositionScore;
}

async function updateScore(lastRoundResult) {   
  let lastRaceScore = calculateRacePointsScore(lastRoundResult);
  let bonus = calculateBonus(lastRoundResult);
  await updatePilotsScore(lastRaceScore, lastRoundResult);
  let teamsId = await getTeamsId();
  for (let i = 0; i < teamsId.length; i++) {
    let teamId = teamsId[i].teamId;
    let team = await getTeam(teamId);
    let idPilots = team.idPilots.split(",");
    let score = parseInt(team.score);
    for (let j = 0; j < idPilots.length; j++) {
      let pilotId = idPilots[j];
      score += parseInt(lastRaceScore[pilotId]) + parseInt(bonus[pilotId]);
    }
    pool.execute(
      `
      UPDATE teams SET score = ?
      WHERE teamId = ?
      `,
      [score, teamId],
      (err) => {
        if (err) {
          console.error("Errore durante l'aggiornamento del punteggio:", err);
        } else {
          //console.log("Punteggio aggiornato con successo!");
        }
      }
    );
  }
}
async function updatePilotsScore(lastRaceScore, lastRoundResult) {
  let positionGainedBonus = calculatePositionGainedBonus(lastRoundResult);
  let fastestLapBonus = calculateFastestLapBonus(lastRoundResult);
  return new Promise(async (resolve, reject) => {
    let pilotsId = await getPilotsId();
    for (let i = 0; i < pilotsId.length; i++) {
      let pilotId = pilotsId[i].id;
      let lastPilotScore = await getPilotScore(pilotId);
      let pilotRoundScore;
      if (typeof (lastRaceScore[pilotId]) != "undefined") {
        pilotRoundScore = lastRaceScore[pilotId] + "," + positionGainedBonus[pilotId] + "," + fastestLapBonus[pilotId] + ";";
      }
      else {
        pilotRoundScore = "0,0,0;";
      }
      if (lastPilotScore != null) {
        //console.log(lastPilotScore);
        pilotRoundScore = lastPilotScore + pilotRoundScore;
      }
      pool.execute(
        `
        UPDATE pilots SET score = ?
        WHERE id = ?
        `,
        [pilotRoundScore, pilotId],
        (err) => {
          if (err) {
            console.error("Errore durante l'aggiornamento del punteggio:", err);
            reject(err);
          }
          else {
            //console.log("Punteggio aggiornato con successo!");
          }
        });
    }
    resolve(true);
  });
}




async function getPilotScore(pilotId) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT score FROM pilots
      WHERE id = ?
        `,
      [pilotId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca del punteggio:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(result[0].score);
          } else {
            console.log("Punteggio non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

function sumScore(score) {
  let totalScore = 0;
  score = score.split(";");
  for (let i = 0; i < score.length; i++) {
    if (score[i] != "") {
      let roundScore = score[i].split(",");
      totalScore += parseInt(roundScore[0]) + parseInt(roundScore[1]) + parseInt(roundScore[2]);
    }
  }
  return totalScore;
}

async function getPilotTotalScore(pilotId) {    //ok
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT score FROM pilots
      WHERE id = ?

        `,
      [pilotId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca del punteggio:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            let score = result[0].score;
            let totalScore = sumScore(score);
            resolve(totalScore);
          } else {
            console.log("Punteggio non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}



async function updateRoundTotalScore(roundNumber) {
  let roundResult = await getRoundResult(roundNumber); 
  await updateScore(roundResult);
}

function weeklyUpdate(lastRoundNumber) {
  updateRoundTotalScore(lastRoundNumber);
  updateAllRoundsResultsCache();
  updatePilotsAllRoundsResultsCache();
}

async function retrieveAllRoundResults() {
  for (let i = 1; i <= parseInt(lastRoundNum); i++) {
    await updateRoundTotalScore(i);
  }
}
async function setLastRoundNumber() {
  let lastRound = await axios.get('http://ergast.com/api/f1/current/last/results.json');
  let lastRoundNumber = lastRound.data.MRData.RaceTable.round;
  lastRoundNum = lastRoundNumber;
}

async function getTeamsId() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT DISTINCT teamId FROM teams
        `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
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

 
async function hasTeam(userId) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM teams
      WHERE teamId = ?
        `,
      [userId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca del team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(true);
          } else {
            console.log("Team non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

async function getUserId(username) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT userId FROM users
      WHERE username = ?
        `,
      [username],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dell'utente:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(result[0].userId);
          } else {
            console.log("Utente non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

cron.schedule('0 0 0 * * 1', async () => {    // ogni lunedì controlla se è disponibile un nuovo risultato
  let newRoundNumber = await getLastRoundNumber();
  if (lastRoundNum < newRoundNumber) {
    await weeklyUpdate(newRoundNumber);
  }
  else if (newRoundNumber == 1) {
    await newSeasonCleanup();
    await inizializeDatabase();
  }
});


async function newSeasonCleanup() { // cancella e ripulisce tutte le table del database
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      DROP TABLE IF EXISTS pilots, points, users, coins, teams, bonus
        `,
      (err) => {
        if (err) {
          console.error("Errore durante la cancellazione delle tabelle:", err);
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}


async function getCoins() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM coins ORDER BY driverId ASC
        `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca delle coins:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(result);
          } else {
            console.log("Coins non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}
async function getPilotsTable() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM pilots ORDER BY id ASC
        `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei piloti:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            resolve(result);
          } else {
            console.log("Piloti non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}


async function getPilotsValues() {
  let pilots = await getPilotsTable();
  let coins = await getCoins();
  let pilotsValues = [];
  for (let i = 0; i < pilots.length; i++) {
    pilotsValues[i] = {};
    pilotsValues[i]["value"] = coins[i].coins;
    pilotsValues[i]["name"] = pilots[i].name;
    pilotsValues[i]["surname"] = pilots[i].surname;
    pilotsValues[i]["id"] = pilots[i].id;
    pilotsValues[i]["team"] = pilotsAllRoundsResults[pilots[i].id][0].Results[0].Constructor.name;
    pilotsValues[i]["constructorId"] = pilotsAllRoundsResults[pilots[i].id][0].Results[0].Constructor.constructorId;
   
  }
  return pilotsValues;
}

async function calculateTeamScore(pilots) {   //inutile
  let score = 0;

  for (let i = 0; i < pilots.length; i++) {
    let points = await getPilotTotalScore(pilots[i]);
    if (points) {
      score += parseInt(points);
    }
  }
  return score;
}

async function updatePilotsAllRoundsResultsCache() {
  let pilots = await getPilotsId();
  for (let i = 0; i < pilots.length; i++) {
    let pilotId = pilots[i].id;
    let pilotNick = pilotsNicks[pilotId];
    console.log(pilotNick);
    let data = await getPilotAllRoundsResults(pilotNick);
    pilotsAllRoundsResults[pilotId] = data;
  }
}

async function getAllRoundsResults() {
  const url = "http://ergast.com/api/f1/current/results.json?limit=1000";
  try {
    const response = await axios.get(url);
    const driversData = response.data.MRData.RaceTable.Races;
    return driversData;
  } catch (error) {
    console.error("Errore durante la richiesta all round:", error.message);
  }
}

async function updateAllRoundsResultsCache() {
  allRoundResults = await getAllRoundsResults();
}



async function checkTeamLegality(pilots) {
  let coins = 0;
  let pilotsValues = await getCoins();
  for (let i = 0; i < pilots.length; i++) {
    for (let j = 0; j < pilotsValues.length; j++) {
      if (pilotsValues[j].driverId == pilots[i]) {
        coins += parseInt(pilotsValues[j].coins);
      }
    }
  }
  return coins <= maxCoinBudget;
}

async function insertTestStandings() {
  insertTeam(1, "teamN." + 1, "1,4", await calculateTeamScore(["1", "4"]));
}

async function getPilotsId() {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT id FROM pilots
        `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei piloti:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            //console.log("Piloti trovati con successo!");
            resolve(result);
          } else {
            console.log("Piloti non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

async function getTeamsSinglePilotsPoints(teamId) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT idPilots FROM teams
      WHERE teamId = ?
        `,
      [teamId],
      async (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei membri del team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            let membersArray = result[0].idPilots.split(",");
            let membersData = {};
            for (let i = 0; i < membersArray.length; i++) {
              membersData[membersArray[i]] = {};
              //console.log("membersArray[i]:", membersArray[i]);
              membersData[membersArray[i]] = await getPilotTotalScore(membersArray[i]);
              //console.log("membersData[i]:", membersData[membersArray[i]]);
            }
            resolve(membersData);
          } else {
            console.log("Membri del team non presenti nel database!");
            resolve(false);
          }
        }

      }
    );

  });
}

async function getPilotsNicks() {
  let pilotsData = await getPilots();
  for (let i = 0; i < pilotsData.length; i++) {
    if (pilotsData[i].permanentNumber == 33) {
      pilotsData[i].permanentNumber = 1;
    }
    pilotsNicks[pilotsData[i].permanentNumber] = pilotsData[i].driverId;
  }
}

async function getPilotAllRoundsResults(pilotNick) {
  const url = "http://ergast.com/api/f1/current/drivers/"+pilotNick+"/results.json?limit=1000";
  console.log(url);
  try {
    const response = await axios.get(url);
    const driversData = response.data.MRData.RaceTable.Races;
    return driversData;
  } catch (error) {
    console.error("Errore durante la richiesta pilot all round res:", error.message);
  }

}

async function retrievePilotAllInfo(pilotId) {
  let pilotScore = await getPilotScore(pilotId);
  let pilotTotalScore = sumScore(pilotScore);
  let pilotStrippedScore = pilotScore.split(";");
  let pilotPointsForRound = [];
  for (let i = 0; i < pilotStrippedScore.length; i++) {
    if (pilotStrippedScore[i] != "") {
      let roundScore = pilotStrippedScore[i].split(",");
      pilotPointsForRound[i] = {};
      pilotPointsForRound[i]["round"] = i + 1;
      pilotPointsForRound[i]["roundName"]=pilotsAllRoundsResults[pilotId][i]["raceName"];
      pilotPointsForRound[i]["id"] = pilotId;
      pilotPointsForRound[i]["name"] = pilotsGlobalInfo[pilotId].givenName;
      pilotPointsForRound[i]["surname"] = pilotsGlobalInfo[pilotId].familyName;
      pilotPointsForRound[i]["points"] = roundScore[0];
      pilotPointsForRound[i]["positionGainedBonus"] = roundScore[1];
      pilotPointsForRound[i]["fastestLapBonus"] = roundScore[2];
      pilotPointsForRound[i]["total"] = parseInt(roundScore[0]) + parseInt(roundScore[1]) + parseInt(roundScore[2]);
      pilotPointsForRound[i]["roundResult"] = {};
      pilotPointsForRound[i]["roundResult"] = pilotsAllRoundsResults[pilotId][i]["Results"][0];
      pilotPointsForRound[i]["totalScore"] = pilotTotalScore;
    }

  }
  return pilotPointsForRound;
  

}

async function retrievePilotLastBonuses(pilotId) {
  let pilotScore = await getPilotScore(pilotId);
  let pilotTotalScore = sumScore(pilotScore);
  let pilotStrippedScore = pilotScore.split(";");
  let pilotPointsForRound = [];
  if (pilotStrippedScore != "") {
    let roundScore = pilotStrippedScore[pilotStrippedScore.length - 2].split(",");
    pilotPointsForRound = {};
    pilotPointsForRound["id"] = pilotId;
    pilotPointsForRound["constructor"]=pilotsAllRoundsResults[pilotId][pilotsAllRoundsResults[pilotId].length-1]["Results"][0].Constructor;
    pilotPointsForRound["name"] = pilotsGlobalInfo[pilotId].givenName;
    pilotPointsForRound["surname"] = pilotsGlobalInfo[pilotId].familyName;
    pilotPointsForRound["points"] = roundScore[0];
    pilotPointsForRound["positionGainedBonus"] = roundScore[1];
    pilotPointsForRound["fastestLapBonus"] = roundScore[2];
    pilotPointsForRound["total"] = parseInt(roundScore[0]) + parseInt(roundScore[1]) + parseInt(roundScore[2]);
    pilotPointsForRound["round"] = pilotStrippedScore.length;
    pilotPointsForRound["roundName"]=pilotsAllRoundsResults[pilotId][pilotsAllRoundsResults[pilotId].length-1]["raceName"];
    pilotPointsForRound["roundInfo"]=pilotsAllRoundsResults[pilotId][pilotsAllRoundsResults[pilotId].length-1]["Circuit"];
    pilotPointsForRound["totalScore"] = pilotTotalScore;
  }

  return pilotPointsForRound;

}


async function retrieveTeamPilotsLastInfo(teamId) {
  let teamPilots = await getMembers(teamId);
  let teamPilotsInfo = [];
  for (let i = 0; i < teamPilots.length; i++) {
    let pilotPointsForRound = await retrievePilotLastBonuses(teamPilots[i]);
    teamPilotsInfo[i] = {};
    teamPilotsInfo[i] = pilotPointsForRound;
  }
  return teamPilotsInfo;
}

async function getMembers(teamId) {

  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT idPilots FROM teams
      WHERE teamId = ?

        `,
      [teamId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dei membri del team:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            //console.log("Membri del team trovati con successo!");
            resolve(result[0].idPilots.split(","));
          } else {
            console.log("Membri del team non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}


////////////////////////
//ADMIN FUNCTIONS///
///////////////////////
async function deleteUser(userId) {
  isAdministrator = await isAdmin(userId);
  if (isAdministrator) {
    return false;
  }
  else {
    if (await deleteTeam(userId)) {
      return new Promise((resolve, reject) => {
        pool.execute(
          `
      DELETE FROM users
      WHERE id = ?
        `,
          [userId],
          (err) => {
            if (err) {
              console.error("Errore durante la cancellazione dell'utente:", err);
              reject(false);
            } else {
              resolve(true);
            }
          }
        );
      });
    }
    else {
      return false;
    }
  }
}
async function deleteTeam(teamId) {
  isAdministrator = await isAdmin(teamId);
  if (isAdministrator) {
    return false;
  }
  else {
    return new Promise((resolve, reject) => {
      pool.execute(
        `
      DELETE FROM teams
      WHERE teamId = ?
        `,
        [teamId],
        (err) => {
          if (err) {
            console.error("Errore durante la cancellazione del team:", err);
            reject(false);
          } else {
            resolve(true);
          }
        }
      );
    });
  }
}

async function isAdmin(userId) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM users
      WHERE id = ?
        `,
      [userId],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dell'utente:", err);
          reject(false);
        } else {
          if (result.length > 0) {
            if (result[0].role == "admin") {
              resolve(true);
            }
            else {
              resolve(false);
            }
          } else {
            console.log("Utente non presente nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}
async function getUsersList(offset, limit) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT id, username, role FROM users
      LIMIT ${limit} OFFSET ${offset}
        `,
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca degli utenti:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            //console.log("Utenti trovati con successo!");
            resolve(result);
          } else {
            console.log("Utenti non presenti nel database!");
            resolve(false);
          }
        }
      }
    );
  });
}

async function searchUsers(username) {
  return new Promise((resolve, reject) => {
    pool.execute(
      `
      SELECT * FROM users
      WHERE username LIKE ? OR username LIKE ? OR username LIKE ?
        `,
      [username + "%", "%" + username, "%" + username + "%"],
      (err, result) => {
        if (err) {
          console.error("Errore durante la ricerca dell'utente:", err);
          reject(err);
        } else {
          if (result.length > 0) {
            //console.log("Utente trovato con successo!");
            resolve(result);
          } else {
            console.log("Utente non presente nel database!");
            resolve(false);
          }
        }
      }
    );

  });
}
function insertTestUsers() {
  for (let i = 0; i < 10; i++) {
    insertUser("testUser" + i, "testPassword" + i);
  }
}



//esporta modulo
module.exports = { retrieveLastRoundResults,retrievePilotAllInfo,retrievePilotLastBonuses, updatePilotCoins, searchUsers, getUsersList, deleteUser, deleteTeam, retrieveTeamPilotsLastInfo, getTeamsSinglePilotsPoints, getPilotTotalScore, getPilotScore, checkTeamLegality, maxCoinBudget, calculateTeamScore, getPilotsValues, getUserId, hasTeam, retrieveAllRoundResults, weeklyUpdate, updateRoundTotalScore, getTeams, getTeam, inizializeDatabase, insertUser, verifyAdminAccess, verifyCredentials, queryUser, getPilots, updateScore, insertTeam, getTeams };
