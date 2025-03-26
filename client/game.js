// Configuración de la escena
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

// Renderizador
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Cargar texturas
const loader = new THREE.TextureLoader();
const playerTexture = loader.load('assets/sprites/player.png');

// Pedir nombre al jugador
const playerName = prompt("Ingresa tu nombre:");

// Crear el jugador local
const playerGeometry = new THREE.PlaneGeometry(32, 32);
const playerMaterial = new THREE.MeshBasicMaterial({ map: playerTexture, transparent: true });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 0, 0);
scene.add(player);

// Añadir sprite de nombre al jugador local
function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = 'Bold 20px Arial';
    const width = context.measureText(text).width;
    canvas.width = width;
    canvas.height = 20;
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'white';
    context.fillText(text, 0, 20);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(width, 20, 1);
    return sprite;
}
const nameSprite = createTextSprite(playerName);
nameSprite.position.set(0, 32, 0); // Encima del jugador
player.add(nameSprite);

// Gestión de otros jugadores
const otherPlayers = new Map(); // Mapa de ID a { mesh, nameSprite }

// Gestión de publicidades
const ads = new Map();
const chunkSize = 600;

// Conexión al servidor con Socket.io
const socket = io('http://localhost:3000');

// Enviar el nombre al servidor al conectar
socket.on('connect', () => {
    socket.emit('setName', playerName);
});

// Enviar la posición del jugador al servidor
function sendPosition() {
    socket.emit('playerMove', { x: player.position.x, y: player.position.y });
}

// Recibir posiciones y nombres de otros jugadores
socket.on('updatePlayers', (players) => {
    for (const id in players) {
        if (id === socket.id) continue;
        const { pos, name } = players[id];
        if (!otherPlayers.has(id)) {
            const otherPlayerGeometry = new THREE.PlaneGeometry(32, 32);
            const otherPlayerMaterial = new THREE.MeshBasicMaterial({ map: playerTexture, transparent: true });
            const otherPlayer = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
            const otherNameSprite = createTextSprite(name);
            otherNameSprite.position.set(0, 32, 0);
            otherPlayer.add(otherNameSprite);
            scene.add(otherPlayer);
            otherPlayers.set(id, { mesh: otherPlayer, nameSprite: otherNameSprite });
        }
        const playerData = otherPlayers.get(id);
        playerData.mesh.position.set(pos.x, pos.y, 0);
    }
    for (const id of otherPlayers.keys()) {
        if (!players[id]) {
            const playerData = otherPlayers.get(id);
            scene.remove(playerData.mesh);
            otherPlayers.delete(id);
        }
    }
});

// Recibir publicidades del servidor
socket.on('updateAds', (chunkAds) => {
    for (const chunkKey in chunkAds) {
        if (!ads.has(chunkKey)) {
            ads.set(chunkKey, []);
        }
        const adList = ads.get(chunkKey);
        chunkAds[chunkKey].forEach(adData => {
            const adGeometry = new THREE.PlaneGeometry(32, 32);
            const adTexture = loader.load(adData.textureUrl);
            const adMaterial = new THREE.MeshBasicMaterial({ map: adTexture, transparent: true });
            const ad = new THREE.Mesh(adGeometry, adMaterial);
            ad.position.set(adData.x, adData.y, 0);
            scene.add(ad);
            adList.push(ad);
        });
    }
});

// Mostrar los 3 mejores jugadores
socket.on('topPlayers', (topPlayers) => {
    const list = document.getElementById('top-list');
    list.innerHTML = '';
    topPlayers.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.player_name}: ${player.score}`;
        list.appendChild(li);
    });
});

// Solicitar publicidades para los chunks cercanos
function requestAdsForChunks(playerX, playerY) {
    const playerChunkX = Math.floor(playerX / chunkSize);
    const playerChunkY = Math.floor(playerY / chunkSize);
    const chunksToRequest = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const chunkKey = `${playerChunkX + dx},${playerChunkY + dy}`;
            if (!ads.has(chunkKey)) {
                chunksToRequest.push(chunkKey);
            }
        }
    }
    if (chunksToRequest.length > 0) {
        socket.emit('requestAds', chunksToRequest);
    }
}

// Limpiar publicidades lejanas
function cleanDistantAds(playerX, playerY) {
    const cleanDistance = chunkSize * 2;
    for (const [chunkKey, adList] of ads) {
        const [chunkX, chunkY] = chunkKey.split(',').map(Number);
        const chunkCenterX = chunkX * chunkSize;
        const chunkCenterY = chunkY * chunkSize;
        const distance = Math.hypot(playerX - chunkCenterX, playerY - chunkCenterY);
        if (distance > cleanDistance) {
            adList.forEach(ad => scene.remove(ad));
            ads.delete(chunkKey);
        }
    }
}

// Controles
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

const speed = 5;

function animate() {
    requestAnimationFrame(animate);

    if (keys['ArrowLeft']) player.position.x -= speed;
    if (keys['ArrowRight']) player.position.x += speed;
    if (keys['ArrowUp']) player.position.y += speed;
    if (keys['ArrowDown']) player.position.y -= speed;

    camera.position.x = player.position.x;
    camera.position.y = player.position.y;

    sendPosition();
    requestAdsForChunks(player.position.x, player.position.y);
    cleanDistantAds(player.position.x, player.position.y);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -frustumSize * aspect / 2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});