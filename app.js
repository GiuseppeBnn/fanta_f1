
// Import dei pacchetti
const express = require('express');
const session = require('express-session');
const db = require('./db');
const e = require('express');

// Configurazione del server Express
const app = express();
app.set('view engine', 'ejs');
db.inizializeDatabase();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/build'));
app.use(express.json());
app.use(session({
    secret: 'segreto_segretissimo',
    resave: false,
    saveUninitialized: false,
}));

//controllo dell'autenticazione
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        // L'utente è autenticato, continua con la richiesta
        next();
    } else {
        // L'utente non è autenticato, reindirizza al login
        res.redirect('/login');
    }
}

// Middleware per verificare se l'utente è un amministratore
function requireAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        // L'utente è autenticato e ha il ruolo di amministratore, continua con la richiesta
        next();
    } else {
        // L'utente non è autenticato o non è un amministratore, reindirizza all'accesso o mostra un messaggio di errore
        res.status(403).send('Accesso negato. Solo gli amministratori possono accedere a questa risorsa.');
    }
}

//pagina principale del sito
app.get('/', (req, res) => {
    let isAuth = false;
    if (req.session && req.session.userId) {
        isAuth = true;
    }
    if (req.session && req.session.role === 'admin') {
        return res.render("index", { isAuth: isAuth , isAdmin: true});
    }
    return res.render("index", { isAuth: isAuth });
    
});

app.get('/login', (req, res) => {

    if (req.session && req.session.userId) {
        res.redirect('/dashboard');
    }
    else {
        let isAuth = false;
        res.render('login', { isAuth: isAuth });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Verifica se l'utente esiste nel database
        let bool = await db.verifyCredentials(username, password);
        if (!bool) {
            res.render('login', { error: 'Invalid credentials', isAuth: false });
            return;
        }
        let user = await db.queryUser(username);
        // Autenticazione riuscita, impostare la variabile di sessione per l'utente e il suo ruolo
        req.session.userId = user.id;
        req.session.role = user.role;

        if (user.role === 'admin') {
            // Reindirizza alla dashboard amministrativa se user è un amministratore
            res.redirect('/admin/dashboard');
        }
        else {
            // Reindirizza alla dashboard se user è un utente normale
            res.redirect('/dashboard');
        }

    } catch (error) {
        console.error('Errore durante il login:', error);
        res.status(500).send('Si è verificato un errore durante il login.');
    }

});

// Pagina della dashboard (accessibile solo agli utenti autenticati)
app.get('/dashboard', requireAuth, async (req, res) => {

    let isAuth = true;
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    let teams = await db.getTeams();
    if (hasTeam) {
        let team = await db.getTeam(userId);
        let teamPilotsScore =await db.retrieveTeamPilotsLastInfo(userId);
        res.render('user_dashboard', { team: team, teams: teams, hasTeam: hasTeam, isAuth: isAuth, teamPilotsScore: teamPilotsScore });
    }
    else {
        res.render('user_dashboard', { teams: teams, hasTeam: hasTeam, team: null, isAuth: isAuth });
    }

});

// Pagina dell'amministratore (accessibile solo agli amministratori)
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    const pilotValues = await db.getPilotsValues();
    res.render('admin_dashboard', { isAuth: true, isAdmin: true, pilotValues: pilotValues });
});

app.post('/change/values', requireAdmin, async (req, res) => {
    const pilotsKeys = Object.keys(req.body);
    const pilotsValues = Object.values(req.body);
    try {
        for (let i = 0; i < pilotsKeys.length; i++) {
            let pilotId = pilotsKeys[i].split("-")[1];
            let pilotValue = pilotsValues[i].split(" ")[0];
            let newScore = {};
            newScore[pilotId] = pilotValue;
            await db.updatePilotCoins(newScore);
        }
        return res.redirect('/admin/dashboard');
    } catch (error) {
        console.log(error);
        return res.status(500).send('Si è verificato un errore durante l\'aggiornamento dei valori dei piloti.');
    }
});
app.post('/admin/remove-user', requireAdmin, async (req, res) => {
    let userId = req.body.userId;
    let deleted = await db.deleteUser(userId);
    if (deleted) {
        return res.render('admin_dashboard', { isAuth: true, isAdmin: true, userInfo: "User " + userId + " and team deleted successfully" });
    }
    else {
        return res.render('admin_dashboard', { isAuth: true, isAdmin: true, userError: "Error while deleting user" });
    }
});
app.post('/admin/remove-team', requireAdmin, async (req, res) => {
    let teamId = req.body.teamId;
    let deleted = await db.deleteTeam(teamId);
    if (deleted) {
        return res.render('admin_dashboard', { isAuth: true, isAdmin: true, teamInfo: "Team " + teamId + " deleted successfully" });
    }
    else {
        return res.render('admin_dashboard', { isAuth: true, isAdmin: true, teamError: "Error while deleting team" });
    }
});

