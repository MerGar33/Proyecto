#!/usr/bin/env python3
# Importando eventlet primero y aplicando monkey patch
import eventlet
eventlet.monkey_patch()

# Importaciones estándar
import os
import sys
import logging
import json
import threading
import subprocess
import base64
import signal
import socket
import time
import serial

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Asegurándose de que todas las dependencias estén instaladas
def check_dependencies():
    required_modules = ["cv2", "numpy", "flask", "flask_cors", "flask_socketio", "serial"]
    missing = []
    
    for module in required_modules:
        try:
            __import__(module.split('.')[0])
        except ImportError:
            missing.append(module)
    
    if missing:
        print(f"Instalando módulos faltantes: {missing}")
        for module in missing:
            subprocess.run([sys.executable, "-m", "pip", "install", module])
        print("Módulos instalados. Reiniciando script...")
        os.execl(sys.executable, sys.executable, *sys.argv)
    else:
        print("Todas las dependencias están instaladas")

# Verificar dependencias
check_dependencies()

# Ahora importamos los módulos después de verificar que estén instalados
import numpy as np
import cv2
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

# Matar procesos previos en puertos requeridos
def kill_processes_on_ports(ports):
    for port in ports:
        try:
            subprocess.run(
                f"fuser -k {port}/tcp",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            logger.info(f"Liberado puerto {port}")
        except Exception as e:
            logger.error(f"Error al liberar puerto {port}: {e}")

# Limpiar puertos antes de iniciar
ports_to_clear = [5001]
logger.info(f"Limpiando puertos: {ports_to_clear}")
kill_processes_on_ports(ports_to_clear)
time.sleep(1)  # Esperar a que se liberen los puertos

# Detectar dispositivo de cámara disponible
def detect_camera():
    try:
        # Probar con libcamera (para Raspberry Pi Camera v3)
        result = subprocess.run(
            ['libcamera-hello', '--list-cameras'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        if "Available cameras" in result.stdout or "Available cameras" in result.stderr:
            logger.info("Cámara libcamera detectada")
            return "libcamera"
        
        # Probar con OpenCV
        for i in range(4):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                logger.info(f"Cámara OpenCV detectada en {i}")
                cap.release()
                return f"video={i}"
        
        # Por defecto para Raspberry Pi Camera v3
        logger.info("Ninguna cámara detectada, usando valor predeterminado")
        return "libcamera:///base/soc/i2c0mux/i2c@1/imx708@1a"
    except Exception as e:
        logger.error(f"Error al detectar cámara: {e}")
        return "libcamera:///base/soc/i2c0mux/i2c@1/imx708@1a"

# Configuración del servidor Flask y Socket.IO
app = Flask(__name__, static_folder='.')
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,
    engineio_logger=True,
    ping_timeout=5000,
    ping_interval=25000
)

# Tipo de dispositivo de cámara
camera_device = detect_camera()

# Clase para gestionar el control de motores
# Modificar la clase MotorService para separar los motores de los servos

class MotorService:
    def __init__(self):
        self.motor_arduino = None
        self.servo_arduino = None
        self.motor_arduino_connected = False
        self.servo_arduino_connected = False
        self.last_motor_command = None
        self.last_servo_command = None
        self.reconnect_thread = None
        self.reconnect_active = False
        self.motor_status = {
            'mode': 'off',
            'motor1': {'speed': 0, 'direction': 'forward'},
            'motor2': {'speed': 0, 'direction': 'forward'},
            'motor3': {'speed': 0, 'direction': 'forward'},
            'motor4': {'speed': 0, 'direction': 'forward'}
        }
        self.servo_status = {
            'mg995': {'angle': 0, 'speed': 2, 'moving': False, 'reverse': False, 'limit': 180},
            'ds04': {'angle': 0, 'speed': 2, 'moving': False, 'reverse': False, 'limit': 360}
        }
        # Iniciar intento de conexión automática
        self.reconnect_active = True
        self.reconnect_thread = threading.Thread(target=self._auto_reconnect)
        self.reconnect_thread.daemon = True
        self.reconnect_thread.start()

    def _auto_reconnect(self):
        """Intenta reconectar automáticamente con ambos Arduinos"""
        retry_delay = 5  # Segundos iniciales entre intentos
        max_retry_delay = 30  # Máximo retraso entre intentos
        while self.reconnect_active:
            # Intentar conectar con Arduino de motores
            if not self.motor_arduino_connected:
                logger.info("Intentando conectar con Arduino de motores...")
                if self.init_motor_arduino():
                    logger.info("¡Conexión con Arduino de motores establecida!")
                    # Si hay un comando anterior, reenviar
                    if self.last_motor_command:
                        logger.info(f"Reenviando último comando de motor: {self.last_motor_command}")
                        self.send_motor_command(self.last_motor_command)
                    retry_delay = 5  # Resetear el retraso si conectamos exitosamente
                else:
                    # Incrementar el retraso exponencialmente hasta el máximo
                    retry_delay = min(retry_delay * 1.5, max_retry_delay)
            
            # Intentar conectar con Arduino de servos
            if not self.servo_arduino_connected:
                logger.info("Intentando conectar con Arduino de servos...")
                if self.init_servo_arduino():
                    logger.info("¡Conexión con Arduino de servos establecida!")
                    # Arduino de servos se auto-calibra al iniciar
                    retry_delay = 5  # Resetear el retraso si conectamos exitosamente
                else:
                    # Incrementar el retraso exponencialmente hasta el máximo
                    retry_delay = min(retry_delay * 1.5, max_retry_delay)
            
            # Esperar antes del próximo intento
            time.sleep(retry_delay)

    def init_motor_arduino(self):
        """Inicializa la conexión con Arduino de motores"""
        try:
            # Cerrar conexión previa si existe
            if self.motor_arduino is not None and self.motor_arduino.is_open:
                self.motor_arduino.close()
                time.sleep(0.5)  # Esperar a que se cierre correctamente
                
            # Intentar diferentes puertos serie comunes en Raspberry Pi
            # Para Arduino de motores (probamos primero ttyACM0 y ttyUSB0)
            potential_ports = ['/dev/ttyACM0', '/dev/ttyUSB0', '/dev/ttyACM1', '/dev/ttyUSB1']
            
            for port in potential_ports:
                try:
                    # Intentar abrir la conexión con un timeout más largo
                    self.motor_arduino = serial.Serial(port, 9600, timeout=2)
                    time.sleep(2)  # Esperar a que Arduino se reinicie
                    
                    # Limpiar buffer de entrada por si hay datos residuales
                    self.motor_arduino.reset_input_buffer()
                    
                    # Prueba básica para verificar comunicación (con retry)
                    max_retries = 3
                    for retry in range(max_retries):
                        try:
                            self.motor_arduino.write("off,0\n".encode())
                            # Usar un timeout específico para la lectura
                            start_time = time.time()
                            response = ""
                            while time.time() - start_time < 2.0:  # 2 segundos de timeout
                                if self.motor_arduino.in_waiting > 0:
                                    line = self.motor_arduino.readline().decode().strip()
                                    response += line
                                    if "Motores apagados" in response:
                                        break
                                # Usar eventlet.sleep para ser compatible con el loop de eventos
                                eventlet.sleep(0.1)
                                
                            if "Motores apagados" in response:
                                logger.info(f"Conexión con Arduino de motores establecida en {port}")
                                self.motor_arduino_connected = True
                                # Actualizar estado de motores
                                self.motor_status['mode'] = 'off'
                                for motor in range(1, 5):
                                    self.motor_status[f'motor{motor}']['speed'] = 0
                                # Emitir estado actualizado a todos los clientes
                                socketio.emit('motor_status', self.motor_status)
                                
                                # Guardar puerto para evitar conflicto con servo Arduino
                                self.motor_arduino_port = port
                                return True
                            
                            logger.warning(f"Intento {retry+1} fallido, reintentando...")
                            time.sleep(0.5)
                        except Exception as e:
                            logger.warning(f"Error en intento {retry+1}: {str(e)}")
                            time.sleep(0.5)
                    
                    # Si llegamos aquí, no se pudo conectar después de varios intentos
                    if self.motor_arduino and self.motor_arduino.is_open:
                        self.motor_arduino.close()
                except Exception as e:
                    logger.debug(f"No se pudo conectar a {port}: {str(e)}")
                    continue
            
            logger.error("No se pudo establecer conexión con Arduino de motores en ningún puerto")
            self.motor_arduino_connected = False
            return False
        
        except Exception as e:
            logger.error(f"Error al inicializar Arduino de motores: {str(e)}")
            self.motor_arduino_connected = False
            return False

    def init_servo_arduino(self):
        """Inicializa la conexión con Arduino de servos"""
        try:
            # Cerrar conexión previa si existe
            if self.servo_arduino is not None and self.servo_arduino.is_open:
                self.servo_arduino.close()
                time.sleep(0.5)  # Esperar a que se cierre correctamente
                
            # Intentar diferentes puertos serie evitando el puerto ya usado por el Arduino de motores
            potential_ports = ['/dev/ttyACM0', '/dev/ttyUSB0', '/dev/ttyACM1', '/dev/ttyUSB1']
            
            # Reordenar la lista para probar primero puertos diferentes al del Arduino de motores
            if hasattr(self, 'motor_arduino_port') and self.motor_arduino_port in potential_ports:
                potential_ports.remove(self.motor_arduino_port)
                potential_ports.append(self.motor_arduino_port)  # Lo movemos al final
            
            for port in potential_ports:
                # Evitar probar el puerto ya usado por el Arduino de motores
                if hasattr(self, 'motor_arduino_port') and port == self.motor_arduino_port:
                    continue
                    
                try:
                    # Intentar abrir la conexión
                    self.servo_arduino = serial.Serial(port, 9600, timeout=2)
                    time.sleep(2)  # Esperar a que Arduino se reinicie
                    
                    # Limpiar buffer de entrada
                    self.servo_arduino.reset_input_buffer()
                    
                    # Comprobar si este es el Arduino de servos
                    # Enviar comando para verificar servo
                    self.servo_arduino.write("servo,mg995,stop\n".encode())
                    
                    # Esperar respuesta
                    start_time = time.time()
                    response = ""
                    while time.time() - start_time < 2.0:
                        if self.servo_arduino.in_waiting > 0:
                            line = self.servo_arduino.readline().decode().strip()
                            response += line + " "
                            # Si contiene alguna respuesta relacionada con servos
                            if "servo" in line.lower() or "mg995" in line.lower() or "ds04" in line.lower():
                                logger.info(f"Conexión con Arduino de servos establecida en {port}")
                                self.servo_arduino_connected = True
                                
                                # Esperar posibles mensajes de calibración
                                time.sleep(1)
                                while self.servo_arduino.in_waiting > 0:
                                    self.servo_arduino.readline()  # Limpiar buffer
                                
                                # Emitir estado actual de servos a todos los clientes
                                socketio.emit('servo_status', {'status': self.servo_status})
                                return True
                        # Pausar brevemente
                        eventlet.sleep(0.1)
                    
                    # Si llegamos aquí, no es el Arduino de servos
                    logger.debug(f"El dispositivo en {port} no respondió como Arduino de servos")
                    if self.servo_arduino and self.servo_arduino.is_open:
                        self.servo_arduino.close()
                except Exception as e:
                    logger.debug(f"No se pudo conectar a {port}: {str(e)}")
                    continue
            
            logger.error("No se pudo establecer conexión con Arduino de servos en ningún puerto")
            self.servo_arduino_connected = False
            return False
        
        except Exception as e:
            logger.error(f"Error al inicializar Arduino de servos: {str(e)}")
            self.servo_arduino_connected = False
            return False

    def send_motor_command(self, command):
        """Envía un comando de control a los motores"""
        try:
            if not self.motor_arduino_connected:
                # Intentar reconectar si no hay conexión
                if not self.init_motor_arduino():
                    logger.error("No hay conexión con Arduino de motores")
                    return False, "No hay conexión con Arduino de motores"
            
            if self.motor_arduino and self.motor_arduino.is_open:
                # Guardar el comando para posibles reconexiones
                self.last_motor_command = command
                
                # Enviar comando al Arduino
                full_command = f"{command}\n"
                self.motor_arduino.write(full_command.encode())
                logger.info(f"Comando enviado a motores: {command}")
                
                # Leer respuesta (con timeout)
                start_time = time.time()
                response = ""
                while time.time() - start_time < 1.0:  # Timeout de 1 segundo
                    if self.motor_arduino.in_waiting > 0:
                        response += self.motor_arduino.readline().decode().strip()
                        if response:
                            break
                    time.sleep(0.1)
                
                # Actualizar estado interno y notificar a clientes
                self._update_motor_status(command)
                socketio.emit('motor_status', self.motor_status)
                
                return True, response or "Comando enviado"
            
            return False, "Puerto serie no disponible"
        
        except Exception as e:
            logger.error(f"Error al enviar comando al motor: {str(e)}")
            # Marcar Arduino como desconectado para forzar reconexión
            self.motor_arduino_connected = False
            # Cerrar puerto para evitar bloqueo
            if self.motor_arduino and self.motor_arduino.is_open:
                try:
                    self.motor_arduino.close()
                except:
                    pass
            return False, f"Error: {str(e)}"
    
    def send_servo_command(self, servo_type, action, params=None):
        """Envía un comando de control a los servos con mejor manejo de errores"""
        try:
            if not self.servo_arduino_connected:
                # Intentar reconectar si no hay conexión
                if not self.init_servo_arduino():
                    logger.error("No hay conexión con Arduino de servos")
                    return False, "No hay conexión con Arduino de servos"
            
            if self.servo_arduino and self.servo_arduino.is_open:
                # Construir el comando
                command = f"servo,{servo_type},{action}"
                if params:
                    command += f",{params}"
                
                # Guardar el comando para posibles reconexiones
                self.last_servo_command = command
                
                # Enviar comando al Arduino
                full_command = f"{command}\n"
                self.servo_arduino.write(full_command.encode())
                logger.info(f"Comando de servo enviado: {command}")
                
                # Leer respuesta (con timeout extendido para comandos importantes)
                start_time = time.time()
                timeout = 2.0 if action in ["stop", "move"] else 1.0
                response = ""
                
                while time.time() - start_time < timeout:
                    if self.servo_arduino.in_waiting > 0:
                        line = self.servo_arduino.readline().decode().strip()
                        response += line + "\n"
                        
                        # Si es una actualización de ángulo del servo, procesarla
                        if line.startswith("servo_angle"):
                            parts = line.split(',')
                            if len(parts) >= 3:
                                servo_name = parts[1]
                                try:
                                    angle = int(parts[2])
                                    self._update_servo_angle(servo_name, angle)
                                except ValueError:
                                    logger.warning(f"Valor de ángulo no válido: {parts[2]}")
                        
                        # Si es una confirmación de detención, procesarla
                        elif line.startswith("servo_stopped"):
                            parts = line.split(',')
                            if len(parts) >= 2:
                                servo_name = parts[1]
                                self.servo_status[servo_name]['moving'] = False
                                socketio.emit('servo_stopped', {
                                    'servo_type': servo_name,
                                    'success': True
                                })
                        
                        # Considerar la respuesta como completa si contiene información relevante
                        if (line and not line.startswith("servo_angle") and
                            not line.startswith("servo_stopped")):
                            break
                    
                    # Usar tiempo de espera compatible con el loop de eventos
                    eventlet.sleep(0.05)
                
                # Actualizar estado interno basado en el comando
                self._update_servo_status(servo_type, action, params)
                
                # Notificar a clientes sobre el nuevo estado
                socketio.emit('servo_status', {'status': self.servo_status})
                
                return True, response.strip() or "Comando de servo enviado"
            
            return False, "Puerto serie no disponible"
        
        except Exception as e:
            logger.error(f"Error al enviar comando al servo: {str(e)}")
            # Marcar Arduino como desconectado para forzar reconexión
            self.servo_arduino_connected = False
            # Cerrar puerto para evitar bloqueo
            if self.servo_arduino and self.servo_arduino.is_open:
                try:
                    self.servo_arduino.close()
                except:
                    pass
            return False, f"Error: {str(e)}"
    
    # El resto de los métodos (_update_motor_status, _update_servo_status, etc.) se mantienen igual
    
    def stop_motors(self):
        """Detiene todos los motores y cierra la conexión"""
        try:
            if self.motor_arduino and self.motor_arduino.is_open:
                self.send_motor_command("off,0")
                time.sleep(0.5)
                self.motor_arduino.close()
            self.motor_arduino_connected = False
            return True
        except Exception as e:
            logger.error(f"Error al detener motores: {str(e)}")
            return False
    
    def stop_servos(self):
        """Detiene todos los servos y cierra la conexión"""
        try:
            if self.servo_arduino and self.servo_arduino.is_open:
                # Detener ambos servos
                self.send_servo_command("mg995", "stop")
                time.sleep(0.2)
                self.send_servo_command("ds04", "stop")
                time.sleep(0.5)
                self.servo_arduino.close()
            self.servo_arduino_connected = False
            return True
        except Exception as e:
            logger.error(f"Error al detener servos: {str(e)}")
            return False
    
    def stop_all(self):
        """Detiene todos los dispositivos y cierra conexiones"""
        motor_stopped = self.stop_motors()
        servo_stopped = self.stop_servos()
        self.reconnect_active = False
        if self.reconnect_thread and self.reconnect_thread.is_alive():
            self.reconnect_thread.join(timeout=1)
        logger.info("Todos los dispositivos detenidos")
        return motor_stopped and servo_stopped

# Clase para gestionar el streaming de video por Socket.IO
class CameraService:
    def __init__(self):
        self.stream_active = False
        self.stream_thread = None
        self.process = None
        self.clients = set()
        self.quality = 80  # Calidad JPEG por defecto (1-100)
        self.width = 640
        self.height = 480
        self.fps = 30
        
    def add_client(self, client_id):
        self.clients.add(client_id)
        logger.info(f"Cliente {client_id} conectado. Total: {len(self.clients)}")
        socketio.emit('connection_status', {'status': 'connected'}, room=client_id)
        
        # Iniciar automáticamente la transmisión cuando se conecta un cliente
        if not self.stream_active and len(self.clients) > 0:
            self.start_stream()
    
    def remove_client(self, client_id):
        self.clients.discard(client_id)
        logger.info(f"Cliente {client_id} desconectado. Total: {len(self.clients)}")
        if len(self.clients) == 0 and self.stream_active:
            self.stop_stream()
    
    def set_quality(self, quality):
        """Establecer la calidad de compresión JPEG (1-100)"""
        if 1 <= quality <= 100:
            self.quality = quality
            logger.info(f"Calidad de video ajustada a {quality}")
            return True
        return False
    
    def set_resolution(self, width, height):
        """Establecer la resolución del video"""
        if width > 0 and height > 0:
            self.width = width
            self.height = height
            logger.info(f"Resolución ajustada a {width}x{height}")
            
            # Reiniciar el stream si está activo
            if self.stream_active:
                self.stop_stream()
                self.start_stream()
            return True
        return False
    
    def set_fps(self, fps):
        """Establecer los FPS del video"""
        if 1 <= fps <= 60:
            self.fps = fps
            logger.info(f"FPS ajustados a {fps}")
            return True
        return False
    
    def start_stream(self):
        if not self.stream_active:
            self.stream_active = True
            self.stream_thread = threading.Thread(target=self._stream_video)
            self.stream_thread.daemon = True
            self.stream_thread.start()
            logger.info("Streaming iniciado")
            socketio.emit('stream_status', {'status': 'started'})
            return True
        return False
    
    def stop_stream(self):
        if self.stream_active:
            self.stream_active = False
            
            # Esperar a que el hilo termine
            if self.stream_thread and self.stream_thread.is_alive():
                self.stream_thread.join(timeout=5)
            
            # Terminar el proceso de libcamera si está en ejecución
            if self.process and self.process.poll() is None:
                try:
                    self.process.terminate()
                    self.process.wait(timeout=2)
                except:
                    try:
                        self.process.kill()
                    except:
                        pass
                finally:
                    self.process = None
            
            logger.info("Streaming detenido")
            socketio.emit('stream_status', {'status': 'stopped'})
            return True
        return False
    
    def _stream_video(self):
        """Función para transmitir video mediante Socket.IO"""
        if camera_device == "libcamera" or camera_device.startswith("libcamera:"):
            # Usar libcamera para Raspberry Pi Camera v3
            try:
                cmd = [
                    'libcamera-vid',
                    '-t', '0',                        # Sin límite de tiempo
                    '--width', str(self.width),       # Ancho del video
                    '--height', str(self.height),     # Alto del video
                    '--framerate', str(self.fps),     # Tasa de fotogramas
                    '--codec', 'mjpeg',               # Formato de compresión
                    '--output', '-'                   # Salida a stdout
                ]
                
                logger.info(f"Iniciando libcamera-vid con comando: {' '.join(cmd)}")
                self.process = subprocess.Popen(cmd, stdout=subprocess.PIPE)
                frame_buffer = bytearray()
                frame_count = 0
                last_time = time.time()
                real_fps = 0
                
                while self.stream_active and len(self.clients) > 0:
                    # Leer chunk de datos de la salida de libcamera-vid
                    chunk = self.process.stdout.read(4096)
                    if not chunk:
                        logger.warning("No se están recibiendo datos de libcamera-vid")
                        time.sleep(0.1)
                        continue
                    
                    # Acumular datos en el buffer
                    frame_buffer.extend(chunk)
                    
                    # Buscar marcadores JPEG para extraer frames completos
                    start_marker = frame_buffer.find(b'\xff\xd8')
                    end_marker = frame_buffer.find(b'\xff\xd9')
                    
                    if start_marker != -1 and end_marker != -1 and end_marker > start_marker:
                        # Extraer frame completo JPEG
                        frame_data = frame_buffer[start_marker:end_marker + 2]
                        frame_buffer = frame_buffer[end_marker + 2:]
                        
                        # Calcular FPS real
                        frame_count += 1
                        now = time.time()
                        if now - last_time >= 1.0:
                            real_fps = frame_count / (now - last_time)
                            frame_count = 0
                            last_time = now
                            
                        try:
                            # Convertir a base64 y enviar por Socket.IO
                            frame_base64 = base64.b64encode(frame_data).decode('utf-8')
                            
                            # Usar con app.app_context para evitar errores de contexto
                            with app.app_context():
                                socketio.emit('video_frame', {
                                    'frame': frame_base64,
                                    'fps': round(real_fps, 1),
                                    'width': self.width,
                                    'height': self.height
                                })
                        except Exception as e:
                            logger.error(f"Error al enviar frame: {e}")
                        
                        # Control de velocidad para respetar los FPS solicitados
                        target_delay = 1.0 / self.fps
                        eventlet.sleep(max(0, target_delay - 0.01))  # Pequeño margen para procesamiento
            
            except Exception as e:
                logger.error(f"Error en streaming con libcamera: {e}")
            finally:
                if self.process:
                    try:
                        self.process.terminate()
                    except:
                        pass
                    self.process = None
        else:
            # Usar OpenCV para cámaras estándar
            try:
                device_id = int(camera_device.split('=')[1]) if camera_device.startswith('video=') else 0
                cap = cv2.VideoCapture(device_id)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_FPS, self.fps)
                
                if not cap.isOpened():
                    logger.error(f"No se pudo abrir la cámara {device_id}")
                    return
                
                frame_count = 0
                last_time = time.time()
                real_fps = 0
                
                while self.stream_active and len(self.clients) > 0:
                    ret, frame = cap.read()
                    if not ret:
                        logger.warning("Error al leer frame de la cámara")
                        time.sleep(0.1)
                        continue
                    
                    # Calcular FPS real
                    frame_count += 1
                    now = time.time()
                    if now - last_time >= 1.0:
                        real_fps = frame_count / (now - last_time)
                        frame_count = 0
                        last_time = now
                    
                    try:
                        # Codificar como JPEG y convertir a base64
                        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, self.quality])
                        frame_base64 = base64.b64encode(buffer.tobytes()).decode('utf-8')
                        
                        # Enviar por Socket.IO
                        with app.app_context():
                            socketio.emit('video_frame', {
                                'frame': frame_base64,
                                'fps': round(real_fps, 1),
                                'width': self.width,
                                'height': self.height
                            })
                    except Exception as e:
                        logger.error(f"Error al enviar frame: {e}")
                    
                    # Control de velocidad para respetar los FPS solicitados
                    target_delay = 1.0 / self.fps
                    eventlet.sleep(max(0, target_delay - 0.01))
                
            except Exception as e:
                logger.error(f"Error en streaming con OpenCV: {e}")
            finally:
                if 'cap' in locals() and cap.isOpened():
                    cap.release()

