import express from 'express'

import path from 'path';
import { fileURLToPath } from 'url';

import Server from "./src/server.js"

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'Views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.session?.user || null;
    res.locals.isActive = (pathPrefix) => req.path.startsWith(pathPrefix);

    next();
});

Server(app);

const start = async () => {
    try {
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
    process.exit(0);
});

start();