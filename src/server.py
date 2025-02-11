from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
import shutil
import os
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# In-memory storage for uploaded data
uploaded_data = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://localhost:4200","http://localhost:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...), age: int = Form(...), gender: str = Form(...), mood: str = Form(...), state: bool = Form(...)):
    try:
        file_location = f"uploads/{file.filename}"
        os.makedirs(os.path.dirname(file_location), exist_ok=True)

        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)

        data = {"age": age, "gender": gender, "mood": mood, "state": state, "file_location": file_location}
        uploaded_data.append(data)

        return JSONResponse(content=data)

    except Exception as e:
        print(f"Error during file upload: {e}") 
        # 適切なエラーハンドリングを追加する
        return JSONResponse(status_code=500, content={"message": "Internal Server Error"}) 

@app.get("/data/")
async def get_data():
    if not uploaded_data:
        return JSONResponse(
            content={"message": "No data available"},
            status_code=404
        )
    
    latest_data = uploaded_data[-1]
    return JSONResponse(
        content={
            "age": latest_data["age"],
            "gender": latest_data["gender"],
            "mood": latest_data["mood"],
            "file": latest_data["file_location"]
        }
    )

@app.get("/file/")
async def get_file():
    if not uploaded_data:
        return JSONResponse(
            content={"message": "No data available"},
            status_code=404
        )
    
    latest_data = uploaded_data[-1]
    file_path = latest_data["file_location"]
    
    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path)
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)