from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
import shutil
import os
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# In-memory storage for uploaded data
uploaded_data = []
setting_data = {}

# Get port from environment variable or use default
port = int(os.environ.get("PORT", 8888))

# Define allowed origins based on port
allowed_origins = [
    "http://localhost:3000",  # aituberkit
    f"http://localhost:{port}",
    "http://localhost:4200",  # Default Angular dev server
    f"http://localhost:{port}",
]

# Add any specific origins from environment
if os.environ.get("ALLOWED_ORIGIN"):
    allowed_origins.append(os.environ.get("ALLOWED_ORIGIN"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload/")
async def upload_file(
    file: UploadFile = None,  # Make file optional
    age: str = Form(...),  # Changed from int to str for flexibility
    gender: str = Form(...), 
    mood: str = Form(...), 
    recognizestate: str = Form(...),  # Changed from bool to str
    recognizedname: str = Form(...)):
    try:
        file_location = None
        # Only process file if it exists
        if file:
            file_location = f"uploads/{file.filename}"
            os.makedirs(os.path.dirname(file_location), exist_ok=True)

            with open(file_location, "wb+") as file_object:
                shutil.copyfileobj(file.file, file_object)

        # Create data dict with or without file_location
        data = {
            "age": age, 
            "gender": gender, 
            "mood": mood, 
            "recognizestate": recognizestate, 
            "recognizedname": recognizedname
        }
        
        # Add file_location only if a file was uploaded
        if file_location:
            data["file_location"] = file_location
        
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
    response_data = {
        "age": latest_data["age"],
        "gender": latest_data["gender"],
        "mood": latest_data["mood"],
        "recognizestate": latest_data["recognizestate"],
        "recognizedname": latest_data["recognizedname"],
    }
    
    # ファイルが存在する場合のみfile_locationを追加
    if "file_location" in latest_data:
        response_data["file"] = latest_data["file_location"]
    else:
        response_data["file"] = None  # または適切な代替値を設定
    
    return JSONResponse(content=response_data)

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

@app.post("/updatename/")
async def update_name(name: str = Form(...)):
    # 受け取ったnameをsetting_dataに追加する
    setting_data["updatename"] = name
    return JSONResponse(
        content={"message": "Name updated successfully"},
        status_code=200
    )

@app.get("/getupdatename/")
async def getupdatename():
    # Return empty string if no data available instead of 404
    if not setting_data or "updatename" not in setting_data:
        return JSONResponse(
            content={"updatename": "NotYet"}
        )
    
    latest_data = setting_data["updatename"]
    return JSONResponse(
        content={"updatename": latest_data}
    )

@app.post("/clearupdatename/")
async def clearupdatename():
    setting_data.clear()
    return JSONResponse(
        content={"message": "Data cleared successfully"},
        status_code=200
    )


if __name__ == "__main__":
    import uvicorn
    print(f"Starting server on port {port}")
    print(f"Allowed origins: {allowed_origins}")
    uvicorn.run(app, host="0.0.0.0", port=port)