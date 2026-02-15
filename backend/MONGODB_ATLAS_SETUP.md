# MongoDB Atlas Setup Guide for HoloMed Backend

Complete guide to set up and connect MongoDB Atlas (cloud database) to your HoloMed backend.

## 📋 Prerequisites

- MongoDB Atlas account (free tier available)
- Internet connection
- Backend code set up

---

## 🚀 Step-by-Step Setup

### Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Try Free"** or **"Sign Up"**
3. Fill in your details and create an account
4. Verify your email address

### Step 2: Create a New Cluster

1. **Select Deployment Type:**
   - Choose **"M0 FREE"** (Free tier - perfect for development)
   - Click **"Create"**

2. **Select Cloud Provider & Region:**
   - Choose a provider (AWS, Google Cloud, or Azure)
   - Select a region closest to you
   - Click **"Create Cluster"**

3. **Wait for Cluster Creation:**
   - This takes 3-5 minutes
   - You'll see "Your cluster is being created"

### Step 3: Create Database User

1. In the **"Security"** section, click **"Database Access"**
2. Click **"Add New Database User"**
3. **Authentication Method:** Password
4. **Username:** Create a username (e.g., `holomed_user`)
5. **Password:** 
   - Click **"Autogenerate Secure Password"** (recommended)
   - **OR** create your own strong password
   - **⚠️ IMPORTANT:** Save this password! You'll need it for the connection string
6. **Database User Privileges:** Select **"Read and write to any database"**
7. Click **"Add User"**

### Step 4: Configure Network Access

1. In the **"Security"** section, click **"Network Access"**
2. Click **"Add IP Address"**
3. **For Development:**
   - Click **"Add Current IP Address"** (adds your current IP)
   - **OR** Click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
     - ⚠️ Only use this for development/testing
4. Click **"Confirm"**

### Step 5: Get Your Connection String

1. Go to **"Database"** section
2. Click **"Connect"** on your cluster
3. Select **"Connect your application"**
4. **Driver:** Python
5. **Version:** 3.6 or later
6. **Copy the connection string:**
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 6: Update Your Connection String

Replace the placeholders in the connection string:

1. Replace `<username>` with your database username
2. Replace `<password>` with your database password
3. **Example:**
   ```
   mongodb+srv://holomed_user:MySecurePassword123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 7: Configure Backend Environment

1. **Create or edit `.env` file** in the `backend` directory:

```env
# MongoDB Atlas Connection
MONGODB_URL=mongodb+srv://holomed_user:MySecurePassword123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority

# Database name (will be created automatically)
DATABASE_NAME=holomed

# JWT Secret Key (generate a strong random key)
SECRET_KEY=your-super-secret-key-change-this-in-production

# CORS Allowed Origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081

# Environment
ENVIRONMENT=development
```

2. **Important Notes:**
   - Replace the `MONGODB_URL` with your actual connection string
   - Make sure to URL-encode special characters in password (e.g., `@` becomes `%40`)
   - The database name `holomed` will be created automatically on first use

### Step 8: Install MongoDB Driver (if needed)

The required packages are already in `requirements.txt`, but verify:

```bash
pip install pymongo motor beanie
```

### Step 9: Test the Connection

1. **Start your backend server:**
   ```bash
   uvicorn main:app --reload
   ```

2. **Check the logs:**
   You should see:
   ```
   INFO: Successfully connected to MongoDB database: holomed
   ```

3. **Test the health endpoint:**
   ```bash
   curl http://localhost:8000/health
   ```

4. **Test user registration:**
   - Go to `http://localhost:8000/docs`
   - Try the `/api/auth/register` endpoint
   - If it works, your Atlas connection is successful!

---

## 🔧 Connection String Format

### Standard Format:
```
mongodb+srv://<username>:<password>@<cluster-url>/<database>?<options>
```

### With Options:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/holomed?retryWrites=true&w=majority
```

### Common Options:
- `retryWrites=true` - Enables retryable writes
- `w=majority` - Write concern
- `ssl=true` - SSL connection (default for Atlas)
- `authSource=admin` - Authentication database (usually not needed)

---

## 🐛 Troubleshooting

### Issue: "Authentication failed"

**Solutions:**
1. **Check username and password:**
   - Make sure they match exactly (case-sensitive)
   - URL-encode special characters in password
   - Example: `@` → `%40`, `#` → `%23`, `$` → `%24`

