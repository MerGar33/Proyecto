// Importar la conexión de socket desde el módulo de motores
import { getSocketInstance } from './motoresUni.js';

// Variables de estado para servos
let servoState = {
    mg995: { 
        angle: 0,         // Ángulo actual (0-180)
        targetAngle: 0,   // Ángulo objetivo
        limit: 180,       // Límite de ángulo máximo (configurable)
        speed: 2,         // Velocidad (1-3)
        moving: false,    // Si está en movimiento
        reverse: false    // Si la dirección está invertida
    },
    ds04: { 
        angle: 0,         // Ángulo actual (0-360)
        targetAngle: 0,   // Ángulo objetivo
        limit: 360,       // Límite de ángulo máximo (configurable)
        speed: 2,         // Velocidad (1-3)
        moving: false,    // Si está en movimiento
        reverse: false    // Si la dirección está invertida
    }
};

// Control de rotación para limitar el movimiento
let rotationControl = {
    mg995: {
        startAngle: 0,      // Ángulo inicial para esta operación
        totalRotation: 0,   // Rotación acumulada
        direction: 0,       // Dirección de rotación (1 o -1)
        lastAngle: 0,       // Último ángulo registrado para calcular diferencias
        initialized: false  // Si se ha inicializado
    },
    ds04: {
        startAngle: 0,
        totalRotation: 0,
        direction: 0,
        lastAngle: 0,
        initialized: false
    }
};

// Mapeo de velocidad a texto descriptivo
const speedText = {
    1: "Baja",
    2: "Media",
    3: "Alta"
};

// Inicializar sistema de control de rotación
function initRotationControl(servoType, initialAngle) {
    const control = rotationControl[servoType];
    control.startAngle = initialAngle;
    control.lastAngle = initialAngle;
    control.totalRotation = 0;
    control.direction = 0;
    control.initialized = true;
    
    console.log(`Control de rotación inicializado para ${servoType}: ángulo inicial = ${initialAngle}°`);
}

// Actualizar control de rotación con un nuevo ángulo
function updateRotationControl(servoType, newAngle) {
    const control = rotationControl[servoType];
    const servo = servoState[servoType];
    
    // Si no está inicializado, hacerlo ahora
    if (!control.initialized) {
        initRotationControl(servoType, newAngle);
        return;
    }
    
    const lastAngle = control.lastAngle;
    let angleDiff = newAngle - lastAngle;
    
    // Ajustar para cruces de 0/180/360
    if (servoType === 'mg995') {
        // Para MG995 (0-180)
        if (angleDiff > 90) angleDiff -= 180;
        if (angleDiff < -90) angleDiff += 180;
    } else {
        // Para DS04 (0-360)
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;
    }
    
    // Determinar dirección si no está establecida
    if (control.direction === 0 && angleDiff !== 0) {
        control.direction = angleDiff > 0 ? 1 : -1;
    }
    
    // Acumular rotación total
    control.totalRotation += Math.abs(angleDiff);
    
    // Actualizar último ángulo
    control.lastAngle = newAngle;
    
    // Comprobar si alcanzó el límite
    const limit = servo.limit;
    if (control.totalRotation >= limit) {
        // Ha alcanzado o excedido el límite
        window.logMessage(`Servo ${servoType} alcanzó límite de ${limit}°`, true);
        return true; // Límite alcanzado
    }
    
    return false; // No alcanzó el límite
}

// Reiniciar control de rotación
function resetRotationControl(servoType) {
    const control = rotationControl[servoType];
    control.initialized = false;
    control.totalRotation = 0;
    control.direction = 0;
}

// Actualizar la visualización del ángulo de los servos
export function updateServoDisplay() {
    // Actualizar MG995
    const mg995AngleElem = document.getElementById('mg995-angle');
    const mg995LimitElem = document.getElementById('mg995-limit');
    
    if (mg995AngleElem) {
        mg995AngleElem.textContent = servoState.mg995.angle;
    }
    
    if (mg995LimitElem) {
        mg995LimitElem.textContent = servoState.mg995.limit;
    }
    
    // Actualizar DS04
    const ds04AngleElem = document.getElementById('ds04-angle');
    const ds04LimitElem = document.getElementById('ds04-limit');
    
    if (ds04AngleElem) {
        ds04AngleElem.textContent = servoState.ds04.angle;
    }
    
    if (ds04LimitElem) {
        ds04LimitElem.textContent = servoState.ds04.limit;
    }
}

