from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import shutil
import os
import time
import cv2
import numpy as np
from app.inference import process_video, yolo_model

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

@router.get("/status")
def status():
    return {"status": "ok", "message": "Backend UrbanSense funcionando"}

@router.post("/upload-video")
async def upload_video(video: UploadFile = File(...)):
    if not video:
        return JSONResponse(status_code=400, content={"error": "No se subió ningún video"})
    
    file_ext = os.path.splitext(video.filename)[1]
    temp_filename = f"temp_video_{int(time.time())}{file_ext}"
    temp_path = os.path.join(UPLOADS_DIR, temp_filename)
    
    try:
        from app.inference import yolo_model, cnn_model
        if yolo_model is None or cnn_model is None:
            return JSONResponse(status_code=500, content={"error": "Los modelos de IA no se cargaron correctamente. Revisa la terminal del backend para ver el error exacto."})

        # Guardar archivo subido
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
            
        # Procesar con IA
        resultados = process_video(temp_path)
        
        # Opcional: borrar el archivo después de procesar para ahorrar espacio
        os.remove(temp_path)
        
        return JSONResponse(content={"success": True, "data": resultados})
        
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post("/live-camera")
async def live_camera(frame: UploadFile = File(...)):
    if not frame:
        return JSONResponse(status_code=400, content={"error": "No frame received"})
    
    try:
        # Leer la imagen en memoria (sin guardar a disco)
        contents = await frame.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image"})
        
        # Ejecutar YOLOv8 en el frame
        if yolo_model is None:
            return JSONResponse(status_code=500, content={"error": "El modelo YOLO no está cargado."})
            
        resultados = yolo_model(img, verbose=False)[0]
        
        counts = {"car": 0, "bus": 0, "truck": 0, "motor": 0, "van": 0}
        total_vehiculos = 0
        
        for box in resultados.boxes:
            cls_id = int(box.cls[0].item())
            nombre_clase = yolo_model.names[cls_id].lower()
            
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
                if cls_id in [2, 3, 5, 7]: 
                    counts["car"] += 1
                    total_vehiculos += 1
                    
        return JSONResponse(content={
            "success": True,
            "data": {
                "total": total_vehiculos,
                "counts": counts
            }
        })
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
