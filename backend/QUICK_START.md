# 🚀 Quick Start Guide - HoloMed Backend

Get the backend running in 5 minutes!

## Prerequisites Check

```bash
python --version  # Should be 3.10 or higher
mongosh --version  # MongoDB should be installed
```

## Step-by-Step Setup

### 1️⃣ Navigate to Backend Directory

```bash
cd backend
```

### 2️⃣ Create and Activate Virtual Environment

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

### 3️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

### 4️⃣ Set Up MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB (if not running as service)
# Windows: Usually runs automatically
# macOS: brew services start mongodb-community
# Linux: sudo systemctl start mongod

# Verify it's running
mongosh
```

**Option B: Docker**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**Option C: MongoDB Atlas (Cloud)**
📖 **See [MONGODB_ATLAS_SETUP.md](./MONGODB_ATLAS_SETUP.md) for detailed setup**
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a free cluster (M0 FREE tier)
- Create database user and whitelist IP
- Get your connection string: `mongodb+srv://username:password@cluster.xxxxx.mongodb.net/`

### 5️⃣ Configure Environment

Copy the example file and edit it:

```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

Edit `.env` and set:
- `MONGODB_URL` - Your MongoDB connection string
- `SECRET_KEY` - Generate a random key (see below)

**Generate SECRET_KEY:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 6️⃣ Run the Server

```bash
uvicorn main:app --reload
```

### 7️⃣ Verify It Works

1. Open: http://localhost:8000/health
   - Should show: `{"status":"healthy","service":"HoloMed API"}`

2. Open: http://localhost:8000/docs
   - Should show Swagger API documentation

## ✅ Success!

Your backend is now running! 

**Next Steps:**
- Test the API using Swagger UI at `/docs`
- Register a test user
- Try uploading a 3D model

## 🐛 Common Issues

**"Module not found"**
→ Activate virtual environment and run `pip install -r requirements.txt`

**"MongoDB connection failed"**
→ Check if MongoDB is running: `mongosh`

**"Port 8000 in use"**
→ Use different port: `uvicorn main:app --reload --port 8001`

For detailed troubleshooting, see `SETUP.md`
