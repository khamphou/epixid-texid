import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAll } from './modes/loader.js';
import { modesRouter } from './routes/modes.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*'}));

// Charger modes YAML
loadAll(path.resolve(__dirname, '../../shared/modes'));

app.use('/', modesRouter);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

import { attachGameSocket } from './sockets/game.socket.js';
attachGameSocket(io);

const PORT = process.env.PORT || 5180;
server.listen(PORT, ()=> console.log('[server] listening on', PORT));
