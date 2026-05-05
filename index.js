import express from 'express'
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { fileURLToPath } from 'url';

import Server from "./src/server.js"

const app = express();

const port = process.env.PORT || 3080;

const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = process.env.CLIENT_URL || `http://localhost:${port}`;
const isLocalhost = /localhost|127\.0\.0\.1/.test(clientUrl);
const cookieSecure = isProduction && !isLocalhost;
const cookieSameSite = cookieSecure ? 'none' : 'lax';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'Views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: process.env.DATABASE_URL,
    collectionName: 'sessions'
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite: cookieSameSite,
    maxAge: 1000 * 60 * 60 * 24,
  }
}));

app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.session?.user || null;
    res.locals.isActive = (pathPrefix) => req.path.startsWith(pathPrefix);

    next();
});

Server(app);

import { connectDataBase, closeDataBase } from './src/config/db.js';

const start = async () => {
    try {
        await connectDataBase();
        app.listen(3000, () => {
            console.log(`Servidor rodando: http://localhost:${3000}`);
        });
    } catch (error) {
        console.error(
            "Falha ao iniciar a aplicação. O servidor não será iniciado.",
            error,
        );
        process.exit(1);
    }
};

process.on("SIGINT", async () => {
    console.log("Recebido sinal de encerramento. Fechando conexões...");
    await closeDataBase();
    process.exit(0);
});

start();