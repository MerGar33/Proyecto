#include <Servo.h>    // Incluir librería para controlar servos

// Definición de servos
Servo servoMG995;     // Servo para el control de inclinación (MG995) - 0-180 grados
Servo servoDS04;      // Servo para el control de rotación (DS04) - 0-360 grados (simulado)

// Pines para los servos
const int SERVO_MG995_PIN = 9;  // Pin para servo MG995
const int SERVO_DS04_PIN = 10;  // Pin para servo DS04

// Intervalo para reportar ángulos en ms
const unsigned long ANGLE_REPORT_INTERVAL = 100; 
unsigned long lastAngleReport = 0;

// Estado de los servos
int servoMG995Angle = 0;       // Ángulo actual MG995 (0-180)
int servoDS04Angle = 0;        // Ángulo actual DS04 (0-360 simulado)
int servoMG995Speed = 2;       // Velocidad (1-3)
int servoDS04Speed = 2;        // Velocidad (1-3)
bool servoMG995Moving = false; // Si está en movimiento
bool servoDS04Moving = false;  // Si está en movimiento
bool servoMG995Reverse = false; // Si la dirección está invertida
bool servoDS04Reverse = false;  // Si la dirección está invertida
int servoMG995Target = 0;      // Ángulo objetivo
int servoDS04Target = 0;       // Ángulo objetivo
int servoMG995Limit = 180;     // Límite máximo de ángulo (0-180)
int servoDS04Limit = 360;      // Límite máximo de ángulo (0-360)

// Variables para control de tiempo
unsigned long lastMG995Update = 0;
unsigned long lastDS04Update = 0;

// Retrasos para velocidades (baja, media, alta) en milisegundos
// Determina cuán rápido se mueve el servo (cuánto tiempo entre cada incremento de ángulo)
const int speedDelays[] = {50, 25, 5}; 

void setup() {
  Serial.begin(9600);
  
  // Configurar pines de servos
  servoMG995.attach(SERVO_MG995_PIN);
  servoDS04.attach(SERVO_DS04_PIN);
  
  // Inicializar servos en posición 0°
  calibrarServos();
  
  Serial.println("Sistema de control de servos inicializado - Servos calibrados a 0°");
}

void loop() {
  // Procesar comandos seriales
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Eliminar espacios en blanco

    // Procesar solo si es un comando para servo
    if (command.startsWith("servo")) {
      procesarComandoServo(command);
    }
  }
  
  // Actualizar servos si están en movimiento
  actualizarServos();
  
  // Reportar ángulos periódicamente
  reportarAngulos();
}

// Procedimiento de calibración inicial
void calibrarServos() {
  // Mover ambos servos a posición 0° gradualmente
  // MG995 (estándar) - 0° es completamente a la izquierda
  servoMG995.write(0);
  servoMG995Angle = 0;
  servoMG995Target = 0;
  
  // DS04 (continuo) - 90° es detenido, menor es giro en un sentido, mayor es giro en el otro
  // Pero simulamos como un servo de 0-360° para la interfaz
  servoDS04.write(90); // Centro (detenido)
  servoDS04Angle = 0;  // Para la interfaz reportamos 0°
  servoDS04Target = 0; // Para la interfaz el objetivo es 0°
  
  delay(1000); // Esperar que lleguen a la posición
  
  // Reportar posición inicial
  Serial.println("servo_angle,mg995,0");
  Serial.println("servo_angle,ds04,0");
  
  // Establecer que los servos no están en movimiento
  servoMG995Moving = false;
  servoDS04Moving = false;
}

// Reportar ángulos de los servos periódicamente
void reportarAngulos() {
  unsigned long currentMillis = millis();
  
  // Reportar cada ANGLE_REPORT_INTERVAL ms (cada 100ms por defecto)
  if (currentMillis - lastAngleReport >= ANGLE_REPORT_INTERVAL) {
    lastAngleReport = currentMillis;
    
    // Reportar ángulo del MG995
    Serial.print("servo_angle,mg995,");
    Serial.println(servoMG995Angle);
    
    // Reportar ángulo del DS04
    Serial.print("servo_angle,ds04,");
    Serial.println(servoDS04Angle);
  }
}