# Instanciar servicios
camera_service = CameraService()
motor_service = MotorService()

# Rutas de Flask
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/server_info')
def server_info():
    return jsonify({
        "status": "online",
        "camera_type": camera_device,
        "stream_active": camera_service.stream_active,
        "clients_connected": len(camera_service.clients),
        "quality": camera_service.quality,
        "resolution": f"{camera_service.width}x{camera_service.height}",
        "fps": camera_service.fps,
        "arduino_connected": motor_service.arduino_connected,
        "motor_status": motor_service.motor_status,
        "servo_status": motor_service.servo_status
    })

# Eventos Socket.IO - Conexión y Video
# Eventos Socket.IO - Conexión y Video
@socketio.on('connect')
def handle_connect():
    client_id = request.sid
    camera_service.add_client(client_id)
    
    # Enviar estado actual de motores al cliente que se conecta
    socketio.emit('motor_status', motor_service.motor_status, room=client_id)
    
    # Enviar estado actual de servos al cliente que se conecta
    socketio.emit('servo_status', motor_service.servo_status, room=client_id)
    
    # Inicializar los servos si el Arduino está conectado
    if motor_service.arduino_connected:
        logger.info("Enviando comandos de calibración inicial para servos")
        motor_service.send_servo_command('mg995', 'move', '0,2,calibration')
        time.sleep(0.5)  # Pequeña pausa para evitar sobrecarga
        motor_service.send_servo_command('ds04', 'move', '0,2,calibration')

