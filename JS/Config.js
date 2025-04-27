// config.js
export const CONFIG = {
    // Usa la dirección IP correcta de tu Raspberry Pi
    CAMERA: {
        URL: 'http://192.168.101.14:5001',
        WS_URL: 'http://192.168.101.14:5001'
    },
    SERVO: {
        URL: 'http://192.168.101.14:5001',
        WS_URL: 'http://192.168.101.14:5001'  // Socket.IO para control de servos
    },
    MOTOR: {
        URL: 'http://192.168.101.14:5001',
        WS_URL: 'http://192.168.101.14:5001'  // Socket.IO para control de motores
    }
};