app.post('/admin/users', requireAdmin, async (req, res) => {
    console.log(req.body);
    let offset = req.body.offset;
    let limit = req.body.limit;
    let users = await db.getUsersList(offset, limit);
    return res.json(users);

});

app.get("/admin/search-users/:query", requireAdmin, async (req, res) => {
    let query = req.params.query;
    query = query.trim().split(" ")[0];
    try {
        let users = await db.searchUsers(query);
        return res.json(users);
    } catch (error) {
        console.log(error);
        return res.json([]);
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});
app.get('/thanks', (req, res) => {
    let isAuth = false;
    res.render('thanks', { isAuth: isAuth });
});


//registrazione di un nuovo utente
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Verifica se l'utente esiste già nel database
        const existingUser = await db.queryUser(username);
        if (existingUser && existingUser.username.length > 0) {
            return res.render('register', { error: 'Username already taken, try another', isAuth: false });
        }
        else if (await db.insertUser(username, password)) {
            return res.redirect('/thanks');
        }
        else {
            res.send("registration error");
        }
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        res.status(500).send('Si è verificato un errore durante la registrazione.');
    }
});

app.get("/register", (req, res) => {

    if (req.session && req.session.userId) {
        return res.redirect("/dashboard");
    }

    let isAuth = false;
    res.render("register", { isAuth: isAuth });
});

app.get("/team/create", requireAuth, async (req, res) => {
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    if (hasTeam) {
        res.redirect("/dashboard");
    }
    else {
        let maxCoinBudget = db.maxCoinBudget;
        let pilots = await db.getPilotsValues();
        res.render("create_team", { pilots: pilots, maxCoinBudget: maxCoinBudget, isAuth: true });
    }
});

app.post("/team/create", requireAuth, async (req, res) => {
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    if (!hasTeam) {
        let check = await db.checkTeamLegality(req.body.pilots);
        if (!check) {
            return res.redirect("/team/create");
        }
        let teamName = req.body.teamName;
        let pilots = req.body.pilots;
        let score = await db.calculateTeamScore(pilots);
        pilots = pilots.join(",");
        await db.insertTeam(userId, teamName, pilots, score);
    }
    res.redirect("/dashboard");
});
app.get("/pilot/:id", async (req, res) => {
    let pilotInfo = await db.retrievePilotAllInfo(req.params.id);
    res.render("pilot", { pilotInfo: pilotInfo });   //TODO: pilot template
});

/*
app.get("/round/:r", requireAuth, async (req, res) => {
    let round = await db.getRoundInfo(req.params.r);
    res.render("round", { round: round });   //TODO: round template
});*/
app.get("/team/", requireAuth, async (req, res) => {
    let userId = req.session.userId;
    if (req.session.role === "admin") {
        return res.redirect("/admin/dashboard");
    }
    let hasTeam = await db.hasTeam(userId);
    if (hasTeam) {
        let team = await db.getTeam(userId);
        let teamPilotsScore = await db.retrieveTeamPilotsLastInfo(userId);
        res.render("team", { team: team, isAuth: true, teamPilotsScore: teamPilotsScore });   //TODO: team template
    }
});
app.get("/team/:id", requireAuth, async (req, res) => {
    let teamId = req.params.id;
    let hasTeam = await db.hasTeam(teamId);
    if (hasTeam) {
        let team = await db.getTeam(teamId);
        let teamPilotsScore = await db.retrieveTeamPilotsLastInfo(teamId);
        res.render("team", { team: team, isAuth: true, teamPilotsScore: teamPilotsScore });   //TODO: team template
    }
});



////////////////////////////////////////////////////////////////////////////////////////////////////////
app.all("*", (req, res) => {
    if (req.session.userId) {
        res.render("not_found", { isAuth: true });
    }
    else {
        res.render("not_found", { isAuth: false });
    }

});
// Avvio del server
const port = 3000;
app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}`);
});