# Modificación en handle_control_servos para manejar comandos de calibración
@socketio.on('control_servos')
def handle_control_servos(data):
    """Manejar comandos de control de servos"""
    logger.info(f"Solicitud de control de servo recibida: {data}")
    
    if not data or 'action' not in data or 'servo_type' not in data:
        return {'success': False, 'response': 'Parámetros insuficientes'}
    
    action = data['action']
    servo_type = data['servo_type']
    
    # Verificar que el tipo de servo sea válido
    if servo_type not in ['mg995', 'ds04']:
        return {'success': False, 'response': 'Tipo de servo no válido'}
    
    # Ejecutar la acción correspondiente
    if action == 'move':
        # Mover el servo a un ángulo específico
        if 'angle' not in data:
            return {'success': False, 'response': 'Ángulo no especificado'}
        
        angle = int(data['angle'])
        speed = int(data.get('speed', 2))  # Velocidad por defecto: media (2)
        force_stop = data.get('force_stop', False)  # Indicador de forzar detención
        calibration = data.get('calibration', False)  # Indicador de calibración
        
        # Validar ángulo según el tipo de servo
        if servo_type == 'mg995' and not 0 <= angle <= 180:
            return {'success': False, 'response': 'Ángulo no válido para MG995 (0-180)'}
        elif servo_type == 'ds04' and not 0 <= angle <= 360:
            return {'success': False, 'response': 'Ángulo no válido para DS04 (0-360)'}
        
        # Validar velocidad
        if not 1 <= speed <= 3:
            return {'success': False, 'response': 'Velocidad no válida (1-3)'}
        
        # Construir comando con indicadores
        params = f"{angle},{speed}"
        if force_stop:
            params += ",force_stop"
        if calibration:
            params += ",calibration"
            
        success, response = motor_service.send_servo_command(servo_type, action, params)
        
        # Si es una calibración, actualizar el estado inmediatamente
        if calibration:
            motor_service.servo_status[servo_type]['angle'] = angle
            socketio.emit('servo_angle', {
                'servo_type': servo_type,
                'angle': angle
            })