// Mover servo a un ángulo específico (respetando el límite)
export function moveServo(servoType, angle, speed = null) {
    const socket = getSocketInstance();
    if (!socket || !socket.connected) {
        window.logMessage(`No hay conexión con el servidor para mover servo ${servoType}`, true);
        return;
    }
    
    // Obtener límite actual
    const limit = servoState[servoType].limit;
    
    // Validar ángulo según tipo de servo y límite establecido
    if (servoType === 'mg995') {
        if (angle < 0 || angle > limit || limit > 180) {
            window.logMessage(`Ángulo ${angle}° inválido para MG995 (0-${limit})`, true);
            return;
        }
    } else if (servoType === 'ds04') {
        if (angle < 0 || angle > limit || limit > 360) {
            window.logMessage(`Ángulo ${angle}° inválido para DS04 (0-${limit})`, true);
            return;
        }
    }
    
    // Si no se especifica velocidad, usar la actual
    if (speed === null) {
        speed = servoState[servoType].speed;
    } else {
        // Actualizar velocidad en el estado
        servoState[servoType].speed = speed;
        
        // Actualizar texto de velocidad en la interfaz
        updateSpeedText(servoType);
    }
    
    // Reiniciar control de rotación al iniciar nuevo movimiento
    resetRotationControl(servoType);
    
    // Actualizar estado
    servoState[servoType].moving = true;
    servoState[servoType].targetAngle = angle;
    
    // Enviar comando al servidor
    socket.emit('control_servos', {
        action: "move",
        servo_type: servoType,
        angle: angle,
        speed: speed
    }, (response) => {
        if (response && response.success) {
            window.logMessage(`Servo ${servoType} moviéndose a ángulo ${angle}° con velocidad ${speedText[speed]}`);
        } else {
            window.logMessage(`Error al mover servo ${servoType}`, true);
            
            // Si hubo error, actualizar estado para reflejar que no está en movimiento
            servoState[servoType].moving = false;
        }
    });
}

// Detener servo con estrategias específicas según el tipo
export function stopServo(servoType) {
    const socket = getSocketInstance();
    if (!socket || !socket.connected) {
        window.logMessage(`No hay conexión con el servidor para detener servo ${servoType}`, true);
        return;
    }
    
    // Marcar como detenido inmediatamente
    servoState[servoType].moving = false;
    
    // Reiniciar control de rotación
    resetRotationControl(servoType);
    
    // Enviar el comando de detención al Arduino de servos
    socket.emit('control_servos', {
        action: "stop",
        servo_type: servoType,
        priority: true,
        force_stop: true
    }, (response) => {
        if (response && response.success) {
            window.logMessage(`Servo ${servoType} detenido`);
        } else {
            window.logMessage(`Error al detener servo ${servoType}`, true);
        }
    });
}

// Cambiar límite de ángulo del servo
export function setServoLimit(servoType, limit) {
    // Validar límite según el tipo de servo
    if (servoType === 'mg995') {
        limit = Math.max(0, Math.min(180, parseInt(limit)));
    } else if (servoType === 'ds04') {
        limit = Math.max(0, Math.min(360, parseInt(limit)));
    }
    
    // Actualizar estado
    servoState[servoType].limit = limit;
    
    // Actualizar interfaz
    const limitElem = document.getElementById(`${servoType}-limit`);
    if (limitElem) {
        limitElem.textContent = limit;
    }
    
    // Enviar el límite al servidor/Arduino
    const socket = getSocketInstance();
    if (socket && socket.connected) {
        socket.emit('control_servos', {
            action: "limit",
            servo_type: servoType,
            limit: limit
        }, (response) => {
            if (response && response.success) {
                window.logMessage(`Límite de ángulo del servo ${servoType} ajustado a ${limit}°`);
            } else {
                window.logMessage(`Error al establecer límite para ${servoType}`, true);
            }
        });
    }
}

// Actualizar texto de velocidad en la interfaz
function updateSpeedText(servoType) {
    const speedTextElem = document.getElementById(`${servoType}-speed-text`);
    if (speedTextElem) {
        const speed = servoState[servoType].speed;
        speedTextElem.textContent = speedText[speed] || 'Media';
    }
}

// Actualizar todos los textos de velocidad
function updateSpeedTexts() {
    updateSpeedText('mg995');
    updateSpeedText('ds04');
}

