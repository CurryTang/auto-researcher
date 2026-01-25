# MongoDB Server Setup Guide

This guide walks you through setting up MongoDB on your Digital Ocean droplet (or any Ubuntu server).

---

## Option A: Install MongoDB on Server (Self-Managed)

### Step 1: SSH into Your Server

```bash
ssh root@your-server-ip
```

### Step 2: Import MongoDB GPG Key

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
```

### Step 3: Add MongoDB Repository

For Ubuntu 22.04:
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```

For Ubuntu 20.04:
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```

### Step 4: Install MongoDB

```bash
sudo apt update
sudo apt install -y mongodb-org
```

### Step 5: Start MongoDB Service

```bash
sudo systemctl start mongod
sudo systemctl enable mongod  # Auto-start on boot
sudo systemctl status mongod  # Verify it's running
```

### Step 6: Verify Installation

```bash
mongosh
```

You should see the MongoDB shell. Type `exit` to quit.

---

## Step 7: Secure MongoDB (Important!)

### 7.1 Create Admin User

```bash
mongosh
```

In the MongoDB shell:
```javascript
use admin

db.createUser({
  user: "admin",
  pwd: "YOUR_SECURE_ADMIN_PASSWORD",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})
```

### 7.2 Create Application User

```javascript
use auto_researcher

db.createUser({
  user: "autoreader",
  pwd: "YOUR_SECURE_APP_PASSWORD",
  roles: [
    { role: "readWrite", db: "auto_researcher" }
  ]
})

exit
```

### 7.3 Enable Authentication

Edit MongoDB config:
```bash
sudo nano /etc/mongod.conf
```

Find and modify the `security` section:
```yaml
security:
  authorization: enabled
```

Also update the `net` section to bind to localhost only (more secure):
```yaml
net:
  port: 27017
  bindIp: 127.0.0.1
```

### 7.4 Restart MongoDB

```bash
sudo systemctl restart mongod
```

### 7.5 Test Authentication

```bash
mongosh -u autoreader -p YOUR_SECURE_APP_PASSWORD --authenticationDatabase auto_researcher
```

---

## Step 8: Update Backend .env

Update your backend `.env` file with the authenticated connection string:

```bash
# If backend runs on SAME server as MongoDB
MONGODB_URI=mongodb://autoreader:YOUR_SECURE_APP_PASSWORD@localhost:27017/auto_researcher

# If backend runs on DIFFERENT server (requires additional network config)
MONGODB_URI=mongodb://autoreader:YOUR_SECURE_APP_PASSWORD@your-server-ip:27017/auto_researcher
```

---

## Option B: Use MongoDB Atlas (Cloud-Managed)

MongoDB Atlas is easier to set up and manage. Free tier includes 512MB storage.

### Step 1: Create Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account

### Step 2: Create a Cluster

1. Click **Build a Database**
2. Choose **M0 FREE** tier
3. Select cloud provider (AWS recommended) and region closest to your server
4. Cluster name: `auto-reader-cluster`
5. Click **Create**

### Step 3: Create Database User

1. Go to **Database Access** (left sidebar)
2. Click **Add New Database User**
3. Authentication: Password
4. Username: `autoreader`
5. Password: Generate or create secure password
6. Database User Privileges: **Read and write to any database**
7. Click **Add User**

### Step 4: Configure Network Access

1. Go to **Network Access** (left sidebar)
2. Click **Add IP Address**
3. For development: Click **Allow Access from Anywhere** (0.0.0.0/0)
4. For production: Add your server's specific IP address
5. Click **Confirm**

### Step 5: Get Connection String

1. Go to **Database** (left sidebar)
2. Click **Connect** on your cluster
3. Choose **Drivers**
4. Copy the connection string:

```
mongodb+srv://autoreader:<password>@auto-reader-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

5. Replace `<password>` with your actual password
6. Add database name before the `?`:

```
mongodb+srv://autoreader:YOUR_PASSWORD@auto-reader-cluster.xxxxx.mongodb.net/auto_researcher?retryWrites=true&w=majority
```

### Step 6: Update Backend .env

```bash
MONGODB_URI=mongodb+srv://autoreader:YOUR_PASSWORD@auto-reader-cluster.xxxxx.mongodb.net/auto_researcher?retryWrites=true&w=majority
```

---

## Comparison: Self-Managed vs Atlas

| Feature | Self-Managed (on Droplet) | MongoDB Atlas |
|---------|---------------------------|---------------|
| Cost | Free (uses droplet resources) | Free tier: 512MB |
| Setup | More complex | Easy |
| Maintenance | You manage updates/backups | Managed by MongoDB |
| Performance | Depends on droplet | Optimized |
| Backups | Manual setup needed | Automatic |
| Scaling | Manual | Easy |
| Best for | Full control, cost savings | Ease of use, reliability |

**Recommendation**:
- For learning/development: MongoDB Atlas (easier)
- For production with cost constraints: Self-managed on droplet

---

## Testing the Connection

After configuring, test from your backend:

```bash
cd /Users/czk/auto-researcher/backend
npm run dev
```

You should see:
```
Connected to MongoDB
Server running on port 3000
```

Test with curl:
```bash
# Create a test document
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Document",
    "type": "paper",
    "s3Key": "test/test-doc.pdf"
  }'

# List documents
curl http://localhost:3000/api/documents
```

---

## Troubleshooting

### Error: "Connection refused"
- Check MongoDB is running: `sudo systemctl status mongod`
- Check port is correct (default 27017)
- Verify firewall allows connection

### Error: "Authentication failed"
- Verify username/password are correct
- Check user was created in correct database
- Ensure `authenticationDatabase` is specified

### Error: "Network timeout" (Atlas)
- Check IP whitelist includes your server IP
- Verify connection string is correct
- Check for typos in password (special characters may need URL encoding)

### URL Encode Special Characters

If your password has special characters, URL encode them:

| Character | Encoded |
|-----------|---------|
| @ | %40 |
| : | %3A |
| / | %2F |
| # | %23 |
| ? | %3F |

Example: `p@ssw0rd!` → `p%40ssw0rd!`

---

## Backup Commands (Self-Managed)

### Create Backup
```bash
mongodump --uri="mongodb://autoreader:PASSWORD@localhost:27017/auto_researcher" --out=/backups/$(date +%Y%m%d)
```

### Restore Backup
```bash
mongorestore --uri="mongodb://autoreader:PASSWORD@localhost:27017/auto_researcher" /backups/20240115/auto_researcher
```

### Automated Daily Backup (Cron)
```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * mongodump --uri="mongodb://autoreader:PASSWORD@localhost:27017/auto_researcher" --out=/backups/$(date +\%Y\%m\%d) --gzip
```
