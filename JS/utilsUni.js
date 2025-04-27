// utilsUni.js - Funciones compartidas y utilitarias

// Función para mostrar las opciones de velocidad según el modo seleccionado
function showSpeedOptions() {
    // Verifica si esto aparece en la consola para saber si se esta ejecutando la funcion
    console.log("showSpeedOptions ejecutado"); 
    const speedOptionsDiv = document.getElementById('speed-options');
    const checkboxContainer = document.getElementById('checkbox-container');
    
    if (!speedOptionsDiv || !checkboxContainer) {
        console.error("No se encontraron elementos necesarios en el DOM");
        return;
    }
    
    speedOptionsDiv.innerHTML = ''; // Limpiar opciones anteriores
    checkboxContainer.innerHTML = ''; // Limpiar checkbox anteriores

    const selectedRadio = document.querySelector('input[name="transmission"]:checked');
    if (!selectedRadio) {
        console.error("No hay modo de transmisión seleccionado");
        return;
    }
    
    const selectedValue = selectedRadio.value;

    if (selectedValue === 'synchronized') {
        speedOptionsDiv.innerHTML = `
            <p class="textos1">Selecciona la velocidad de los 4 motores:</p>
            <div class="radio-inputs1">
                
                <label class="radio">
                    <input type="radio" name="speed" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
        `;
        // Agregar checkbox personalizado fuera del cuadro de velocidad
        checkboxContainer.innerHTML = `
            <label class="material-checkbox">
                <input type="checkbox" name="sync-checkbox" />
                <span class="checkmark"></span>
                Reversa
            </label>
        `;
    } else if (selectedValue === 'differential') {
        speedOptionsDiv.innerHTML = `
            <p class="textos1">Selecciona la velocidad de los motores M1/M2:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed1" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed1" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed1" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
            <p class="textos1">Selecciona la velocidad de los motores M3/M4:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed2" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed2" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed2" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
        `;
        // Agregar checkbox personalizados fuera del cuadro de velocidad
        checkboxContainer.innerHTML = `
            <label class="material-checkbox">
                <input type="checkbox" name="diff-checkbox1" />
                <span class="checkmark"></span>
                Reversa par 1
            </label>
            <label class="material-checkbox">
                <input type="checkbox" name="diff-checkbox2" />
                <span class="checkmark"></span>
                Reversa par 2
            </label>
        `;
    } else if (selectedValue === 'independent') {
        speedOptionsDiv.innerHTML = `
            <p class="textos1">Selecciona la velocidad del motor M1:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed1" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed1" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed1" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
            <p class="textos1">Selecciona la velocidad del motor M2:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed2" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed2" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed2" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
            <p class="textos1">Selecciona la velocidad del motor M3:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed3" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed3" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed3" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
            <p class="textos1">Selecciona la velocidad del motor M4:</p>
            <div class="radio-inputs1">
                <label class="radio">
                    <input type="radio" name="speed4" value="high" />
                    <span class="name">V. ALTA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed4" value="media" />
                    <span class="name">V. MEDIA</span>
                </label>
                <label class="radio">
                    <input type="radio" name="speed4" value="low" />
                    <span class="name">V. BAJA</span>
                </label>
            </div>
        `;
        // Agregar checkbox personalizados fuera del cuadro de velocidad
        checkboxContainer.innerHTML = `
            <label class="material-checkbox">
                <input type="checkbox" name="ind-checkbox1" />
                <span class="checkmark"></span>
                Reversa Motor 1
            </label>
            <label class="material-checkbox">
                <input type="checkbox" name="ind-checkbox2" />
                <span class="checkmark"></span>
                Reversa Motor 2
            </label>
            <label class="material-checkbox">
                <input type="checkbox" name="ind-checkbox3" />
                <span class="checkmark"></span>
                Reversa Motor 3
            </label>
            <label class="material-checkbox">
                <input type="checkbox" name="ind-checkbox4" />
                <span class="checkmark"></span>
                Reversa Motor 4
            </label>
        `;
    }

    speedOptionsDiv.style.display = 'block'; // Mostrar el div de opciones de velocidad
    
    // Actualizar también la visibilidad de los controles direccionales
    const directionControls = document.getElementById('direction-controls');
    if (directionControls) {
        directionControls.style.display = 'grid';
    }
}

// Función para mostrar mensajes en el registro de la interfaz
function log(message, isError = false) {
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

// Exponer la función showSpeedOptions al ámbito global
window.showSpeedOptions = showSpeedOptions;
window.log = log;