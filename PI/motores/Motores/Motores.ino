#include <AFMotor.h>  // Incluir la librería AFMotor para controlar el L293D Shield

// Definición de motores DC
AF_DCMotor motor1(1); // Motor 1 en el canal 1
AF_DCMotor motor2(2); // Motor 2 en el canal 2
AF_DCMotor motor3(3); // Motor 3 en el canal 3
AF_DCMotor motor4(4); // Motor 4 en el canal 4

void setup() {
  Serial.begin(9600);
  Serial.println("Sistema de control de motores inicializado");
}

void loop() {
  // Procesar comandos seriales
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Eliminar espacios en blanco

    // Comando para apagar motores
    if (command == "off,0") {
      apagarMotores();
      Serial.println("Motores apagados.");
    } 
    // Comandos para motores
    else {
      procesarComandoMotor(command);
    }
  }
}

// Procesar comando para motores
void procesarComandoMotor(String command) {
  int firstComma = command.indexOf(','); // Primera coma
  if (firstComma == -1) return;
  
  String mode = command.substring(0, firstComma); // Modo
  String speeds = command.substring(firstComma + 1); // Velocidades
  
  // Controlar los motores según el modo
  if (mode == "synchronized") {
    // Modo sincronizado: todos los motores a la misma velocidad
    int secondComma = speeds.indexOf(','); // Segunda coma
    int speed = speeds.substring(0, secondComma).toInt(); // Velocidad
    String direction = speeds.substring(secondComma + 1); // Dirección
    bool reverse = direction == "reverse";
    controlarMotoresTodos(speed, reverse);
  } 
  else if (mode == "differential") {
    // Modo diferencial: dos pares de motores con velocidades diferentes
    int comma1 = speeds.indexOf(','); // Primera coma
    int comma2 = speeds.indexOf(',', comma1 + 1); // Segunda coma
    int comma3 = speeds.indexOf(',', comma2 + 1); // Tercera coma
    
    int speed1 = speeds.substring(0, comma1).toInt(); // Velocidad M1/M2
    String direction1 = speeds.substring(comma1 + 1, comma2); // Dirección M1/M2
    int speed2 = speeds.substring(comma2 + 1, comma3).toInt(); // Velocidad M3/M4
    String direction2 = speeds.substring(comma3 + 1); // Dirección M3/M4
    
    bool reverse1 = direction1 == "reverse1";
    bool reverse2 = direction2 == "reverse2";
    
    controlarMotoresM1M2(speed1, reverse1);
    controlarMotoresM3M4(speed2, reverse2);
  } 
  else if (mode == "independent") {
    // Modo independiente: cada motor con su propia velocidad
    int comma1 = speeds.indexOf(','); // Primera coma
    int comma2 = speeds.indexOf(',', comma1 + 1); // Segunda coma
    int comma3 = speeds.indexOf(',', comma2 + 1); // Tercera coma
    int comma4 = speeds.indexOf(',', comma3 + 1); // Cuarta coma
    int comma5 = speeds.indexOf(',', comma4 + 1); // Quinta coma
    int comma6 = speeds.indexOf(',', comma5 + 1); // Sexta coma
    int comma7 = speeds.indexOf(',', comma6 + 1); // Séptima coma
    
    int speed1 = speeds.substring(0, comma1).toInt(); // Velocidad M1
    String direction1 = speeds.substring(comma1 + 1, comma2); // Dirección M1
    int speed2 = speeds.substring(comma2 + 1, comma3).toInt(); // Velocidad M2
    String direction2 = speeds.substring(comma3 + 1, comma4); // Dirección M2
    int speed3 = speeds.substring(comma4 + 1, comma5).toInt(); // Velocidad M3
    String direction3 = speeds.substring(comma5 + 1, comma6); // Dirección M3
    int speed4 = speeds.substring(comma6 + 1, comma7).toInt(); // Velocidad M4
    String direction4 = speeds.substring(comma7 + 1); // Dirección M4
    
    bool reverse1 = direction1 == "reverse1";
    bool reverse2 = direction2 == "reverse2";
    bool reverse3 = direction3 == "reverse3";
    bool reverse4 = direction4 == "reverse4";
    
    controlarMotorIndividual(1, speed1, reverse1);
    controlarMotorIndividual(2, speed2, reverse2);
    controlarMotorIndividual(3, speed3, reverse3);
    controlarMotorIndividual(4, speed4, reverse4);
  } 
  else {
    Serial.println("Modo no válido.");
  }
}

// Funciones para controlar los motores
void controlarMotoresTodos(int velocidad, bool reverse) {
    motor1.setSpeed(velocidad);
    motor2.setSpeed(velocidad);
    motor3.setSpeed(velocidad);
    motor4.setSpeed(velocidad);
    
    if (reverse) {
        motor1.run(BACKWARD);
        motor2.run(BACKWARD);
        motor3.run(BACKWARD);
        motor4.run(BACKWARD);
    } else {
        motor1.run(FORWARD);
        motor2.run(FORWARD);
        motor3.run(FORWARD);
        motor4.run(FORWARD);
    }

    Serial.print("Todos los motores a velocidad: ");
    Serial.println(velocidad);
}

void controlarMotoresM1M2(int velocidad, bool reverse) {
    motor1.setSpeed(velocidad);
    motor2.setSpeed(velocidad);
    
    if (reverse) {
        motor1.run(BACKWARD);
        motor2.run(BACKWARD);
    } else {
        motor1.run(FORWARD);
        motor2.run(FORWARD);
    }

    Serial.print("M1 y M2 a velocidad: ");
    Serial.println(velocidad);
}

void controlarMotoresM3M4(int velocidad, bool reverse) {
    motor3.setSpeed(velocidad);
    motor4.setSpeed(velocidad);
    
    if (reverse) {
        motor3.run(BACKWARD);
        motor4.run(BACKWARD);
    } else {
        motor3.run(FORWARD);
        motor4.run(FORWARD);
    }

    Serial.print("M3 y M4 a velocidad: ");
    Serial.println(velocidad);
}

void controlarMotorIndividual(int motorNum, int velocidad, bool reverse) {
    switch (motorNum) {
        case 1:
            motor1.setSpeed(velocidad);
            motor1.run(reverse ? BACKWARD : FORWARD);
            break;
        case 2:
            motor2.setSpeed(velocidad);
            motor2.run(reverse ? BACKWARD : FORWARD);
            break;
        case 3:
            motor3.setSpeed(velocidad);
            motor3.run(reverse ? BACKWARD : FORWARD);
            break;
        case 4:
            motor4.setSpeed(velocidad);
            motor4.run(reverse ? BACKWARD : FORWARD);
            break;
    }

    Serial.print("Motor ");
    Serial.print(motorNum);
    Serial.print(" a velocidad: ");
    Serial.println(velocidad);
}

void apagarMotores() {
  motor1.setSpeed(0);
  motor2.setSpeed(0);
  motor3.setSpeed(0);
  motor4.setSpeed(0);
  
  motor1.run(RELEASE); // Detener motor 1
  motor2.run(RELEASE); // Detener motor 2
  motor3.run(RELEASE); // Detener motor 3
  motor4.run(RELEASE); // Detener motor 4

  Serial.println("Todos los motores han sido apagados.");
}
