// motoresUni.js - Adaptado para usar Socket.IO con el servidor integrado y dos Arduinos
import { CONFIG } from './Config.js';

// SERVO MOTORES
import { setupServoControls, handleServoResponse, updateServoAngle } from './servo.js';

// Re-exportar setupServoControls para que sea accesible desde afuera
export { setupServoControls };

// Variable global para la conexión Socket.IO
let motorSocket = null;

// Exponer la instancia de socket para que servo.js pueda usarla
export function getSocketInstance() {
    return motorSocket;
}

// Variables para control de teclas
let keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// Inicializar la conexión Socket.IO para motores y servos
export function initMotorControl() {
    try {
        console.log("Intentando conectar al control de motores y servos:", CONFIG.MOTOR.WS_URL);
        
        // Usar una única conexión Socket.IO compartida para motores y servos
        motorSocket = io(CONFIG.MOTOR.WS_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        console.log("Conexión de control inicializada");
        
        motorSocket.on('connect', () => {
            console.log('Conectado al control con ID:', motorSocket.id);
            logMessage('Conectado al servidor. Inicializando dispositivos...');
            
            // Solicitar estado actual de los dispositivos
            requestDeviceStatus();
        });
        
        // Configurar eventos para recibir estados de motores
        motorSocket.on('motor_status', (status) => {
            console.log('Recibido estado de motores:', status);
            updateMotorDisplay(status);
        });
        
        // Configurar eventos para recibir estados de servos
        motorSocket.on('servo_status', (data) => {
            console.log('Recibido estado de servos:', data);
            handleServoResponse(data);
        });
        
        // Configurar eventos para actualizaciones de ángulo de servo
        motorSocket.on('servo_angle', (data) => {
            console.log('Recibido ángulo de servo:', data);
            if (data && data.servo_type && data.angle !== undefined) {
                updateServoAngle(data.servo_type, data.angle);
            }
        });
        
        // Evento para confirmación de detención de servo
        motorSocket.on('servo_stopped', (data) => {
            if (data && data.servo_type) {
                window.logMessage(`Servo ${data.servo_type} detenido correctamente`);
            }
        });
        
        // Evento para conocer el estado de conexión de los Arduinos
        motorSocket.on('arduino_status', (status) => {
            const motorsConnected = status.motors_connected;
            const servosConnected = status.servos_connected;
            
            // Actualizar indicadores de estado en la interfaz
            updateArduinoConnectionStatus(motorsConnected, servosConnected);
            
            // Registrar en el log
            logMessage(`Arduino de motores: ${motorsConnected ? 'Conectado' : 'Desconectado'}`);
            logMessage(`Arduino de servos: ${servosConnected ? 'Conectado' : 'Desconectado'}`);
        });
        
        // Manejar errores de conexión
        motorSocket.on('connect_error', (error) => {
            console.error("Error de conexión:", error);
            logMessage("Error de conexión con el servidor", true);
        });
        
        motorSocket.on('disconnect', () => {
            console.error("Desconectado del servidor");
            logMessage("Desconectado del servidor", true);
            
            // Actualizar interfaz para mostrar desconexión
            updateArduinoConnectionStatus(false, false);
        });
        
    } catch (error) {
        console.error("Error al inicializar control:", error);
        logMessage("Error al inicializar control: " + error, true);
    }
}

// Solicitar estado actual de los dispositivos
function requestDeviceStatus() {
    if (!motorSocket || !motorSocket.connected) {
        console.error('No hay conexión con el servidor');
        return;
    }
    
    // Solicitar estado de los Arduinos
    motorSocket.emit('device_status_request', {}, (response) => {
        if (response) {
            updateArduinoConnectionStatus(
                response.motors_connected,
                response.servos_connected
            );
            
            // Actualizar log con el estado
            logMessage(`Estado de conexión - Motores: ${response.motors_connected ? 'OK' : 'No conectado'}`);
            logMessage(`Estado de conexión - Servos: ${response.servos_connected ? 'OK' : 'No conectado'}`);
        }
    });
    
    // Solicitar estado actual de los motores
    motorSocket.emit('motor_status_request', {}, (response) => {
        if (response && response.status) {
            updateMotorDisplay(response.status);
        }
    });
    
    // Solicitar estado actual de los servos
    motorSocket.emit('servo_status_request', {}, (response) => {
        if (response && response.status) {
            handleServoResponse({ status: response.status });
        }
    });
}

// Actualizar indicadores de estado de conexión en la interfaz
function updateArduinoConnectionStatus(motorsConnected, servosConnected) {
    // Puedes agregar elementos en el HTML para mostrar esto visualmente
    const connectionStatusDiv = document.getElementById('connection-status');
    
    if (connectionStatusDiv) {
        if (motorsConnected && servosConnected) {
            connectionStatusDiv.textContent = 'Conectado (Motores y Servos)';
            connectionStatusDiv.className = 'connection-status connected';
        } else if (motorsConnected) {
            connectionStatusDiv.textContent = 'Conectado (Solo Motores)';
            connectionStatusDiv.className = 'connection-status partial';
        } else if (servosConnected) {
            connectionStatusDiv.textContent = 'Conectado (Solo Servos)';
            connectionStatusDiv.className = 'connection-status partial';
        } else {
            connectionStatusDiv.textContent = 'Desconectado';
            connectionStatusDiv.className = 'connection-status disconnected';
        }
    }
    
    // También podemos actualizar la visibilidad de los controles según disponibilidad
    const motorControls = document.getElementById('direction-controls');
    const servoControls = document.getElementsByClassName('servo-control');
    
    if (motorControls) {
        motorControls.style.display = motorsConnected ? 'grid' : 'none';
    }
    
    if (servoControls && servoControls.length > 0) {
        for (let i = 0; i < servoControls.length; i++) {
            servoControls[i].classList.toggle('disabled', !servosConnected);
        }
    }
}

// Actualizar la visualización del estado de los motores en la interfaz
function updateMotorDisplay(status) {
    const mode = status.mode;
    let displayText = `Modo: ${mode.charAt(0).toUpperCase() + mode.slice(1)}\n`;
    
    if (mode === 'off') {
        displayText += 'Motores apagados';
    } else {
        for (let i = 1; i <= 4; i++) {
            const motor = status[`motor${i}`];
            displayText += `M${i}: ${motor.speed} (${motor.direction})\n`;
        }
    }
    
    // Actualizar el elemento de visualización
    const motorDisplayText = document.getElementById('motorDisplayText');
    if (motorDisplayText) {
        motorDisplayText.textContent = displayText;
    }
    
    // Activar/desactivar controles direccionales según el estado
    const directionControls = document.getElementById('direction-controls');
    if (directionControls) {
        directionControls.style.display = (mode !== 'off') ? 'grid' : 'none';
    }
}

// Enviar comando desde la interfaz de usuario (botón ON Motores)
export function sendMotorControlFromUI() {
    const selectedTransmission = document.querySelector('input[name="transmission"]:checked');
    
    if (!selectedTransmission) {
        alert("Por favor, selecciona un modo de transmisión.");
        return;
    }
    
    const transmissionMode = selectedTransmission.value;
    
    if (transmissionMode === 'synchronized') {
        const selectedSpeed = document.querySelector('input[name="speed"]:checked');
        const reverse = document.querySelector('input[name="sync-checkbox"]')?.checked || false;
        
        if (!selectedSpeed) {
            alert("Por favor, selecciona una velocidad.");
            return;
        }
        
        const speed = getSpeedValue(selectedSpeed.value);
        sendMotorCommand('synchronized', speed, null, reverse);
    } 
    else if (transmissionMode === 'differential') {
        const selectedSpeed1 = document.querySelector('input[name="speed1"]:checked');
        const selectedSpeed2 = document.querySelector('input[name="speed2"]:checked');
        const reverse1 = document.querySelector('input[name="diff-checkbox1"]')?.checked || false;
        const reverse2 = document.querySelector('input[name="diff-checkbox2"]')?.checked || false;
        
        if (!selectedSpeed1 || !selectedSpeed2) {
            alert("Por favor, selecciona una velocidad para cada par de motores.");
            return;
        }
        
        sendMotorCommand('differential', 
            getSpeedValue(selectedSpeed1.value), 
            getSpeedValue(selectedSpeed2.value),
            reverse1,
            reverse2
        );
    } 
    else if (transmissionMode === 'independent') {
        const selectedSpeed1 = document.querySelector('input[name="speed1"]:checked');
        const selectedSpeed2 = document.querySelector('input[name="speed2"]:checked');
        const selectedSpeed3 = document.querySelector('input[name="speed3"]:checked');
        const selectedSpeed4 = document.querySelector('input[name="speed4"]:checked');
        
        const reverse1 = document.querySelector('input[name="ind-checkbox1"]')?.checked || false;
        const reverse2 = document.querySelector('input[name="ind-checkbox2"]')?.checked || false;
        const reverse3 = document.querySelector('input[name="ind-checkbox3"]')?.checked || false;
        const reverse4 = document.querySelector('input[name="ind-checkbox4"]')?.checked || false;
        
        if (!selectedSpeed1 || !selectedSpeed2 || !selectedSpeed3 || !selectedSpeed4) {
            alert("Por favor, selecciona una velocidad para cada motor.");
            return;
        }
        
        sendMotorCommand('independent',
            getSpeedValue(selectedSpeed1.value),
            getSpeedValue(selectedSpeed2.value),
            getSpeedValue(selectedSpeed3.value),
            getSpeedValue(selectedSpeed4.value),
            reverse1,
            reverse2,
            reverse3,
            reverse4
        );
    }
}

// Función generalizada para enviar comandos de motor
export function sendMotorCommand(mode, speed1, speed2, reverse1, reverse2) {
    if (!motorSocket || !motorSocket.connected) {
        logMessage('No hay conexión con el servidor', true);
        return;
    }
    
    let command = {};
    let eventName = '';
    
    if (mode === 'synchronized') {
        eventName = 'synchronized_mode';
        command = {
            speed: speed1,
            reverse: reverse1
        };
        console.log(`Enviando comando: ${mode}, Velocidad: ${speed1}, Reversa: ${reverse1}`);
    } 
    else if (mode === 'differential') {
        eventName = 'differential_mode';
        command = {
            speed1: speed1,
            speed2: speed2,
            reverse1: reverse1,
            reverse2: reverse2
        };
        console.log(`Enviando comando: ${mode}, V1: ${speed1}, V2: ${speed2}, R1: ${reverse1}, R2: ${reverse2}`);
    }
    else if (mode === 'independent') {
        eventName = 'independent_mode';
        // Obtener todos los parámetros necesarios para modo independiente
        command = {
            speed1: speed1,
            speed2: speed2,
            speed3: arguments[2] || speed1,
            speed4: arguments[3] || speed2,
            reverse1: reverse1,
            reverse2: reverse2,
            reverse3: arguments[4] || reverse1,
            reverse4: arguments[5] || reverse2
        };
        console.log(`Enviando comando: ${mode}, 4 motores con velocidades independientes`);
    }
    
    // Enviar el comando
    motorSocket.emit(eventName, command, (response) => {
        if (response && response.success) {
            logMessage(`Comando de motor (${mode}) enviado correctamente`);
        } else {
            logMessage(`Error al enviar comando de motor: ${response?.response || 'No hay respuesta'}`, true);
        }
    });
}

// Detener motores
export function turnOffMotors() {
    if (!motorSocket) {
        console.error('No hay instancia de socket disponible');
        return;
    }
    
    if (!motorSocket.connected) {
        console.error('Socket no conectado');
        return;
    }
    
    console.log('Enviando comando para apagar motores...');
    logMessage('Enviando comando para apagar motores...');
    
    // Enviar comando con timeout para repetir si no hay respuesta
    let responseReceived = false;
    
    motorSocket.emit('motors_off', {}, (response) => {
        responseReceived = true;
        if (response && response.success) {
            console.log('Motores apagados correctamente:', response);
            logMessage('Motores apagados correctamente');
        } else {
            console.error('Error al apagar motores:', response);
            logMessage('Error al apagar motores', true);
        }
    });
    
    // Set timeout to check if response was received
    setTimeout(() => {
        if (!responseReceived) {
            console.warn('No se recibió respuesta del servidor al apagar motores, enviando comando de respaldo');
            // Enviar comando adicional como respaldo
            motorSocket.emit('synchronized_mode', {
                speed: 0,
                reverse: false
            });
        }
    }, 1000);
}

// Convertir selección de velocidad a valor numérico
export function getSpeedValue(speed) {
    switch (speed) {
        case 'low':
            return 85; // 1/3 de 255
        case 'media':
            return 170; // 2/3 de 255
        case 'high':
            return 255; // Máxima velocidad
        default:
            return 0; // Apagado
    }
}

// Configurar los controles direccionales
export function setupDirectionControls() {
    // Botón Forward (Adelante)
    document.getElementById('btnForward')?.addEventListener('click', function() {
        const speed = parseInt(document.getElementById('speedRange')?.value || 128);
        sendMotorCommand('synchronized', speed, null, false);
    });
    
    // Botón Backward (Atrás)
    document.getElementById('btnBackward')?.addEventListener('click', function() {
        const speed = parseInt(document.getElementById('speedRange')?.value || 128);
        sendMotorCommand('synchronized', speed, null, true);
    });
    
    // Botón Left (Izquierda) - Usando modo diferencial
    document.getElementById('btnLeft')?.addEventListener('click', function() {
        const speed = parseInt(document.getElementById('speedRange')?.value || 128);
        // Motor izquierdo más lento (o reversa), motor derecho más rápido
        sendMotorCommand('differential', speed/2, speed, true, false);
    });
    
    // Botón Right (Derecha) - Usando modo diferencial
    document.getElementById('btnRight')?.addEventListener('click', function() {
        const speed = parseInt(document.getElementById('speedRange')?.value || 128);
        // Motor izquierdo más rápido, motor derecho más lento (o reversa)
        sendMotorCommand('differential', speed, speed/2, false, true);
    });
    
    // Botón Stop (Detener)
    document.getElementById('btnStop')?.addEventListener('click', function() {
        turnOffMotors();
    });
    
    // Slider para control de velocidad general
    document.getElementById('speedRange')?.addEventListener('input', function() {
        const speedValueElem = document.getElementById('speedValue');
        if (speedValueElem) {
            speedValueElem.textContent = this.value;
        }
    });
    
    // Configurar control mediante teclado
    setupKeyboardControls();
}

// Configurar controles de teclado
function setupKeyboardControls() {
    // Event listener para teclas presionadas
    document.addEventListener('keydown', function(event) {
        // Verificar si es una tecla de flecha y si no estaba ya presionada
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !keyState[event.key]) {
            keyState[event.key] = true;
            
            // Obtener la velocidad actual
            const speed = parseInt(document.getElementById('speedRange')?.value || 128);
            
            // Ejecutar el comando correspondiente
            switch (event.key) {
                case 'ArrowUp':
                    console.log('Tecla Arriba presionada');
                    sendMotorCommand('synchronized', speed, null, false);
                    break;
                case 'ArrowDown':
                    console.log('Tecla Abajo presionada');
                    sendMotorCommand('synchronized', speed, null, true);
                    break;
                case 'ArrowLeft':
                    console.log('Tecla Izquierda presionada');
                    sendMotorCommand('differential', speed/2, speed, true, false);
                    break;
                case 'ArrowRight':
                    console.log('Tecla Derecha presionada');
                    sendMotorCommand('differential', speed, speed/2, false, true);
                    break;
            }
            
            // Prevenir el comportamiento predeterminado para no desplazar la página
            event.preventDefault();
        }
    });
    
    // Event listener para teclas liberadas
    document.addEventListener('keyup', function(event) {
        // Verificar si es una tecla de flecha
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            keyState[event.key] = false;
            
            // Verificar si todas las teclas de flecha están liberadas
            if (!keyState.ArrowUp && !keyState.ArrowDown && !keyState.ArrowLeft && !keyState.ArrowRight) {
                console.log('Todas las teclas de dirección liberadas, deteniendo motores');
                turnOffMotors();
            }
            
            // Prevenir el comportamiento predeterminado
            event.preventDefault();
        }
    });
    
    // Manejar pérdida de enfoque de la ventana para evitar que los motores sigan funcionando
    window.addEventListener('blur', function() {
        // Reiniciar todos los estados de teclas
        for (let key in keyState) {
            keyState[key] = false;
        }
        
        // Detener motores
        turnOffMotors();
    });
    
    console.log('Control por teclado configurado: Usa las flechas del teclado para controlar los movimientos');
    window.logMessage('Control por teclado activado: Usa las flechas para mover el robot');
}

// Función para registrar mensajes en el log
function logMessage(message, isError = false) {
    if (window.logMessage) {
        window.logMessage(message, isError);
    } else {
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
}