// Procesar comandos para servos
void procesarComandoServo(String command) {
  // Formato: servo,tipo,accion,parametros
  int firstComma = command.indexOf(',');
  if (firstComma == -1) return;
  
  String params = command.substring(firstComma + 1);
  int secondComma = params.indexOf(',');
  if (secondComma == -1) return;
  
  String servoType = params.substring(0, secondComma);
  String restCommand = params.substring(secondComma + 1);
  int thirdComma = restCommand.indexOf(',');
  
  String action;
  String actionParams;
  
  if (thirdComma != -1) {
    action = restCommand.substring(0, thirdComma);
    actionParams = restCommand.substring(thirdComma + 1);
  } else {
    action = restCommand;
    actionParams = "";
  }
  
  // Seleccionar variables según el servo
  Servo* targetServo;
  int* currentAngle;
  int* targetAngle;
  int* servoSpeed;
  bool* isMoving;
  bool* isReverse;
  int* servoLimit;
  unsigned long* lastUpdate;
  
  if (servoType == "mg995") {
    targetServo = &servoMG995;
    currentAngle = &servoMG995Angle;
    targetAngle = &servoMG995Target;
    servoSpeed = &servoMG995Speed;
    isMoving = &servoMG995Moving;
    isReverse = &servoMG995Reverse;
    servoLimit = &servoMG995Limit;
    lastUpdate = &lastMG995Update;
  } 
  else if (servoType == "ds04") {
    targetServo = &servoDS04;
    currentAngle = &servoDS04Angle;
    targetAngle = &servoDS04Target;
    servoSpeed = &servoDS04Speed;
    isMoving = &servoDS04Moving;
    isReverse = &servoDS04Reverse;
    servoLimit = &servoDS04Limit;
    lastUpdate = &lastDS04Update;
  } 
  else {
    Serial.println("Tipo de servo desconocido");
    return;
  }
  
  // Procesar acciones
  if (action == "move") {
    // Formato: servo,tipo,move,angulo,velocidad[,calibration|force_stop]
    int actionComma = actionParams.indexOf(',');
    if (actionComma != -1) {
      int angle = actionParams.substring(0, actionComma).toInt();
      String restParams = actionParams.substring(actionComma + 1);
      int nextComma = restParams.indexOf(',');
      
      int speed;
      bool isCalibration = false;
      bool forceStop = false;
      
      if (nextComma != -1) {
        // Parámetros adicionales
        speed = restParams.substring(0, nextComma).toInt();
        String flags = restParams.substring(nextComma + 1);
        
        isCalibration = flags.indexOf("calibration") != -1;
        forceStop = flags.indexOf("force_stop") != -1;
      } else {
        // Solo velocidad
        speed = restParams.toInt();
      }
      
      // Validar límites según tipo de servo
      if (servoType == "mg995") {
        // Aplicar límite configurado
        if (angle > *servoLimit) {
          angle = *servoLimit;
        }
        angle = constrain(angle, 0, 180);
      } else if (servoType == "ds04") {
        // Aplicar límite configurado
        if (angle > *servoLimit) {
          angle = *servoLimit;
        }
        angle = constrain(angle, 0, 360);
      }
      
      // Validar velocidad
      speed = constrain(speed, 1, 3);
      
      // Si es calibración a 0°, mover inmediatamente
      if (isCalibration && angle == 0) {
        Serial.print("Calibrando servo ");
        Serial.print(servoType);
        Serial.println(" a 0 grados");
        
        // Posición 0° inmediatamente
        *currentAngle = 0;
        *targetAngle = 0;
        *isMoving = false;
        
        if (servoType == "mg995") {
          targetServo->write(0);
        } else {
          // Para DS04, 90° es posición detenida
          targetServo->write(90);
        }
        
        // Reportar nueva posición
        Serial.print("servo_angle,");
        Serial.print(servoType);
        Serial.println(",0");
        return;
      }
      
      // Si es DS04 en posición central con force_stop
      if (servoType == "ds04" && angle == 90 && forceStop) {
        *isMoving = false;
        // Establecer posición central
        targetServo->write(90);
        *currentAngle = 90;
        *targetAngle = 90;
        Serial.println("DS04 detenido en posición central (forzado)");
        
        // Reportar nueva posición
        Serial.print("servo_angle,ds04,");
        Serial.println(90);
        return;
      }
      
      // Aplicar inversión de dirección si está activada
      int finalAngle = angle;
      if (*isReverse) {
        if (servoType == "mg995") {
          finalAngle = 180 - angle;
        } else if (servoType == "ds04") {
          finalAngle = 360 - angle;
        }
      }
      
      // Configurar movimiento
      *targetAngle = finalAngle;
      *servoSpeed = speed;
      *isMoving = true;
      *lastUpdate = millis();
      
      Serial.print("Moviendo servo ");
      Serial.print(servoType);
      Serial.print(" a ángulo ");
      Serial.print(angle);
      Serial.print(" con velocidad ");
      Serial.println(speed);
    }
  }
  else if (action == "stop") {
    // Detener el servo inmediatamente
    *isMoving = false;
    
    // Para DS04, enviar señal central
    if (servoType == "ds04") {
      targetServo->write(90);
      Serial.println("DS04 detenido en posición central");
    } else {
      // Para MG995, mantener posición actual
      targetServo->write(*currentAngle);
      Serial.print("MG995 detenido en posición ");
      Serial.println(*currentAngle);
    }
    
    // Actualizar objetivo para que coincida con posición actual
    *targetAngle = *currentAngle;
    
    // Confirmar detención
    Serial.print("servo_stopped,");
    Serial.println(servoType);
  }
  else if (action == "speed") {
    // Cambiar velocidad
    int speed = actionParams.toInt();
    speed = constrain(speed, 1, 3);
    *servoSpeed = speed;
    
    Serial.print("Velocidad del servo ");
    Serial.print(servoType);
    Serial.print(" ajustada a ");
    Serial.println(speed);
  } 
  else if (action == "reverse") {
    // Invertir dirección
    *isReverse = !(*isReverse);
    
    Serial.print("Dirección del servo ");
    Serial.print(servoType);
    Serial.print(" ");
    Serial.println(*isReverse ? "invertida" : "normal");
  }
  else if (action == "limit") {
    // Establecer límite de ángulo
    int limit = actionParams.toInt();
    
    // Validar límite según tipo de servo
    if (servoType == "mg995") {
      limit = constrain(limit, 0, 180);
    } else if (servoType == "ds04") {
      limit = constrain(limit, 0, 360);
    }
    
    *servoLimit = limit;
    
    Serial.print("Límite de ángulo para ");
    Serial.print(servoType);
    Serial.print(" establecido a ");
    Serial.println(limit);
  }
}