// Recibir actualización de ángulo del Arduino
export function updateServoAngle(servoType, angle) {
    const prevAngle = servoState[servoType].angle;
    
    // Actualizar el estado
    servoState[servoType].angle = angle;
    
    // Actualizar la interfaz para mostrar el ángulo actual
    const angleElem = document.getElementById(`${servoType}-angle`);
    if (angleElem) {
        angleElem.textContent = angle;
    }
    
    // Si el ángulo ha cambiado y el servo está en movimiento, actualizar control de rotación
    if (prevAngle !== angle && servoState[servoType].moving) {
        const limitReached = updateRotationControl(servoType, angle);
        
        // Si se alcanzó el límite, detener el servo
        if (limitReached) {
            window.logMessage(`Límite de rotación alcanzado para ${servoType}, deteniendo...`, true);
            stopServo(servoType);
        }
    }
}

// Manejar respuestas de servo desde el servidor
export function handleServoResponse(data) {
    if (data && data.status) {
        // Actualizar estado de los servos basado en los datos recibidos
        Object.keys(data.status).forEach(servoType => {
            const servoData = data.status[servoType];
            
            // Actualizar ángulo si está presente
            if (servoData.angle !== undefined) {
                updateServoAngle(servoType, servoData.angle);
            }
            
            // Actualizar límite si está presente
            if (servoData.limit !== undefined) {
                const currentLimit = servoState[servoType].limit;
                if (currentLimit !== servoData.limit) {
                    servoState[servoType].limit = servoData.limit;
                    // Actualizar interfaz
                    const limitElem = document.getElementById(`${servoType}-limit`);
                    if (limitElem) {
                        limitElem.textContent = servoData.limit;
                    }
                }
            }
            
            // Actualizar otros estados
            if (servoData.moving !== undefined) {
                const wasMoving = servoState[servoType].moving;
                servoState[servoType].moving = servoData.moving;
                
                // Si cambió de estado (de movimiento a detenido), resetear control de rotación
                if (wasMoving && !servoData.moving) {
                    resetRotationControl(servoType);
                }
            }
            
            if (servoData.speed !== undefined) {
                servoState[servoType].speed = servoData.speed;
                updateSpeedText(servoType);
            }
            
            if (servoData.reverse !== undefined) {
                servoState[servoType].reverse = servoData.reverse;
                
                // Actualizar checkbox de dirección
                const reverseCheckbox = document.getElementById(`${servoType}-reverse`);
                if (reverseCheckbox) {
                    reverseCheckbox.checked = servoData.reverse;
                }
            }
        });
    }
}

// Sistema de monitoreo de movimiento - Detecta problemas y recupera
let movementMonitor = {
    active: false,
    lastCheck: {},
    servoStates: {},
    errorCounts: { mg995: 0, ds04: 0 }
};

// Iniciar sistema de monitoreo
function startMovementMonitor() {
    if (movementMonitor.active) return;
    
    movementMonitor.active = true;
    movementMonitor.lastCheck = { mg995: 0, ds04: 0 };
    movementMonitor.servoStates = { mg995: {}, ds04: {} };
    movementMonitor.errorCounts = { mg995: 0, ds04: 0 };
    
    checkServoMovement();
    
    window.logMessage('Sistema de monitoreo de servo iniciado');
}

// Verificar movimiento inesperado
function checkServoMovement() {
    if (!movementMonitor.active) return;
    
    const now = Date.now();
    
    // Comprobar cada servo
    ['mg995', 'ds04'].forEach(servoType => {
        const servo = servoState[servoType];
        const lastCheck = movementMonitor.lastCheck[servoType];
        const servoStates = movementMonitor.servoStates[servoType];
        
        // Comprobar cada 500ms
        if (now - lastCheck > 500) {
            movementMonitor.lastCheck[servoType] = now;
            
            const currentAngle = servo.angle;
            const wasMoving = servo.moving;
            
            // Almacenar estado actual
            servoStates.prevAngle = servoStates.currentAngle;
            servoStates.currentAngle = currentAngle;
            
            // Si no debe estar moviéndose pero el ángulo cambia
            if (!wasMoving && 
                servoStates.prevAngle !== undefined && 
                servoStates.prevAngle !== servoStates.currentAngle) {
                
                // Incrementar contador de errores
                movementMonitor.errorCounts[servoType]++;
                
                // Si ocurre más de 3 veces, enviar detención de emergencia
                if (movementMonitor.errorCounts[servoType] >= 3) {
                    window.logMessage(`Movimiento inesperado en ${servoType}, enviando detención de emergencia`, true);
                    
                    // Enviar detención de emergencia
                    emergencyStop(servoType);
                    
                    // Resetear contador
                    movementMonitor.errorCounts[servoType] = 0;
                }
            } else {
                // Resetear contador si todo está correcto
                movementMonitor.errorCounts[servoType] = 0;
            }
        }
    });
    
    // Programar siguiente verificación
    setTimeout(checkServoMovement, 200);
}

