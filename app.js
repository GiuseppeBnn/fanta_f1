
// Import dei pacchetti
const express = require('express');
const session = require('express-session');
const db = require('./db');

// Configurazione del server Express
const app = express();
app.set('view engine', 'ejs');
db.inizializeDatabase();
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'segreto_segretissimo',
    resave: false,
    saveUninitialized: true,
}));

// Funzione per il controllo dell'autenticazione
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        // L'utente è autenticato, continua con la richiesta
        next();
    } else {
        // L'utente non è autenticato, reindirizza all'accesso
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
    res.send(`
    <h1>Benvenuto in FF1!</h1>
    <a href="/login">Accedi</a><br>
    <a href="/register">Registrati</a>
    <a href="/info">Info</a>

    `);
});

// Pagina di accesso
app.get('/login', (req, res) => {
    res.send(`
    <h1>Pagina di Accesso</h1>
    <form method="POST" action="/login">
      <input type="text" name="username" placeholder="Nome Utente" required>
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Accedi</button>
    </form>
  `);
});

// Gestione del login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Verifica se l'utente esiste nel database
        let bool = await db.verifyCredentials(username, password);
        console.log("bool:", bool);
        if (!bool) {
            res.status(401).send('Nome utente o password errati.'); // 401 = Unauthorized
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
        let teams = await db.getTeams();
        res.render('user_dashboard', { team: team, teams: teams, hasTeam: hasTeam});
    }
    else {
        db.getTeams().then(teams => {
            res.render('user_dashboard', { teams: teams, hasTeam: hasTeam});
        });
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


// Rotta per la registrazione di un nuovo utente
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Verifica se l'utente esiste già nel database
        const existingUser = await db.queryUser(username);
        if (existingUser && existingUser.length > 0) {
            return res.send('L\'utente esiste già.');
        }
        if (await db.insertUser(username, password)) {
            return res.send('Registrazione completata con successo!');
        }
        else {
            res.send("Errore nella registrazione");
        }
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        res.status(500).send('Si è verificato un errore durante la registrazione.');
    }
});

app.get("/register", (req, res) => {
    res.send(`
    <h1>Pagina di Registrazione</h1>
    <form method="POST" action="/register">
        <input type="text" name="username" placeholder="Nome Utente" required>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Registrati</button>
    </form>
    `);
});

// Avvio del server
const port = 3000;
app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}`);
});
