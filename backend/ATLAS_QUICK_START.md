# 🚀 MongoDB Atlas Quick Start

Get your MongoDB Atlas connection set up in 5 minutes!

## Step 1: Create Account & Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Try Free"** and sign up
3. Create a cluster:
   - Select **"M0 FREE"** (Free tier)
   - Choose a region close to you
   - Click **"Create Cluster"**
   - Wait 3-5 minutes for creation

## Step 2: Create Database User

1. Go to **"Security" → "Database Access"**
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Enter username (e.g., `holomed_user`)
5. Click **"Autogenerate Secure Password"** (or create your own)
6. **⚠️ SAVE THE PASSWORD!** You'll need it
7. Select **"Read and write to any database"**
8. Click **"Add User"**

## Step 3: Whitelist IP Address

1. Go to **"Security" → "Network Access"**
2. Click **"Add IP Address"**
3. For development: Click **"Allow Access from Anywhere"** (`0.0.0.0/0`)
   - ⚠️ Only for development/testing!
4. Click **"Confirm"**

## Step 4: Get Connection String

1. Go to **"Database"** → Click **"Connect"** on your cluster
2. Select **"Connect your application"**
3. Choose **"Python"** and version **"3.6 or later"**
4. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## Step 5: Update Your .env File

Edit `backend/.env`:

```env
# Replace with your actual connection string
MONGODB_URL=mongodb+srv://holomed_user:YourPasswordHere@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority

DATABASE_NAME=holomed
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
ENVIRONMENT=development
```

**Important:**
- Replace `<username>` with your database username
- Replace `<password>` with your database password
- If password has special characters, URL-encode them:
  - `@` → `%40`
  - `#` → `%23`
  - `$` → `%24`

## Step 6: Test Connection

```bash
cd backend
uvicorn main:app --reload
```

Look for:
```
INFO: Successfully connected to MongoDB database: holomed
```

## ✅ Done!

Your backend is now connected to MongoDB Atlas!

**Next:** Test the API at http://localhost:8000/docs

---

## 🐛 Troubleshooting

**"Authentication failed"**
→ Check username/password and URL encoding

**"IP not whitelisted"**
→ Add your IP in Network Access settings

**For detailed help:** See [MONGODB_ATLAS_SETUP.md](./MONGODB_ATLAS_SETUP.md)
