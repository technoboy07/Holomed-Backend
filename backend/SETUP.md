# HoloMed Backend Setup Guide

Complete step-by-step guide to set up and run the HoloMed backend server.

## 📋 Prerequisites

Before starting, ensure you have:

- **Python 3.10 or higher** - Check with: `python --version` or `python3 --version`
- **pip** (Python package manager) - Usually comes with Python
- **MongoDB** - Either local installation or cloud instance (MongoDB Atlas)
- **Git** (optional) - For cloning the repository

---

## 🚀 Quick Start (5 Steps)

### Step 1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2: Create Virtual Environment (Recommended)

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt.

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Set Up MongoDB

**Option A: Local MongoDB (Recommended for Development)**

1. **Install MongoDB:**
   - **Windows**: Download from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
   - **macOS**: `brew install mongodb-community`
   - **Linux**: Follow [MongoDB Installation Guide](https://www.mongodb.com/docs/manual/installation/)
   - **Docker**: `docker run -d -p 27017:27017 --name mongodb mongo:latest`

2. **Start MongoDB:**
   - **Windows**: MongoDB usually runs as a service automatically
   - **macOS/Linux**: `mongod` (or `brew services start mongodb-community` on macOS)
   - **Docker**: `docker start mongodb`

3. **Verify MongoDB is running:**
   ```bash
   mongosh  # or `mongo` on older versions
   ```
   If it connects, you're good!

**Option B: MongoDB Atlas (Cloud - Recommended for Production)**

📖 **For detailed MongoDB Atlas setup, see [MONGODB_ATLAS_SETUP.md](./MONGODB_ATLAS_SETUP.md)**

Quick steps:
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a new cluster (M0 FREE tier)
4. Create database user and whitelist IP address
5. Get your connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

### Step 5: Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
# Windows
type nul > .env

# macOS/Linux
touch .env
```

Add the following content to `.env`:

```env
# MongoDB Configuration
# For Local MongoDB:
MONGODB_URL=mongodb://localhost:27017
# For MongoDB Atlas (Cloud):
# MONGODB_URL=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=holomed

# JWT Secret Key (IMPORTANT: Change this to a random string!)
SECRET_KEY=your-super-secret-key-change-this-in-production

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081

# Environment
ENVIRONMENT=development
```

**⚠️ Important:** 
- Replace `SECRET_KEY` with a strong random string (at least 32 characters)
- For MongoDB Atlas, use: `MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/`
- For production, set `ENVIRONMENT=production`

### Step 6: Run the Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or use Python directly:

```bash
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Successfully connected to MongoDB database: holomed
INFO:     Application startup complete.
```

### Step 7: Verify It's Working

1. **Health Check:**
   Open browser: `http://localhost:8000/health`
   Should return: `{"status":"healthy","service":"HoloMed API"}`

2. **API Documentation:**
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

---

## 🔧 Detailed Setup Instructions

### Option 1: Using Virtual Environment (Recommended)

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Upgrade pip
pip install --upgrade pip

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file (see Step 5 above)

# 6. Run server
uvicorn main:app --reload
```

### Option 2: Using Docker

```bash
# 1. Build the Docker image
docker build -t holomed-backend .

# 2. Run MongoDB container
docker run -d -p 27017:27017 --name mongodb mongo:latest

# 3. Run backend container
docker run -p 8000:8000 \
  -e MONGODB_URL=mongodb://host.docker.internal:27017 \
  -e SECRET_KEY=your-secret-key \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  holomed-backend
```

### Option 3: Direct Installation (Not Recommended)

```bash
# Install dependencies globally
pip install -r requirements.txt

# Run server
uvicorn main:app --reload
```

---

## 📝 Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` | No |
| `DATABASE_NAME` | Database name | `holomed` | No |
| `SECRET_KEY` | JWT secret key | `your-secret-key-change-in-production` | **Yes (for production)** |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost:3000,http://localhost:8081` | No |
| `ENVIRONMENT` | Environment mode | `development` | No |

### Generating a Secure SECRET_KEY

**Python:**
```python
import secrets
print(secrets.token_urlsafe(32))
```

**OpenSSL:**
```bash
openssl rand -hex 32
```

**Online:** Use a password generator to create a 32+ character random string

---

## 🧪 Testing the Setup

### 1. Test Health Endpoint

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"healthy","service":"HoloMed API"}
```

### 2. Test User Registration

```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### 3. Test User Login

