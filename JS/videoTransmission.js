import { CONFIG } from './Config.js';

// Variables globales
let socket = null;
let isStreamActive = false;
let connectionStatusInterval = null;

// Inicializar la transmisión de video
export function initializeVideoStream() {
    try {
        console.log("Intentando conectar a:", CONFIG.CAMERA.WS_URL);
        // Inicializar Socket.IO connection
        socket = io(CONFIG.CAMERA.WS_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        // Configurar el canvas para mostrar el video
        const canvas = document.getElementById('local-video');
        if (!canvas) {
            console.error('No se encontró el elemento canvas con id "local-video"');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        // Manejar recepción de frames de video
        socket.on('video_frame', (data) => {
            if (isStreamActive && data && data.frame) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                };
                img.src = 'data:image/jpeg;base64,' + data.frame;
                
                // Actualizar estadísticas
                const statsOverlay = document.getElementById('statsOverlay');
                if (statsOverlay) {
                    statsOverlay.textContent = `FPS: ${data.fps || 0} | Resolución: ${data.width || 0}x${data.height || 0}`;
                }
            }
        });
        
        // Eventos de conexión
        socket.on('connect', () => {
            console.log('Conectado al servidor de video con ID:', socket.id);
            updateConnectionStatus('connected');
            document.getElementById('video-call-div').style.display = 'block';
            logMessage('Conectado al servidor de video');
        });
        
        socket.on('disconnect', () => {
            console.log('Desconectado del servidor de video');
            updateConnectionStatus('disconnected');
            
            // Agregar entrada al registro
            const logContainer = document.getElementById('logContainer');
            if (logContainer) {
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                const logEntry = `[${timestamp}] Desconectado del servidor de video`;
                
                const logLine = document.createElement('div');
                logLine.textContent = logEntry;
                logLine.style.color = '#ff6b6b';
                
                logContainer.appendChild(logLine);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });
        
        socket.on('connection_status', (data) => {
            updateConnectionStatus(data.status);
        });
        
        socket.on('stream_status', (data) => {
            if (data.status === 'started') {
                isStreamActive = true;
                document.getElementById('Figura-Transmision').style.display = 'none';
                document.getElementById('local-video').style.display = 'block';
                
                // Agregar entrada al registro
                const logContainer = document.getElementById('logContainer');
                if (logContainer) {
                    const now = new Date();
                    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                    const logEntry = `[${timestamp}] Transmisión de video iniciada`;
                    
                    const logLine = document.createElement('div');
                    logLine.textContent = logEntry;
                    
                    logContainer.appendChild(logLine);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            } else if (data.status === 'stopped') {
                isStreamActive = false;
                document.getElementById('Figura-Transmision').style.display = 'block';
                document.getElementById('local-video').style.display = 'none';
                
                // Limpiar el canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Agregar entrada al registro
                const logContainer = document.getElementById('logContainer');
                if (logContainer) {
                    const now = new Date();
                    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                    const logEntry = `[${timestamp}] Transmisión de video detenida`;
                    
                    const logLine = document.createElement('div');
                    logLine.textContent = logEntry;
                    
                    logContainer.appendChild(logLine);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            }
        });
        
        socket.on('error', (error) => {
            console.error('Error en la conexión de video:', error);
            updateConnectionStatus('disconnected');
            
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) {
                errorMsg.textContent = 'Error en la conexión: ' + error;
                errorMsg.style.display = 'block';
            }
            
            // Agregar entrada al registro
            const logContainer = document.getElementById('logContainer');
            if (logContainer) {
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                const logEntry = `[${timestamp}] Error en la conexión: ${error}`;
                
                const logLine = document.createElement('div');
                logLine.textContent = logEntry;
                logLine.style.color = '#ff6b6b';
                
                logContainer.appendChild(logLine);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });
        
        // Iniciar verificación periódica del estado de conexión
        startConnectionCheck();
        
    } catch (error) {
        console.error('Error al inicializar la transmisión de video:', error);
        
        // Agregar entrada al registro
        const logContainer = document.getElementById('logContainer');
        if (logContainer) {
            const now = new Date();
            const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            const logEntry = `[${timestamp}] Error al inicializar la transmisión de video: ${error}`;
            
            const logLine = document.createElement('div');
            logLine.textContent = logEntry;
            logLine.style.color = '#ff6b6b';
            
            logContainer.appendChild(logLine);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }
}

// Iniciar verificación periódica del estado de conexión
function startConnectionCheck() {
    // Verificar el estado de conexión cada 5 segundos
    if (connectionStatusInterval) {
        clearInterval(connectionStatusInterval);
    }
    
    connectionStatusInterval = setInterval(() => {
        if (socket) {
            updateConnectionStatus(socket.connected ? 'connected' : 'disconnected');
        }
    }, 5000);
}

// Actualizar indicador visual del estado de conexión
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.className = 'connection-status ' + status;
        statusElement.textContent = status === 'connected' ? 'Conectado' : 'Desconectado';
    }
}

// Iniciar transmisión de video
export function startVideoStream() {
    if (!socket || !socket.connected) {
        console.log('No hay conexión con el servidor. Reconectando...');
        socket.connect();
        setTimeout(startVideoStream, 1000);
        return;
    }
    
    isStreamActive = true;
    console.log('Enviando solicitud para iniciar la cámara...');
    
    // Agregar entrada al registro
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = `[${timestamp}] Iniciando transmisión de video...`;
        
        const logLine = document.createElement('div');
        logLine.textContent = logEntry;
        
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // Usar Socket.IO para iniciar el stream
    socket.emit('start_stream', { 
        quality: 80,
        width: 640,
        height: 480,
        fps: 30
    }, (response) => {
        if (response && response.success) {
            console.log('Transmisión de video iniciada correctamente');
        } else {
            console.error('Error al iniciar la transmisión');
            
            // Agregar entrada al registro
            if (logContainer) {
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                const logEntry = `[${timestamp}] Error al iniciar la transmisión`;
                
                const logLine = document.createElement('div');
                logLine.textContent = logEntry;
                logLine.style.color = '#ff6b6b';
                
                logContainer.appendChild(logLine);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
    });
}

// Detener transmisión de video
export function stopVideoStream() {
    if (!socket || !socket.connected) {
        console.log('No hay conexión con el servidor');
        return;
    }
    
    isStreamActive = false;
    console.log('Enviando solicitud para detener la cámara...');
    
    // Agregar entrada al registro
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = `[${timestamp}] Deteniendo transmisión de video...`;
        
        const logLine = document.createElement('div');
        logLine.textContent = logEntry;
        
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // Usar Socket.IO para detener el stream
    socket.emit('stop_stream', (response) => {
        if (response && response.success) {
            console.log('Transmisión de video detenida correctamente');
        } else {
            console.error('Error al detener la transmisión');
            
            // Agregar entrada al registro
            if (logContainer) {
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                const logEntry = `[${timestamp}] Error al detener la transmisión`;
                
                const logLine = document.createElement('div');
                logLine.textContent = logEntry;
                logLine.style.color = '#ff6b6b';
                
                logContainer.appendChild(logLine);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
    });
}

// Función para obtener la instancia de socket (para compartir con otros módulos)
export function getSocketInstance() {
    return socket;
}

// Función para registrar mensajes en el log visual
export function logMessage(message, isError = false) {
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = `[${timestamp}] ${message}`;
        
        const logLine = document.createElement('div');
        logLine.textContent = logEntry;
        if (isError) {
            logLine.style.color = '#ff6b6b';
        }
        
        logContainer.appendChild(logLine);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Limitar el número de entradas de registro
        while (logContainer.children.length > 100) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
}