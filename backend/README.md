# HoloMed Backend API

FastAPI backend server for HoloMed - Holographic Medical Visualization Platform.

## Features

- User authentication and authorization (JWT)
- 3D model upload and management
- Session tracking
- RESTful API endpoints
- MongoDB database with Beanie ODM

## Setup

### Prerequisites

- Python 3.10+
- MongoDB (local or cloud instance)
- pip

### Installation

1. **Install MongoDB** (if not already installed):
   - **Windows**: Download from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
   - **macOS**: `brew install mongodb-community`
   - **Linux**: Follow [MongoDB Installation Guide](https://www.mongodb.com/docs/manual/installation/)
   - **Docker**: `docker run -d -p 27017:27017 --name mongodb mongo:latest`

2. **Start MongoDB**:
   ```bash
   # Windows (if installed as service, it should start automatically)
   # Or use MongoDB Compass
   
   # macOS/Linux
   mongod
   
   # Docker
   docker start mongodb
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set environment variables** (optional):
   ```bash
   export MONGODB_URL="mongodb://localhost:27017"  # Default
   export DATABASE_NAME="holomed"  # Default
   export SECRET_KEY="your-secret-key-here"
   ```

   Or create a `.env` file:
   ```
   MONGODB_URL=mongodb://localhost:27017
   DATABASE_NAME=holomed
   SECRET_KEY=your-secret-key-here
   ```

5. **Run the server**:
   ```bash
   uvicorn main:app --reload
   ```

The API will be available at `http://localhost:8000`

### API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get access token
- `GET /api/auth/me` - Get current user info

### Models
- `POST /api/models/upload` - Upload 3D model
- `GET /api/models` - List user's models
- `GET /api/models/{model_id}` - Get model details
- `DELETE /api/models/{model_id}` - Delete model

### Sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions` - List user's sessions
- `PATCH /api/sessions/{session_id}/end` - End session

## MongoDB Connection

### Local MongoDB
Default connection: `mongodb://localhost:27017`

### MongoDB Atlas (Cloud)
```bash
export MONGODB_URL="mongodb+srv://deekshitp74:hahaGotyou@cluster0.m7yec1l.mongodb.net/?appName=Cluster0"
```

### Connection String Format
```
mongodb://[username:password@]host[:port][/database][?options]
```

## Development

### Using Docker

```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Build and run backend
docker build -t holomed-backend .
docker run -p 8000:8000 -e MONGODB_URL=mongodb://host.docker.internal:27017 holomed-backend
```

### Database Collections

The following collections are automatically created:
- `users` - User accounts
- `models` - 3D model metadata
- `sessions` - Visualization sessions

## Production Deployment

1. Set proper `SECRET_KEY` environment variable
2. Use MongoDB Atlas or managed MongoDB service
3. Configure CORS origins properly
4. Set up file storage (S3, GCS, etc.)
5. Use a production ASGI server like Gunicorn with Uvicorn workers
6. Enable MongoDB authentication and SSL/TLS
7. Set up MongoDB backups and monitoring

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongosh` or `mongo` should connect
- Check connection string format
- Verify network/firewall settings
- For Docker: use `host.docker.internal` instead of `localhost`

### Database Not Found
- Collections are created automatically on first use
- Check database name in connection string