```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

You should receive a JWT token in the response.

### 4. Test with Swagger UI

1. Open `http://localhost:8000/docs`
2. Try the `/api/auth/register` endpoint
3. Use "Try it out" button
4. Fill in the form and execute

---

## 🐛 Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'beanie'"

**Solution:**
```bash
# Make sure virtual environment is activated
# Then reinstall dependencies
pip install -r requirements.txt
```

### Issue: "Failed to connect to MongoDB"

**Solutions:**
1. **Check if MongoDB is running:**
   ```bash
   mongosh  # Should connect
   ```

2. **Check connection string:**
   - Local: `mongodb://localhost:27017`
   - Docker: `mongodb://host.docker.internal:27017`
   - Atlas: `mongodb+srv://username:password@cluster.mongodb.net/`

3. **Check firewall/network settings**

4. **Verify MongoDB port (default: 27017):**
   ```bash
   # Windows
   netstat -an | findstr 27017
   
   # macOS/Linux
   lsof -i :27017
   ```

### Issue: "Port 8000 already in use"

**Solution:**
```bash
# Use a different port
uvicorn main:app --reload --port 8001

# Or find and kill the process using port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill
```

### Issue: "SECRET_KEY must be set in production"

**Solution:**
Set the `SECRET_KEY` environment variable:
```bash
# Windows
set SECRET_KEY=your-secret-key-here

# macOS/Linux
export SECRET_KEY=your-secret-key-here

# Or in .env file
SECRET_KEY=your-secret-key-here
```

### Issue: CORS errors in frontend

**Solution:**
1. Check `ALLOWED_ORIGINS` in `.env`
2. Make sure frontend URL is included
3. Restart the server after changing `.env`

### Issue: File upload fails

**Solution:**
1. Check if `uploads/` directory exists (created automatically)
2. Check file permissions
3. Verify file size is under 100MB
4. Check file format is supported (.stl, .obj, .ply, .vtk, .gltf, .glb)

---

## 📁 Project Structure

```
backend/
├── __init__.py
├── main.py              # FastAPI application and routes
├── database.py          # MongoDB connection setup
├── models.py            # Beanie document models
├── schemas.py           # Pydantic schemas
├── auth.py              # Authentication utilities
├── requirements.txt     # Python dependencies
├── Dockerfile           # Docker configuration
├── .env                 # Environment variables (create this)
└── uploads/            # Uploaded files directory (auto-created)
```

---

## 🚀 Production Deployment

### 1. Set Environment Variables

```bash
export SECRET_KEY="<strong-random-key>"
export MONGODB_URL="mongodb+srv://..."
export DATABASE_NAME="holomed"
export ALLOWED_ORIGINS="https://yourdomain.com"
export ENVIRONMENT="production"
```

### 2. Use Production Server

```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 3. Set Up File Storage

For production, consider using:
- AWS S3
- Google Cloud Storage
- Azure Blob Storage

Update the upload endpoint to use cloud storage instead of local filesystem.

### 4. Enable HTTPS

Use a reverse proxy like Nginx with SSL certificates.

---

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MongoDB Documentation](https://www.mongodb.com/docs/)
- [Beanie ODM Documentation](https://beanie-odm.dev/)
- [Uvicorn Documentation](https://www.uvicorn.org/)

---

## ✅ Setup Checklist

- [ ] Python 3.10+ installed
- [ ] Virtual environment created and activated
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] MongoDB installed and running
- [ ] `.env` file created with all variables
- [ ] Server starts without errors
- [ ] Health endpoint returns success
- [ ] Can access Swagger UI at `/docs`
- [ ] Can register a new user
- [ ] Can login and get JWT token

---

## 🆘 Need Help?

If you encounter issues:

1. Check the error message carefully
2. Review the Troubleshooting section above
3. Check MongoDB connection
4. Verify all environment variables are set
5. Check server logs for detailed error messages
6. Ensure all dependencies are installed correctly

---

**Happy Coding! 🎉**