2. **Verify database user exists:**
   - Go to Atlas → Security → Database Access
   - Check if user is listed and active

3. **Check password encoding:**
   ```python
   from urllib.parse import quote_plus
   password = "My@Password#123"
   encoded = quote_plus(password)
   print(encoded)  # My%40Password%23123
   ```

### Issue: "IP not whitelisted"

**Solutions:**
1. Go to Atlas → Security → Network Access
2. Add your current IP address
3. **OR** for development: Add `0.0.0.0/0` (allows all IPs)
   - ⚠️ Only use this for development!

### Issue: "Connection timeout"

**Solutions:**
1. Check your internet connection
2. Verify firewall isn't blocking MongoDB ports
3. Try using the connection string with IP address instead of SRV:
   ```
   mongodb://username:password@cluster0-shard-00-00.xxxxx.mongodb.net:27017,...
   ```

### Issue: "DNS resolution failed"

**Solutions:**
1. Make sure you're using the correct cluster URL
2. Check if the cluster is running (go to Atlas dashboard)
3. Try using the standard connection string format

### Issue: "Database name not found"

**Solution:**
- This is normal! The database is created automatically when you first insert data
- Just make sure `DATABASE_NAME=holomed` is set in your `.env`

---

## 🔒 Security Best Practices

### For Development:
- ✅ Use M0 Free tier
- ✅ Allow access from anywhere (`0.0.0.0/0`) for testing
- ✅ Use autogenerated passwords
- ✅ Store credentials in `.env` file (not in code)

### For Production:
- ❌ **NEVER** use `0.0.0.0/0` - whitelist specific IPs only
- ✅ Use strong, unique passwords
- ✅ Enable MongoDB Atlas encryption at rest
- ✅ Use VPC peering or private endpoints
- ✅ Enable audit logging
- ✅ Set up database backups
- ✅ Use environment variables (never hardcode credentials)
- ✅ Rotate passwords regularly
- ✅ Use M10+ cluster for production workloads

---

## 📊 Monitoring Your Database

### View Collections:
1. Go to Atlas → Database → Browse Collections
2. You'll see collections created automatically:
   - `users` - User accounts
   - `models` - 3D model metadata
   - `sessions` - Visualization sessions

### Monitor Usage:
1. Go to Atlas → Metrics
2. View:
   - Database size
   - Number of documents
   - Read/write operations
   - Connection count

### Free Tier Limits:
- **Storage:** 512 MB
- **RAM:** Shared
- **Backups:** Not included (upgrade for backups)

---

## 🔄 Switching from Local MongoDB to Atlas

If you were using local MongoDB and want to switch:

1. **Backup your local data** (optional):
   ```bash
   mongodump --uri="mongodb://localhost:27017/holomed" --out=./backup
   ```

2. **Update `.env` file:**
   ```env
   MONGODB_URL=mongodb+srv://username:password@cluster.xxxxx.mongodb.net/
   ```

3. **Restart your backend:**
   ```bash
   uvicorn main:app --reload
   ```

4. **Verify connection:**
   - Check logs for successful connection
   - Test API endpoints

---

## 📝 Example .env File for Atlas

```env
# MongoDB Atlas Connection String
# Format: mongodb+srv://username:password@cluster.xxxxx.mongodb.net/
MONGODB_URL=mongodb+srv://holomed_user:MySecurePass%40123@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority

# Database name (created automatically)
DATABASE_NAME=holomed

# JWT Secret Key - Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=your-generated-secret-key-here

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081

# Environment
ENVIRONMENT=development
```

---

## ✅ Verification Checklist

- [ ] MongoDB Atlas account created
- [ ] Cluster created and running
- [ ] Database user created with read/write permissions
- [ ] IP address whitelisted in Network Access
- [ ] Connection string copied and updated with credentials
- [ ] `.env` file configured with `MONGODB_URL`
- [ ] Backend server starts without connection errors
- [ ] Can register a user via API
- [ ] Collections appear in Atlas dashboard

---

## 🆘 Need Help?

**Common Issues:**
1. **Can't connect:** Check Network Access IP whitelist
2. **Authentication failed:** Verify username/password and URL encoding
3. **Connection timeout:** Check internet and firewall settings

**MongoDB Atlas Resources:**
- [Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Connection String Guide](https://docs.atlas.mongodb.com/connect-to-cluster/)
- [Atlas Support](https://www.mongodb.com/support)

---

**Your backend is now connected to MongoDB Atlas! 🎉**