// Detención de emergencia - Última medida
function emergencyStop(servoType) {
    const socket = getSocketInstance();
    if (!socket || !socket.connected) return;
    
    // Marcar como detenido localmente
    servoState[servoType].moving = false;
    
    // Estrategia agresiva según tipo de servo
    if (servoType === 'ds04') {
        // Para DS04, enviar a posición neutral y detener
        socket.emit('control_servos', {
            action: "move",
            servo_type: servoType,
            angle: 90,
            speed: 1,
            force_stop: true
        });
        
        // Seguir con detención completa
        setTimeout(() => {
            socket.emit('control_servos', {
                action: "stop",
                servo_type: servoType,
                priority: true,
                force_stop: true
            });
        }, 100);
    } else {
        // Para MG995, usar detención directa
        socket.emit('control_servos', {
            action: "stop",
            servo_type: servoType,
            priority: true,
            force_stop: true
        });
        
        // Seguir con fijación de posición
        setTimeout(() => {
            const currentAngle = servoState[servoType].angle;
            socket.emit('control_servos', {
                action: "move",
                servo_type: servoType,
                angle: currentAngle,
                speed: 1,
                force_stop: true
            });
        }, 100);
    }
}

// Actualizar el límite en la interfaz
export function updateLimitDisplay(servoType, limit) {
    const limitElem = document.getElementById(`${servoType}-limit`);
    if (limitElem) {
        limitElem.textContent = limit;
    }
}

// Invertir dirección del servo
export function toggleServoDirection(servoType) {
    const socket = getSocketInstance();
    if (!socket || !socket.connected) {
        window.logMessage(`No hay conexión con el servidor para cambiar dirección`, true);
        return;
    }
    
    // Detener el servo antes de cambiar dirección
    stopServo(servoType);
    
    // Esperar a que se detenga antes de cambiar dirección
    setTimeout(() => {
        // Invertir estado localmente para feedback inmediato
        servoState[servoType].reverse = !servoState[servoType].reverse;
        
        // Actualizar estilo visual del checkbox
        const checkbox = document.getElementById(`${servoType}-reverse`);
        if (checkbox) {
            checkbox.checked = servoState[servoType].reverse;
        }
        
        // Enviar comando
        socket.emit('control_servos', {
            action: "reverse",
            servo_type: servoType
        }, (response) => {
            if (response && response.success) {
                window.logMessage(`Dirección del servo ${servoType} ${servoState[servoType].reverse ? 'invertida' : 'normal'}`);
            } else {
                // Revertir cambio local si falla
                servoState[servoType].reverse = !servoState[servoType].reverse;
                if (checkbox) {
                    checkbox.checked = servoState[servoType].reverse;
                }
                window.logMessage(`Error al cambiar dirección del servo ${servoType}`, true);
            }
        });
    }, 500);
}

// Cambiar velocidad del servo
export function changeServoSpeed(servoType, speed) {
    // Validar velocidad
    speed = Math.max(1, Math.min(3, parseInt(speed)));
    
    // Actualizar estado local
    servoState[servoType].speed = speed;
    
    // Actualizar texto en la interfaz
    updateSpeedText(servoType);
    
    // Enviar comando si hay conexión
    const socket = getSocketInstance();
    if (socket && socket.connected) {
        socket.emit('control_servos', {
            action: "speed",
            servo_type: servoType,
            speed: speed
        }, (response) => {
            if (response && response.success) {
                window.logMessage(`Velocidad del servo ${servoType} ajustada a ${speedText[speed]}`);
            }
        });
    }
}

// Inicializar los sliders con los valores de límite actuales
function initializeLimitSliders() {
    // Obtener referencias a los elementos
    const mg995Slider = document.getElementById('mg995-slider');
    const mg995LimitElem = document.getElementById('mg995-limit');
    const ds04Slider = document.getElementById('ds04-slider');
    const ds04LimitElem = document.getElementById('ds04-limit');

    // Establecer los valores iniciales de los sliders basados en los límites
    if (mg995Slider && mg995LimitElem) {
        mg995Slider.value = servoState.mg995.limit;
        mg995Slider.setAttribute('max', '180'); // Máximo absoluto para MG995
    }

    if (ds04Slider && ds04LimitElem) {
        ds04Slider.value = servoState.ds04.limit;
        ds04Slider.setAttribute('max', '360'); // Máximo absoluto para DS04
    }

    // Agregar etiquetas explicativas si no existen
    addLimitExplanations();
}

