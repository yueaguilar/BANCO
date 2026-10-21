import serial
import sys
from datetime import datetime

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyUSB0"
BAUD = 9600

print("BANCO KIKE - Receptor serial")
print(f"Puerto: {PORT} | Velocidad: {BAUD} baudios")
print("Esperando mensajes... Ctrl+C para salir.\n")

try:
    with serial.Serial(PORT, BAUD, timeout=1) as ser:
        ser.reset_input_buffer()

        while True:
            raw = ser.readline()
            if not raw:
                continue

            mensaje = raw.decode("utf-8", errors="replace").strip()
            if mensaje:
                hora = datetime.now().strftime("%H:%M:%S")
                print(f"[{hora}] {mensaje}", flush=True)

except KeyboardInterrupt:
    print("\nReceptor detenido.")
except serial.SerialException as exc:
    print(f"Error serial: {exc}", file=sys.stderr)
    sys.exit(1)
