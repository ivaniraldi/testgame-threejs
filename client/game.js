// Core setup
const scene = new THREE.Scene();
const frustumSize = 600;
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    1, 1000
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const loader = new THREE.TextureLoader();
const playerTexture = loader.load('assets/sprites/player.png', undefined, undefined, (err) => {
    console.error('Failed to load player texture:', err);
});

// Esperar a que el usuario haga clic para iniciar
let player;
const startButton = document.getElementById('startButton');
startButton.addEventListener('click', () => {
    const playerName = prompt("Ingresa tu nombre:") || "Guest";
    player = createPlayer(playerName, 0, 0);
    scene.add(player);
    startButton.style.display = 'none'; // Ocultar botón tras iniciar
    animate(); // Iniciar animación
    connectToServer(playerName); // Conectar al servidor
});

// Resto del código sigue igual hasta la conexión al servidor
function connectToServer(playerName) {
    const socket = io('https://testgame-threejs.onrender.com', { reconnectionAttempts: 5 });
    socket.on('connect', () => socket.emit('setName', playerName));
    socket.on('connect_error', (err) => console.error('Connection failed:', err));

    // Configurar eventos de Socket.io
    socket.on('updatePlayers', (players) => {
        for (const id in players) {
            if (id === socket.id) continue;
            const { pos, name } = players[id];
            if (!otherPlayers.has(id)) {
                const otherPlayer = createPlayer(name, pos.x, pos.y);
                scene.add(otherPlayer);
                otherPlayers.set(id, otherPlayer);
            } else {
                otherPlayers.get(id).position.set(pos.x, pos.y, 0);
            }
        }
        for (const id of otherPlayers.keys()) {
            if (!players[id]) {
                scene.remove(otherPlayers.get(id));
                otherPlayers.delete(id);
            }
        }
    });

    socket.on('updateAds', (chunkAds) => {
        for (const chunkKey in chunkAds) {
            if (!ads.has(chunkKey)) ads.set(chunkKey, []);
            const adList = ads.get(chunkKey);
            chunkAds[chunkKey].forEach(adData => {
                const ad = createAd(adData);
                scene.add(ad);
                adList.push(ad);
            });
        }
    });

    socket.on('topPlayers', (topPlayers) => {
        const list = document.getElementById('top-list') || createTopListElement();
        list.innerHTML = topPlayers.map(p => `<li>${p.player_name}: ${p.score}</li>`).join('');
    });

    // Enviar posición del jugador
    window.sendPosition = () => {
        socket.emit('playerMove', { x: player.position.x, y: player.position.y });
    };

    // Solicitar anuncios
    window.requestAds = (chunks) => socket.emit('requestAds', chunks);
}

// Resto del código (createPlayer, createTextSprite, etc.) sigue igual...

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (keys['ArrowLeft']) player.position.x -= speed;
    if (keys['ArrowRight']) player.position.x += speed;
    if (keys['ArrowUp']) player.position.y += speed;
    if (keys['ArrowDown']) player.position.y -= speed;

    camera.position.set(player.position.x, player.position.y, 5);
    window.sendPosition(); // Enviar posición
    manageChunks(player.position.x, player.position.y);

    renderer.render(scene, camera);
}

// Chunk management
function manageChunks(playerX, playerY) {
    const playerChunkX = Math.floor(playerX / chunkSize);
    const playerChunkY = Math.floor(playerY / chunkSize);
    const chunksToRequest = [];
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const chunkKey = `${playerChunkX + dx},${playerChunkY + dy}`;
            if (!ads.has(chunkKey)) chunksToRequest.push(chunkKey);
        }
    }
    if (chunksToRequest.length) socket.emit('requestAds', chunksToRequest);

    const cleanDistance = chunkSize * 2;
    for (const [chunkKey, adList] of ads) {
        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
        const distance = Math.hypot(playerX - chunkX * chunkSize, playerY - chunkY * chunkSize);
        if (distance > cleanDistance) {
            adList.forEach(ad => scene.remove(ad));
            ads.delete(chunkKey);
        }
    }
}

// Controls
const keys = {};
const speed = 5;
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (keys['ArrowLeft']) player.position.x -= speed;
    if (keys['ArrowRight']) player.position.x += speed;
    if (keys['ArrowUp']) player.position.y += speed;
    if (keys['ArrowDown']) player.position.y -= speed;

    camera.position.set(player.position.x, player.position.y, 5);
    socket.emit('playerMove', { x: player.position.x, y: player.position.y });
    manageChunks(player.position.x, player.position.y);

    renderer.render(scene, camera);
}
animate();

// Window resize handler
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -frustumSize * aspect / 2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});