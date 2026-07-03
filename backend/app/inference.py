import os
import time
import numpy as np
import librosa
import cv2
import torch
from ultralytics import YOLO
from app.models import CNNAudio

# Rutas de los modelos
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
YOLO_PATH = os.path.join(MODELS_DIR, "yolov8_best.pt")
CNN_PATH = os.path.join(MODELS_DIR, "cnn_audio_urbansound.pt")

# Variables globales para los modelos
yolo_model = None
cnn_model = None
device = None

# Clases de UrbanSound8K (del 0 al 9)
AUDIO_CLASSES = [
    "aire_acondicionado", "bocina_auto", "jugando_ninos", "ladrido_perro",
    "perforacion", "motor_ralenti", "disparo", "martillo_neumatico",
    "sirena", "musica_calle"
]

def load_models():
    global yolo_model, cnn_model, device
    print("Cargando modelos de IA...")
    
    # 1. Cargar YOLOv8
    try:
        yolo_model = YOLO(YOLO_PATH)
        print("✓ YOLOv8 cargado")
    except Exception as e:
        print(f"Error cargando YOLOv8: {e}")

    # 2. Cargar CNN Audio
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        cnn_model = CNNAudio(num_clases=10)
        # Cargar state_dict ignorando errores si hay incompatibilidad menor, 
        # asumiendo que los pesos coinciden con la arquitectura
        cnn_model.load_state_dict(torch.load(CNN_PATH, map_location=device))
        cnn_model.to(device)
        cnn_model.eval()
        print(f"✓ CNN Audio cargada en {device}")
    except Exception as e:
        print(f"Error cargando CNN Audio: {e}")

def analizar_audio(video_path):
    """
    Extrae el audio del video, genera el espectrograma Mel y pasa por la CNN.
    """
    temp_audio_path = video_path + "_temp_audio.wav"
    try:
        # Extraer audio usando moviepy (más confiable en Windows sin ffmpeg global)
        from moviepy.editor import VideoFileClip
        try:
            with VideoFileClip(video_path) as clip:
                if clip.audio is None:
                    return "Sin audio", 0.0
                clip.audio.write_audiofile(temp_audio_path, verbose=False, logger=None)
        except Exception as e:
            print(f"Error extrayendo audio con moviepy: {e}")
            return "Desconocido", 0.0

        # librosa carga el .wav generado
        audio, sr = librosa.load(temp_audio_path, sr=22050, duration=4.0)
        
        # Padding si es muy corto
        longitud_deseada = int(22050 * 4.0)
        if len(audio) < longitud_deseada:
            audio = np.pad(audio, (0, longitud_deseada - len(audio)))
        else:
            audio = audio[:longitud_deseada]
            
        # Generar Espectrograma Mel
        mel = librosa.feature.melspectrogram(
            y=audio, sr=22050, n_mels=128, n_fft=1024, hop_length=512
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        
        # Normalizar
        mel_db = (mel_db - mel_db.min()) / (mel_db.max() - mel_db.min() + 1e-6)
        mel_db = mel_db.astype(np.float32)
        
        # Shape esperado por CNN: (1, 1, 128, 173)
        tensor_audio = torch.FloatTensor(mel_db).unsqueeze(0).unsqueeze(0).to(device)
        
        with torch.no_grad():
            salida = cnn_model(tensor_audio)
            prediccion = salida.argmax(1).item()
            
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
            
        return AUDIO_CLASSES[prediccion], float(salida[0][prediccion].item())
    except Exception as e:
        print(f"Error procesando audio: {e}")
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        return "Desconocido", 0.0
        longitud_deseada = int(22050 * 4.0)
        if len(audio) < longitud_deseada:
            audio = np.pad(audio, (0, longitud_deseada - len(audio)))
        else:
            audio = audio[:longitud_deseada]
            
        # Generar Espectrograma Mel
        mel = librosa.feature.melspectrogram(
            y=audio, sr=22050, n_mels=128, n_fft=1024, hop_length=512
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        
        # Normalizar
        mel_db = (mel_db - mel_db.min()) / (mel_db.max() - mel_db.min() + 1e-6)
        mel_db = mel_db.astype(np.float32)
        
        # Shape esperado por CNN: (1, 1, 128, 173)
        tensor_audio = torch.FloatTensor(mel_db).unsqueeze(0).unsqueeze(0).to(device)
        
        with torch.no_grad():
            salida = cnn_model(tensor_audio)
            prediccion = salida.argmax(1).item()
            
        return AUDIO_CLASSES[prediccion], float(salida[0][prediccion].item())
    except Exception as e:
        print(f"Error procesando audio: {e}")
        return "Desconocido", 0.0

def process_video(video_path):
    start_time = time.time()
    
    # 1. Iniciar captura de video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("No se pudo abrir el archivo de video.")
    
    fps_video = cap.get(cv2.CAP_PROP_FPS)
    if not fps_video or np.isnan(fps_video):
        fps_video = 30.0
        
    frames_analizados = 0
    total_vehiculos = 0
    # Conteo por tipo usando las clases COCO/VisDrone por defecto (YOLO detecta carros=2, buses=5, camiones=7)
    counts = {"car": 0, "bus": 0, "truck": 0, "motor": 0, "van": 0}
    
    # Vamos a analizar 1 frame por segundo para hacerlo rápido
    frame_interval = int(fps_video)
    current_frame = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        if current_frame % frame_interval == 0:
            frames_analizados += 1
            
            # Inferencia YOLO
            resultados = yolo_model(frame, verbose=False)[0]
            
            # Contar clases en este frame
            # Nota: yolo_model.names contiene los nombres
            for box in resultados.boxes:
                cls_id = int(box.cls[0].item())
                nombre_clase = yolo_model.names[cls_id].lower()
                
                # Mapear las clases detectadas a nuestras llaves principales
                if "car" in nombre_clase:
                    counts["car"] += 1
                    total_vehiculos += 1
                elif "bus" in nombre_clase:
                    counts["bus"] += 1
                    total_vehiculos += 1
                elif "truck" in nombre_clase:
                    counts["truck"] += 1
                    total_vehiculos += 1
                elif "motor" in nombre_clase or "bike" in nombre_clase:
                    counts["motor"] += 1
                    total_vehiculos += 1
                elif "van" in nombre_clase:
                    counts["van"] += 1
                    total_vehiculos += 1
                else:
                    # Si detecta algo que consideremos vehículo general
                    if cls_id in [2, 3, 5, 7]: # IDs COCO comunes para autos
                        counts["car"] += 1
                        total_vehiculos += 1
                        
        current_frame += 1
        
    cap.release()
    
    # 2. Análisis Acústico (CNN)
    clase_ruido, confianza = analizar_audio(video_path)
    
    end_time = time.time()
    tiempo_procesamiento = end_time - start_time
    
    return {
        "counts": counts,
        "total": total_vehiculos,
        "framesAnalyzed": frames_analizados,
        "noiseClass": clase_ruido,
        "processTimeSec": round(tiempo_procesamiento, 1),
        "fps_video": round(fps_video, 1)
    }
