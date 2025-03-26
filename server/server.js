const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
app.use(cors({
    origin: 'http://127.0.0.1:5500',
    methods: ['GET', 'POST'],
    credentials: true
}));
const io = new Server(server, {
    cors: {
        origin: 'http://127.0.0.1:5500',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mydwarf',
    password: 'iraldi11',
    port: 5433,
});

// Crear tabla con player_id, player_name y score
pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
        player_id VARCHAR(255) PRIMARY KEY,
        player_name VARCHAR(255) NOT NULL,
        score INT NOT NULL
    )
`).then(() => console.log('Tabla de puntajes lista'));

const players = {}; // Almacena posición y nombre: { id: { pos: {x, y}, name } }
const adsDatabase = {
    '0,0': [{ x: 100, y: 100, textureUrl: 'assets/ads/brand1.png' }],
    '1,0': [{ x: 700, y: 100, textureUrl: 'assets/ads/brand2.png' }],
    '0,1': [{ x: 100, y: 700, textureUrl: 'assets/ads/brand3.png' }]
};

function generateAdsForChunk(chunkKey) {
    if (!adsDatabase[chunkKey]) {
        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
        const chunkAds = [];
        const numAds = Math.floor(Math.random() * 5) + 1;
        const adTextures = ['brand1.png', 'brand2.png', 'brand3.png'];
        for (let i = 0; i < numAds; i++) {
            chunkAds.push({
                x: chunkX * 600 + Math.random() * 600 - 300,
                y: chunkY * 600 + Math.random() * 600 - 300,
                textureUrl: `assets/ads/${adTextures[Math.floor(Math.random() * adTextures.length)]}`
            });
        }
        adsDatabase[chunkKey] = chunkAds;
    }
    return adsDatabase[chunkKey];
}

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Recibir el nombre del jugador
    socket.on('setName', (name) => {
        players[socket.id] = { pos: { x: 0, y: 0 }, name };
        pool.query(
            'INSERT INTO scores (player_id, player_name, score) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO UPDATE SET player_name = $2, score = $3',
            [socket.id, name, 0]
        ).catch(err => console.error('Error al insertar nombre y puntaje:', err));
    });

    socket.on('playerMove', (pos) => {
        if (players[socket.id]) {
            players[socket.id].pos = pos;
        }
        io.emit('updatePlayers', players);
    });

    socket.on('requestAds', (chunks) => {
        const chunkAds = {};
        chunks.forEach(chunkKey => {
            chunkAds[chunkKey] = generateAdsForChunk(chunkKey);
        });
        socket.emit('updateAds', chunkAds);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
        console.log('Jugador desconectado:', socket.id);
    });
});

// Incrementar puntaje cada segundo
setInterval(() => {
    for (const id in players) {
        pool.query(
            'UPDATE scores SET score = score + 1 WHERE player_id = $1',
            [id]
        ).catch(err => console.error('Error al actualizar puntaje:', err));
    }
}, 1000);

// Enviar los 3 mejores jugadores cada 5 segundos
setInterval(() => {
    pool.query(
        'SELECT player_name, score FROM scores ORDER BY score DESC LIMIT 3'
    ).then(result => {
        io.emit('topPlayers', result.rows);
    }).catch(err => console.error('Error al obtener top jugadores:', err));
}, 5000);

server.listen(3000, () => console.log('Servidor corriendo en puerto 3000'));