@socketio.on('disconnect')
def handle_disconnect():
    client_id = request.sid
    camera_service.remove_client(client_id)

@socketio.on('start_stream')
def handle_start_stream(data=None):
    logger.info("Solicitud para iniciar stream recibida")
    
    # Actualizar configuración si se proporciona
    if data:
        if 'quality' in data:
            camera_service.set_quality(int(data['quality']))
        if 'width' in data and 'height' in data:
            camera_service.set_resolution(int(data['width']), int(data['height']))
        if 'fps' in data:
            camera_service.set_fps(int(data['fps']))
    
    success = camera_service.start_stream()
    return {'success': success}

@socketio.on('stop_stream')
def handle_stop_stream():
    logger.info("Solicitud para detener stream recibida")
    success = camera_service.stop_stream()
    return {'success': success}

@socketio.on('set_quality')
def handle_set_quality(data):
    logger.info(f"Solicitud para cambiar calidad: {data}")
    if 'quality' in data:
        success = camera_service.set_quality(int(data['quality']))
        return {'success': success}
    return {'success': False}

@socketio.on('set_resolution')
def handle_set_resolution(data):
    logger.info(f"Solicitud para cambiar resolución: {data}")
    if 'width' in data and 'height' in data:
        success = camera_service.set_resolution(int(data['width']), int(data['height']))
        return {'success': success}
    return {'success': False}

