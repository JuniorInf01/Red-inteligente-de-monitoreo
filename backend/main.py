from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api import router
from app.inference import load_models

# Inicializar app
app = FastAPI(title="UrbanSense API")

# Configurar CORS (Importante para que el frontend pueda hacer peticiones)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permitir peticiones desde cualquier origen (localhost:8080 en dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir las rutas
app.include_router(router)

# Evento de inicio: Cargar modelos a la memoria RAM/VRAM
@app.on_event("startup")
async def startup_event():
    load_models()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
