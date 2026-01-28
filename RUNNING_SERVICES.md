# Running Services - Ready to Test!

## 🟢 All Services Running

### Backend (Desktop)
```
✓ FRP Client       - Connected to DO server
✓ Processing Server - Port 3001, ready for requests
```

### Frontend (Local)
```
✓ Vite Dev Server  - Port 5173
```

### DO Server (138.68.5.132)
```
✓ FRP Server       - Port 7000, accepting connections
✓ Backend API      - Port 3000, proxying to desktop
✓ Database & S3    - Ready
```

## 🌐 Access URLs

### Frontend
**Local Dev Server:**
- http://localhost:5173/auto-researcher/

### Backend APIs
**Via DO Server (Public):**
- http://138.68.5.132:3000/api

**Processing Server (Local):**
- http://localhost:3001/health

**Via FRP Tunnel (from DO):**
- http://127.0.0.1:7001/health

### Monitoring
**FRP Dashboard:**
- http://138.68.5.132:7500
- Username: `admin`
- Password: `frp_dashboard_2024`

## 📊 Service Flow

```
Browser (localhost:5173)
    ↓ HTTP Request
DO Server (138.68.5.132:3000)
    ↓ Check Desktop Available
FRP Tunnel (7001 → 3001)
    ↓ Forward Request
Desktop Processing Server (localhost:3001)
    ↓ Process with Gemini CLI / LLM APIs
    ↓ Save to S3
    ↓ Update Database
    ← Return Result
DO Server
    ← Return to Frontend
Browser (displays result)
```

## 🧪 Test the Setup

### 1. Test Frontend Loading
Open in browser: http://localhost:5173/auto-researcher/

Expected: See document list

### 2. Test Document Upload
1. Use Chrome extension to save a paper
2. Check if it appears in the list
3. Request processing

### 3. Verify Desktop Processing
Watch the logs:
```bash
# In backend directory
tail -f processing-server.log
```

When you trigger processing, you should see:
```
[Processing] Document request: <paper title>
```

### 4. Check FRP Connection
```bash
curl http://localhost:3001/health
curl -s http://138.68.5.132:3000/api/health
```

Both should return success responses.

## 📝 Logs to Monitor

```bash
# Desktop
cd ~/auto-researcher/backend

# FRP Client
tail -f frpc.log

# Processing Server
tail -f processing-server.log

# Frontend
cd ~/auto-researcher/frontend
tail -f frontend.log
```

## 🛑 Stop All Services

```bash
# Stop backend services
cd ~/auto-researcher/backend
pkill -f frpc
pkill -f processing-server

# Stop frontend
pkill -f vite
```

## 🔄 Restart All Services

```bash
# Backend
cd ~/auto-researcher/backend
./start-local.sh

# Frontend
cd ~/auto-researcher/frontend
npm run dev
```

## ⚙️ Configuration

### Frontend
- **API URL**: http://138.68.5.132:3000/api
- **Config**: `frontend/.env.local`

### Desktop Backend
- **Port**: 3001
- **Config**: `backend/.env`
- **Node.js**: v20+ required (for Gemini CLI compatibility)
- **Gemini CLI**: Available ✅
- **Processing**: ENABLED (handles all LLM tasks)

### DO Server
- **Port**: 3000 (API)
- **Port**: 7000 (FRP control)
- **Port**: 7001 (FRP data)
- **Config**: `/var/www/auto-researcher/backend/.env`
- **Processing**: DISABLED (forwards to desktop via FRP)

## ✅ What to Test

1. **Browse Documents**
   - Open frontend
   - See list of papers
   - Click "View Notes" on any processed paper

2. **Upload New Paper**
   - Use Chrome extension
   - Save paper to Auto Reader
   - Wait for it to appear in list

3. **Trigger Processing**
   - Click on unprocessed paper
   - Request processing
   - Watch `processing-server.log` for activity

4. **Code Analysis** (if paper has GitHub repo)
   - Login (click 🔒)
   - Enter admin token from `.env`
   - Trigger code analysis
   - Watch processing

5. **Check Performance**
   - Monitor FRP dashboard
   - Check desktop resource usage
   - Verify DO server stays lightweight

## 📈 Success Indicators

✅ Frontend loads without errors
✅ Documents list displays
✅ FRP connection shows "login to server success"
✅ Processing requests appear in desktop logs
✅ Notes are generated and saved to S3
✅ Results display in frontend

## 🐛 Troubleshooting

**Frontend can't connect to API:**
- Check `.env.local` has correct API URL
- Verify DO server backend is running: `ssh root@138.68.5.132 "pm2 status"`

**Desktop not receiving requests:**
- Check FRP connection: `tail -f frpc.log`
- Test tunnel: `ssh root@138.68.5.132 "curl http://127.0.0.1:7001/health"`

**Processing fails:**
- Check `processing-server.log` for errors
- Verify Gemini CLI: `bash -c "source ~/.nvm/nvm.sh && gemini --version"`
- Check API keys in `.env`
- Verify Node.js version: `bash -c "source ~/.nvm/nvm.sh && node --version"` (must be 20+)

**Documents stuck in processing:**
- Verify DO server has `PROCESSING_ENABLED=false`: `ssh root@138.68.5.132 "grep PROCESSING_ENABLED /var/www/auto-researcher/backend/.env"`
- Check desktop processing server is running: `ps aux | grep processing-server`
- Test FRP tunnel: `ssh root@138.68.5.132 "curl http://127.0.0.1:7001/health"`

---

## 🔧 Recent Fixes

### Fixed: Documents Stuck in Processing (2026-01-27)
**Problem**: Papers uploaded but never finished processing

**Root Causes**:
1. DO server had `PROCESSING_ENABLED=true` → tried to process locally
2. Gemini CLI failed on Node.js v18 → requires v20+ for regex flag support

**Solutions**:
1. Set `PROCESSING_ENABLED=false` on DO server
2. Upgraded desktop Node.js from v18.19.1 to v20.20.0
3. Restarted processing server with new Node.js version

**Verification**:
- ✅ DO server logs show "Document reader is disabled"
- ✅ Desktop processing server shows "Gemini CLI available: true"
- ✅ FRP tunnel tested: DO server → Desktop via port 7001

---

**All systems operational!** 🚀
**Ready for testing.**