@socketio.on('set_fps')
def handle_set_fps(data):
    logger.info(f"Solicitud para cambiar FPS: {data}")
    if 'fps' in data:
        success = camera_service.set_fps(int(data['fps']))
        return {'success': success}
    return {'success': False}

# Eventos Socket.IO - Control de Motores
@socketio.on('init_motors')
def handle_init_motors():
    """Inicializar conexión con Arduino"""
    success = motor_service.init_arduino()
    return {'success': success, 'status': motor_service.motor_status}

@socketio.on('motors_off')
def handle_motors_off():
    """Apagar todos los motores"""
    success, response = motor_service.send_motor_command("off,0")
    return {'success': success, 'response': response, 'status': motor_service.motor_status}

@socketio.on('synchronized_mode')
def handle_synchronized_mode(data):
    """Control sincronizado - todos los motores a la misma velocidad"""
    speed = data.get('speed', 0)
    reverse = data.get('reverse', False)
    
    # Validar la velocidad
    if not isinstance(speed, int) or speed < 0 or speed > 255:
        return {'success': False, 'response': 'Velocidad no válida (0-255)'}
    
    command = f"synchronized,{speed},{'reverse' if reverse else 'forward'}"
    success, response = motor_service.send_motor_command(command)
    return {'success': success, 'response': response, 'status': motor_service.motor_status}

