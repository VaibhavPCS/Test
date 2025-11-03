# Apache Deployment Guide - Fix for 404 Errors on Reload

## Problem Fixed
Removed hash-based routing (`/sign-in#/sign-in`) and implemented proper BrowserRouter with Apache `.htaccess` configuration.

## Changes Made

### 1. Frontend Code Changes
- **`frontend/app/root.tsx`**: Removed hash-based routing logic
- **`frontend/app/routes/root/redirect.tsx`**: Simplified to use React Router's `<Navigate>` component
- **Build completed**: Fresh build in `frontend/build/client/` directory

### 2. `.htaccess` Configuration
File location: `frontend/build/client/.htaccess` (automatically copied from `frontend/public/.htaccess`)

## Deployment Steps

### Step 1: Verify Apache Configuration

Your Apache server **must** have these settings enabled:

```apache
# In your Apache config or VirtualHost file:

<Directory /path/to/your/website>
    # CRITICAL: Allow .htaccess to override settings
    AllowOverride All

    # Allow access
    Require all granted
</Directory>

# Ensure mod_rewrite is enabled
LoadModule rewrite_module modules/mod_rewrite.so

# Ensure mod_headers is enabled (optional but recommended)
LoadModule headers_module modules/mod_headers.so
```

**To check if mod_rewrite is enabled:**
```bash
apache2ctl -M | grep rewrite
# Should output: rewrite_module (shared)
```

**To enable mod_rewrite (if not enabled):**
```bash
sudo a2enmod rewrite
sudo systemctl restart apache2
```

### Step 2: Deploy the Build

1. Upload the entire contents of `frontend/build/client/` to your web server root
2. Ensure `.htaccess` file is uploaded (check that hidden files are visible)
3. Verify file permissions:
   ```bash
   chmod 644 .htaccess
   chmod 644 index.html
   chmod -R 755 assets/
   ```

### Step 3: Verify Deployment

After deployment, your directory structure should look like:

```
/var/www/html/  (or your document root)
├── .htaccess           ← MUST be present
├── index.html
├── assets/
│   ├── *.js
│   ├── *.css
│   └── ...
├── pcs_logo.jpg
└── .vite/
    └── manifest.json
```

### Step 4: Test the Fix

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. Visit: `https://pms.upda.co.in/sign-in`
   - Should show sign-in page
   - URL should be exactly `/sign-in` (NO hash fragment)
3. **Reload the page** (F5 or Ctrl+R)
   - Should still show sign-in page (NO 404 error)
4. Navigate to other pages and test reload on each

### Expected URL Format

✅ **CORRECT:**
- `https://pms.upda.co.in/`
- `https://pms.upda.co.in/sign-in`
- `https://pms.upda.co.in/dashboard`
- `https://pms.upda.co.in/workspace`

❌ **WRONG (old behavior):**
- `https://pms.upda.co.in/sign-in#/sign-in` ← This should NOT happen anymore

## Troubleshooting

### Problem: Still getting 404 errors

**Check 1: Is `.htaccess` file present?**
```bash
ls -la /path/to/website/root/
# Should show .htaccess file
```

**Check 2: Is mod_rewrite enabled?**
```bash
apache2ctl -M | grep rewrite
```

**Check 3: Is AllowOverride set correctly?**
Look in your Apache VirtualHost config:
```bash
# Ubuntu/Debian
sudo nano /etc/apache2/sites-available/your-site.conf

# CentOS/RHEL
sudo nano /etc/httpd/conf.d/your-site.conf
```

Ensure you have:
```apache
<Directory /var/www/html>
    AllowOverride All
</Directory>
```

**Check 4: Apache error logs**
```bash
# Ubuntu/Debian
sudo tail -f /var/log/apache2/error.log

# CentOS/RHEL
sudo tail -f /var/log/httpd/error_log
```

### Problem: .htaccess file not being read

If Apache is ignoring `.htaccess`:

1. Verify `AllowOverride All` is set in VirtualHost
2. Restart Apache after config changes:
   ```bash
   sudo systemctl restart apache2
   # or
   sudo systemctl restart httpd
   ```

### Problem: Internal Server Error (500)

This means `.htaccess` has syntax errors:

1. Check Apache error logs for specific error
2. Ensure all required modules are enabled:
   ```bash
   sudo a2enmod rewrite
   sudo a2enmod headers
   sudo systemctl restart apache2
   ```

## VirtualHost Example

Here's a complete example for your site:

```apache
<VirtualHost *:443>
    ServerName pms.upda.co.in
    DocumentRoot /var/www/pms

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    # Allow .htaccess overrides (CRITICAL)
    <Directory /var/www/pms>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Optional: Logging
    ErrorLog ${APACHE_LOG_DIR}/pms-error.log
    CustomLog ${APACHE_LOG_DIR}/pms-access.log combined
</VirtualHost>
```

## Backend API Configuration

Ensure your backend is still accessible at:
- `https://pms.upda.co.in:5000/api-v1/*`

Or if you're using a reverse proxy, ensure API calls work correctly.

## Post-Deployment Checklist

- [ ] `.htaccess` file exists in document root
- [ ] `AllowOverride All` is set in Apache config
- [ ] `mod_rewrite` is enabled
- [ ] Apache has been restarted after config changes
- [ ] Build files uploaded successfully
- [ ] Browser cache cleared
- [ ] All routes tested (sign-in, dashboard, workspace, etc.)
- [ ] Reload tested on each route
- [ ] Direct URL access tested
- [ ] No hash fragments in URLs

## Quick Command Reference

```bash
# Enable required modules
sudo a2enmod rewrite headers
sudo systemctl restart apache2

# Check Apache config syntax
sudo apache2ctl configtest

# View error logs
sudo tail -f /var/log/apache2/error.log

# Restart Apache
sudo systemctl restart apache2
```

## Support

If you still experience issues after following this guide:

1. Check Apache error logs
2. Verify `.htaccess` is being read (add a syntax error to test if you get a 500 error)
3. Ensure you've cleared browser cache completely
4. Test in an incognito/private browsing window