// Agregar etiquetas explicativas sobre los límites
function addLimitExplanations() {
    const mg995SliderContainer = document.querySelector('.servo-control:nth-child(1) .slider-container');
    const ds04SliderContainer = document.querySelector('.servo-control:nth-child(2) .slider-container');

    if (mg995SliderContainer && !document.getElementById('mg995-limit-explanation')) {
        const explanation = document.createElement('div');
        explanation.id = 'mg995-limit-explanation';
        explanation.className = 'limit-explanation';
        explanation.textContent = 'Ajusta este slider para limitar el ángulo máximo de movimiento.';
        mg995SliderContainer.appendChild(explanation);
    }

    if (ds04SliderContainer && !document.getElementById('ds04-limit-explanation')) {
        const explanation = document.createElement('div');
        explanation.id = 'ds04-limit-explanation';
        explanation.className = 'limit-explanation';
        explanation.textContent = 'Ajusta este slider para limitar el ángulo máximo de movimiento.';
        ds04SliderContainer.appendChild(explanation);
    }
}

// Configurar controles de servo en la interfaz
export function setupServoControls() {
    // Iniciar sistema de monitoreo
    startMovementMonitor();
    
    // Controles del servo MG995
    const mg995Slider = document.getElementById('mg995-slider');
    const mg995MoveBtn = document.getElementById('mg995-move');
    const mg995StopBtn = document.getElementById('mg995-stop');
    const mg995ReverseCheck = document.getElementById('mg995-reverse');
    const mg995SpeedSlider = document.getElementById('mg995-speed-slider');
    
    // Controles del servo DS04
    const ds04Slider = document.getElementById('ds04-slider');
    const ds04MoveBtn = document.getElementById('ds04-move');
    const ds04StopBtn = document.getElementById('ds04-stop');
    const ds04ReverseCheck = document.getElementById('ds04-reverse');
    const ds04SpeedSlider = document.getElementById('ds04-speed-slider');
    
    // Configurar eventos para MG995
    if (mg995MoveBtn) {
        mg995MoveBtn.addEventListener('click', function() {
            // Usar el valor del slider como ángulo objetivo
            const targetAngle = parseInt(mg995Slider.value);
            moveServo('mg995', targetAngle);
        });
    }
    
    if (mg995StopBtn) {
        mg995StopBtn.addEventListener('click', function() {
            stopServo('mg995');
        });
    }
    
    if (mg995ReverseCheck) {
        mg995ReverseCheck.addEventListener('change', function() {
            toggleServoDirection('mg995');
        });
    }
    
    if (mg995SpeedSlider) {
        mg995SpeedSlider.addEventListener('input', function() {
            changeServoSpeed('mg995', this.value);
        });
    }
    
    // El slider ahora actualiza el límite de ángulo al moverse
    if (mg995Slider) {
        mg995Slider.addEventListener('input', function() {
            // Actualizar solo la visualización mientras se mueve el slider
            updateLimitDisplay('mg995', this.value);
        });
        
        mg995Slider.addEventListener('change', function() {
            // Establecer el límite cuando se suelta el slider
            setServoLimit('mg995', this.value);
        });
    }
    
    // Configurar eventos para DS04
    if (ds04MoveBtn) {
        ds04MoveBtn.addEventListener('click', function() {
            // Usar el valor del slider como ángulo objetivo
            const targetAngle = parseInt(ds04Slider.value);
            moveServo('ds04', targetAngle);
        });
    }
    
    if (ds04StopBtn) {
        ds04StopBtn.addEventListener('click', function() {
            stopServo('ds04');
        });
    }
    
    if (ds04ReverseCheck) {
        ds04ReverseCheck.addEventListener('change', function() {
            toggleServoDirection('ds04');
        });
    }
    
    if (ds04SpeedSlider) {
        ds04SpeedSlider.addEventListener('input', function() {
            changeServoSpeed('ds04', this.value);
        });
    }
    
    // El slider ahora actualiza el límite de ángulo al moverse
    if (ds04Slider) {
        ds04Slider.addEventListener('input', function() {
            // Actualizar solo la visualización mientras se mueve el slider
            updateLimitDisplay('ds04', this.value);
        });
        
        ds04Slider.addEventListener('change', function() {
            // Establecer el límite cuando se suelta el slider
            setServoLimit('ds04', this.value);
        });
    }
    
    // Inicializar textos de velocidad y límites
    updateSpeedTexts();
    initializeLimitSliders();
}