@socketio.on('differential_mode')
def handle_differential_mode(data):
    """Control diferencial - dos pares de motores con velocidades diferentes"""
    speed1 = data.get('speed1', 0)
    speed2 = data.get('speed2', 0)
    reverse1 = data.get('reverse1', False)
    reverse2 = data.get('reverse2', False)
    
    # Validar velocidades
    if not all(isinstance(s, int) and 0 <= s <= 255 for s in [speed1, speed2]):
        return {'success': False, 'response': 'Velocidades no válidas (0-255)'}
    
    command = f"differential,{speed1},{'reverse1' if reverse1 else 'forward1'},{speed2},{'reverse2' if reverse2 else 'forward2'}"
    success, response = motor_service.send_motor_command(command)
    return {'success': success, 'response': response, 'status': motor_service.motor_status}

@socketio.on('independent_mode')
def handle_independent_mode(data):
    """Control independiente - cada motor con su propia velocidad"""
    speed1 = data.get('speed1', 0)
    speed2 = data.get('speed2', 0)
    speed3 = data.get('speed3', 0)
    speed4 = data.get('speed4', 0)
    reverse1 = data.get('reverse1', False)
    reverse2 = data.get('reverse2', False)
    reverse3 = data.get('reverse3', False)
    reverse4 = data.get('reverse4', False)
    
    # Validar velocidades
    if not all(isinstance(s, int) and 0 <= s <= 255 for s in [speed1, speed2, speed3, speed4]):
        return {'success': False, 'response': 'Velocidades no válidas (0-255)'}
    
    command = f"independent,{speed1},{'reverse1' if reverse1 else 'forward1'},{speed2},{'reverse2' if reverse2 else 'forward2'},{speed3},{'reverse3' if reverse3 else 'forward3'},{speed4},{'reverse4' if reverse4 else 'forward4'}"
    success, response = motor_service.send_motor_command(command)
    return {'success': success, 'response': response, 'status': motor_service.motor_status}

