
// Import dei pacchetti
const express = require('express');
const session = require('express-session');
const db = require('./db');

// Configurazione del server Express
const app = express();
app.set('view engine', 'ejs');
db.inizializeDatabase();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname+'/build'));
app.use(session({
    secret: 'segreto_segretissimo',
    resave: false,
    saveUninitialized: true,
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
    res.redirect('/teams');
});

app.get('/login', (req, res) => {
    res.render('login');
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log("username:", username);
    console.log("password:", password);
    try {
        // Verifica se l'utente esiste nel database
        let bool = await db.verifyCredentials(username, password);
        console.log("bool:", bool);
        if (!bool) {
            res.status(401).send('Nome utente o password errati, riprova.'); // 401 = Unauthorized
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
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    console.log("hasTeam:", hasTeam);
    if (hasTeam) {
        let team = await db.getTeam(userId);
        let members = await db.getMembersInfo(userId);
        let teams = await db.getTeams();
        console.log("Members:", members);
        res.render('user_dashboard', { team: team, teams: teams, hasTeam: hasTeam, members: members});
    }
    else {
        let teams = await db.getTeams();
        res.render('user_dashboard', { teams: teams, hasTeam: hasTeam, team: null, });
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


//registrazione di un nuovo utente
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Verifica se l'utente esiste già nel database
        const existingUser = await db.queryUser(username);
        if (existingUser && existingUser.length > 0) {
            return res.send('L\'utente esiste già.');
        }
        if (await db.insertUser(username, password)) {
            //return res.redirect('/thanks');
            //TODO: pagina di registrazione avvenuta con successo
        }
        else {
            res.send("Errore nella registrazione");
        }
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        res.status(500).send('Si è verificato un errore durante la registrazione.');
    }
});

app.get("/register", (req, res) => {  //TODO: pagina di registrazione in ejs
    res.render("register");
});

app.get("/team/create", requireAuth, async (req, res) => {
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    if (hasTeam) {
        res.redirect("/dashboard");
    }
    else {
        let maxCoinBudget = 2000;
        let pilots = await db.getPilotsValues();
        res.render("create_team", { pilots: pilots, maxCoinBudget: maxCoinBudget });
    }
} );

app.post("/team/create", requireAuth, async (req, res) => {
    let userId = req.session.userId;
    let hasTeam = await db.hasTeam(userId);
    if (!hasTeam) {
        let teamName = req.body.teamName;
        let pilots = req.body.pilots;
        console.log("pilots:", pilots);
        console.log("teamName:", teamName);
        let score = await db.calculateTeamScore(pilots);
        pilots= pilots.join(",");
        console.log("pilotsString :", pilots);  
        await db.insertTeam(userId, teamName, pilots, score);
    }
    res.redirect("/dashboard");
});
app.get("/pilot/:id", requireAuth, async (req, res) =>{
    let pilot = await db.getPilotInfo(req.params.id);
    res.render("pilot", {pilot: pilot});   //TODO: pilot template
});

app.get("/round/:r/pilot/:id", requireAuth, async (req, res) =>{
    let pilot = await db.getPilotInfo(req.params.id);
    let round = await db.getRoundInfo(req.params.r);
    res.render("pilot_round", {pilot: pilot, round: round});   //TODO: pilot template with round info and bonus
});
app.get("/round/:r", requireAuth, async (req, res) =>{
    let round = await db.getRoundInfo(req.params.r);
    res.render("round", {round: round});   //TODO: round template
});


////////////////////////////////////////////////////////////////////////////////////////////////////////
/*app.get("*", (req, res) => {
    res.render("404_not_found");
});*/
// Avvio del server
const port = 3000;
app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}`);
});
