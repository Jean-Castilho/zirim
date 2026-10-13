import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { fileURLToPath } from 'url';

import Server from "./src/server.js";
import { connectDataBase, closeDataBase } from './src/config/db.js';
import { errorMiddleware } from "./src/utils/handle-response.js";

const app = express();
const port = process.env.PORT || 3090;
const isProd = process.env.NODE_ENV === 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let httpServer;
let isShuttingDown = false;

// 1. Configurações de Template e Assets
app.set('trust proxy', 1); 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 2. Middlewares de Parseamento
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Configuração de Sessão e Cookies
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: process.env.DATABASE_URL,
    collectionName: 'sessions'
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // Estendido para 7 dias
  }
}));

// 4. Injeção de Variáveis de View (Locals)
app.use((req, res, next) => {
    Object.assign(res.locals, {
        currentPath: req.path,
        user: req.session?.user || null,
        isActive: (pathPrefix) => req.path.startsWith(pathPrefix)
    });
    next();
});

// 5. Inicialização de Rotas
Server(app);

// 6. Middleware de Erro Global
app.use(errorMiddleware);

// 7. Gerenciamento de Ciclo de Vida do Servidor
const start = async () => {
    try {
        await connectDataBase();
        httpServer = app.listen(port, () => {
            console.log(`Servidor rodando na porta: http://localhost:${port}`);
        });
    } catch (error) {
        console.error("Falha ao iniciar a aplicação.", error);
        process.exit(1);
    }
};


const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Encerrando aplicação (${signal}). Fechando conexões...`);

    try {
        if (httpServer?.listening) {
            await new Promise((resolve, reject) => {
                httpServer.close((error) => error ? reject(error) : resolve());
            });
        }

        await closeDataBase();
    } catch (error) {
        console.error('Erro ao encerrar a aplicação:', error);
        process.exitCode = 1;
    }
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start();