@socketio.on('motor_status_request')
def handle_motor_status_request():
    """Obtener el estado actual de los motores"""
    return {'status': motor_service.motor_status, 'connected': motor_service.arduino_connected}

# Eventos Socket.IO - Control de Servos
# Eventos Socket.IO - Control de Servos
@socketio.on('control_servos')
def handle_control_servos(data):
    """Manejar comandos de control de servos"""
    logger.info(f"Solicitud de control de servo recibida: {data}")
    
    if not data or 'action' not in data or 'servo_type' not in data:
        return {'success': False, 'response': 'Parámetros insuficientes'}
    
    action = data['action']
    servo_type = data['servo_type']
    
    # Verificar que el tipo de servo sea válido
    if servo_type not in ['mg995', 'ds04']:
        return {'success': False, 'response': 'Tipo de servo no válido'}
    
    # Ejecutar la acción correspondiente
    if action == 'move':
        # Mover el servo a un ángulo específico
        if 'angle' not in data:
            return {'success': False, 'response': 'Ángulo no especificado'}
        
        angle = int(data['angle'])
        speed = int(data.get('speed', 2))  # Velocidad por defecto: media (2)
        force_stop = data.get('force_stop', False)  # Indicador de forzar detención
        
        # Validar ángulo según el tipo de servo
        if servo_type == 'mg995' and not 0 <= angle <= 180:
            return {'success': False, 'response': 'Ángulo no válido para MG995 (0-180)'}
        elif servo_type == 'ds04' and not 0 <= angle <= 360:
            return {'success': False, 'response': 'Ángulo no válido para DS04 (0-360)'}
        
        # Validar velocidad
        if not 1 <= speed <= 3:
            return {'success': False, 'response': 'Velocidad no válida (1-3)'}
        
        # Construir comando con indicador de forzar detención si está presente
        params = f"{angle},{speed}"
        if force_stop:
            params += ",force_stop"
            
        success, response = motor_service.send_servo_command(servo_type, action, params)
        
    elif action == 'stop':
        # Detener el movimiento del servo - PRIORIDAD ALTA
        # Procesar inmediatamente
        priority = data.get('priority', False)
        force_stop = data.get('force_stop', False)
        
        # Si tiene indicador de prioridad o forzar detención, agregar al comando
        params = ""
        if priority:
            params += "priority"
        if force_stop:
            params += ",force_stop" if params else "force_stop"
            
        success, response = motor_service.send_servo_command(servo_type, action, params)
        
        # Actualizar estado inmediatamente
        motor_service.servo_status[servo_type]['moving'] = False
        
    elif action == 'speed':
        # Cambiar la velocidad del servo
        if 'speed' not in data:
            return {'success': False, 'response': 'Velocidad no especificada'}
        
        speed = int(data['speed'])
        if not 1 <= speed <= 3:
            return {'success': False, 'response': 'Velocidad no válida (1-3)'}
        
        success, response = motor_service.send_servo_command(servo_type, action, str(speed))
        
    elif action == 'reverse':
        # Invertir la dirección del servo
        success, response = motor_service.send_servo_command(servo_type, action)
        
    else:
        return {'success': False, 'response': 'Acción no válida'}
    
    return {
        'success': success, 
        'response': response, 
        'status': motor_service.servo_status
    }

@socketio.on('servo_status_request')
def handle_servo_status_request():
    """Obtener el estado actual de los servos"""
    return {'status': motor_service.servo_status}

# Función principal
def main():
    try:
        # Iniciar servidor Socket.IO
        logger.info(f"Iniciando servidor integrado (video + motores) en http://0.0.0.0:5001")
        socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
    except Exception as e:
        logger.error(f"Error al iniciar servidor: {e}")
        sys.exit(1)

if __name__ == '__main__':
    # Manejar señales para cierre limpio
    def signal_handler(sig, frame):
        logger.info("Senal de interrupcion recibida. Deteniendo servidores...")
        # Usar eventlet.spawn para ejecutar operaciones bloqueantes fuera del bucle principal
        def shutdown():
            try:
                camera_service.stop_stream()
                motor_service.stop_motors()
            except Exception as e:
                logger.error(f"Error durante el cierre: {e}")
            finally:
                sys.exit(0)
        
        eventlet.spawn(shutdown)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    main()