// Actualizar posición de servos en movimiento
void actualizarServos() {
  unsigned long currentMillis = millis();
  
  // Actualizar MG995 si está en movimiento
  if (servoMG995Moving) {
    if (currentMillis - lastMG995Update > speedDelays[servoMG995Speed - 1]) {
      lastMG995Update = currentMillis;
      
      // Verificar si llegó al objetivo
      if (servoMG995Angle == servoMG995Target) {
        // Objetivo alcanzado, detener
        servoMG995Moving = false;
        // Asegurar posición final
        servoMG995.write(servoMG995Angle);
        Serial.print("MG995 llegó al objetivo: ");
        Serial.println(servoMG995Angle);
      } else {
        // Mover gradualmente hacia el objetivo (5 grados por paso)
        int step = 1;
        if (servoMG995Speed > 1) {
          step = 5; // Movimiento más rápido para velocidades medias y altas
        }
        
        if (servoMG995Angle < servoMG995Target) {
          servoMG995Angle = min(servoMG995Angle + step, servoMG995Target);
        } else {
          servoMG995Angle = max(servoMG995Angle - step, servoMG995Target);
        }
        
        // Asegurar límites
        servoMG995Angle = constrain(servoMG995Angle, 0, servoMG995Limit);
        
        // Actualizar posición física
        servoMG995.write(servoMG995Angle);
      }
    }
  }
  
  // Actualizar DS04 si está en movimiento
  if (servoDS04Moving) {
    if (currentMillis - lastDS04Update > speedDelays[servoDS04Speed - 1]) {
      lastDS04Update = currentMillis;
      
      // Verificar si llegó al objetivo
      if (servoDS04Angle == servoDS04Target) {
        // Objetivo alcanzado, detener
        servoDS04Moving = false;
        
        // Para DS04, posición 90 es detenerse
        if (servoDS04Target == 90) {
          servoDS04.write(90); // Detener explícitamente
          Serial.println("DS04 detenido en posición central");
        } else {
          // Mantener la posición de rotación simulada
          Serial.print("DS04 llegó al objetivo: ");
          Serial.println(servoDS04Angle);
          
          // Convertir de 0-360 a 0-180 para servo estándar o a velocidad para continuo
          int servoValue = translateDS04Angle(servoDS04Angle);
          servoDS04.write(servoValue);
        }
      } else {
        // Mover gradualmente hacia el objetivo (5 grados por paso)
        int step = 1;
        if (servoDS04Speed > 1) {
          step = 5; // Movimiento más rápido para velocidades medias y altas
        }
        
        if (servoDS04Angle < servoDS04Target) {
          servoDS04Angle = min(servoDS04Angle + step, servoDS04Target);
        } else {
          servoDS04Angle = max(servoDS04Angle - step, servoDS04Target);
        }
        
        // Asegurar límites
        servoDS04Angle = constrain(servoDS04Angle, 0, servoDS04Limit);
        
        // Convertir el ángulo 0-360 a valor adecuado para el servo DS04
        int servoValue = translateDS04Angle(servoDS04Angle);
        servoDS04.write(servoValue);
      }
    }
  }
}

// Convertir ángulo 0-360 a valor para servo continuo DS04
int translateDS04Angle(int angle) {
  // Para servo de rotación continua:
  // 0 = Rotación máxima en sentido antihorario (0 en interfaz)
  // 90 = Detenido
  // 180 = Rotación máxima en sentido horario (180 en interfaz)
  
  // Mapeo simple para simular 0-360 en interfaz pero controlar adecuadamente el servo
  if (angle <= 90) {
    // 0-90 en interfaz -> 90-0 en servo (más lento cuanto más cerca de 90)
    return map(angle, 0, 90, 0, 90);
  } else if (angle <= 180) {
    // 91-180 en interfaz -> 91-180 en servo (más rápido cuanto más cerca de 180)
    return map(angle, 91, 180, 91, 180);
  } else if (angle <= 270) {
    // 181-270 en interfaz -> 180-91 en servo (más lento cuanto más cerca de 91)
    return map(angle, 181, 270, 180, 91);
  } else {
    // 271-360 en interfaz -> 90-0 en servo (más lento cuanto más cerca de 0)
    return map(angle, 271, 360, 90, 0);
  }
}