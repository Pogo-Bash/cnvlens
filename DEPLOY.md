# LungSeq Analyzer - Render Deployment Guide

## Render Configuration

### Service Type
**Web Service** (not Static Site - we need the dev server for CORS headers)

### Repository
Connect your GitHub repository: `Pogo-Bash/lungseq-analyzer`

### Branch
Use your main branch or the feature branch: `claude/implement-cnv-biowasm-011CUJvWxm5uDLgGMnrVtE9C`

### Build & Deploy Settings

| Setting | Value |
|---------|-------|
| **Root Directory** | `.` (leave blank or use dot) |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run preview` |
| **Environment** | Node |

### Environment Variables
Render automatically sets `PORT` - no manual configuration needed!

The app is configured to use `process.env.PORT || 3000`

### Advanced Settings (Important!)

**Instance Type:** Free or Starter (upgrade if you need more resources for large BAM files)

**Health Check Path:** `/` (default is fine)

**Auto-Deploy:** Yes (recommended - deploys on git push)

## Step-by-Step Deployment

### 1. Create New Web Service
- Go to Render Dashboard
- Click "New +" → "Web Service"
- Connect your GitHub account if not already connected

### 2. Select Repository
- Choose `Pogo-Bash/lungseq-analyzer`
- Select branch to deploy

### 3. Configure Service
```
Name: lungseq-analyzer (or your preferred name)
Region: Choose closest to your users
Branch: main (or your feature branch)
Root Directory: (leave blank)
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run preview
```

### 4. Instance Type
- Free tier: Good for testing
- Starter ($7/mo): Better for production with real BAM files

### 5. Advanced Settings
Under "Advanced":
- **Auto-Deploy:** Yes
- **Environment Variables:** None needed (PORT is automatic)

### 6. Create Web Service
Click "Create Web Service" - Render will:
1. Clone your repo
2. Run `npm install && npm run build`
3. Run `npm run preview`
4. Expose on `https://your-app.onrender.com`

## Important Notes

### CORS Headers
The app REQUIRES these headers for WebAssembly/biowasm to work:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These are already configured in `vite.config.js` and will work with `npm run preview`!

### Allowed Hosts
Vite preview server is configured to accept requests from:
- `.onrender.com` domains (Render hosting)
- `localhost` (local development)
- `127.0.0.1` (local development)

This prevents the "Blocked request. This host is not allowed" error on Render!

### Port Binding
✓ Already configured: The app listens on `0.0.0.0` and uses Render's PORT env variable

### Build Time
First build takes ~2-3 minutes:
- npm install: ~30-60s
- vite build: ~30-60s
- Total: ~2-3 minutes

### Static Assets
Built assets go to `dist/` folder (handled automatically by Vite)

## Troubleshooting

### If deploy fails:
1. Check build logs in Render dashboard
2. Ensure Node version is compatible (16+)
3. Verify package.json scripts are correct

### If app doesn't load:
1. Check that start command is `npm run preview` (not `npm start`)
2. Verify logs show "preview server started at http://0.0.0.0:PORT"
3. Ensure CORS headers are working (check browser console)

### If BAM files fail to process:
1. Check browser compatibility warning in app
2. Ensure using Chrome/Firefox/Edge (not Safari)
3. Check browser console for OPFS/IndexedDB errors
4. Try smaller BAM files first

## Production Checklist

- [ ] Repository connected to Render
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm run preview`
- [ ] Root directory: blank or `.`
- [ ] Auto-deploy enabled
- [ ] First deployment successful
- [ ] App loads in browser
- [ ] Browser compatibility warning shows correctly
- [ ] OPFS/IndexedDB storage works
- [ ] Can upload small test file

## Custom Domain (Optional)

After deployment, you can add a custom domain:
1. Go to your service settings
2. Click "Custom Domain"
3. Add your domain and configure DNS

## Monitoring

Render provides:
- Real-time logs
- Metrics (CPU, memory, bandwidth)
- Deploy history
- Health checks

Check these if you encounter issues!

## Cost Estimate

**Free Tier:**
- 750 hours/month free compute
- Good for testing and demo
- Spins down after 15 min of inactivity

**Starter ($7/mo):**
- Always on
- Better for production
- No spin-down delay

## Need Help?

- Render Docs: https://render.com/docs
- App logs: Available in Render dashboard
- Browser console: Check for CORS/WASM errors
