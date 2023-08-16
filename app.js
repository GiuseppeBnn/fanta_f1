
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
    //res.redirect('/teams'); //TODO: creare pagina principale
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
        console.log("bool:", bool);
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
    if (hasTeam) {
        let team = await db.getTeam(userId);
        let members = await db.getMembersInfo(userId);
        let teams = await db.getTeams();
        res.render('user_dashboard', { team: team, teams: teams, hasTeam: hasTeam, members: members, isAuth: isAuth });
    }
    else {
        let teams = await db.getTeams();
        res.render('user_dashboard', { teams: teams, hasTeam: hasTeam, team: null, isAuth: isAuth });
    }

});

// Pagina dell'amministratore (accessibile solo agli amministratori)
app.get('/admin/dashboard', requireAdmin, (req, res) => {
    res.send(`<h1>Benvenuto nella dashboard amministrativa!</h1>`);
    //TODO aggiungere implementazione dashboard amministrativa
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
        let check=await db.checkTeamLegality(req.body.pilots);
        if(!check){
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
app.get("/pilot/:id", requireAuth, async (req, res) => {
    let pilot = await db.getPilotInfo(req.params.id);
    res.render("pilot", { pilot: pilot });   //TODO: pilot template
});

app.get("/round/:r/pilot/:id", requireAuth, async (req, res) => {
    let pilot = await db.getPilotInfo(req.params.id);
    let round = await db.getRoundInfo(req.params.r);
    res.render("pilot_round", { pilot: pilot, round: round });   //TODO: pilot template with round info and bonus
});
app.get("/round/:r", requireAuth, async (req, res) => {
    let round = await db.getRoundInfo(req.params.r);
    res.render("round", { round: round });   //TODO: round template
});


////////////////////////////////////////////////////////////////////////////////////////////////////////
app.all("*", (req, res) => {
    console.log("not found");
    if(req.session.userId){
        res.render("not_found", {isAuth: true});
    }
    else{
        res.render("not_found", {isAuth: false});
    }
    
});
// Avvio del server
const port = 3000;
app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}`);
});
