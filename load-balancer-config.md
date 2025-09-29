# Load Balancer Configuration for Multi-Instance Deployment

## Problem
When deploying Next.js applications across multiple EC2 instances behind a load balancer, static assets (`_next/static/chunks/*.js`) may not be found because each instance has its own build with different chunk hashes.

## Solution

### 1. Nginx Configuration (Recommended)

```nginx
upstream sim_backend {
    server ec2-instance-1:3000;
    server ec2-instance-2:3000;
    # Add more instances as needed
}

server {
    listen 80;
    server_name your-domain.com;

    # Handle static assets with proper caching
    location /_next/static/ {
        proxy_pass http://sim_backend;
        proxy_cache_valid 200 1y;
        proxy_cache_valid 404 1m;
        
        # Set proper headers
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff";
        
        # Handle MIME type issues
        location ~* \.js$ {
            add_header Content-Type "application/javascript; charset=utf-8";
        }
        
        location ~* \.css$ {
            add_header Content-Type "text/css; charset=utf-8";
        }
    }

    # Handle API routes
    location /api/ {
        proxy_pass http://sim_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Handle all other routes (SPA routing)
    location / {
        proxy_pass http://sim_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Don't cache HTML responses
        proxy_no_cache $cookie_nocache $arg_nocache$arg_comment;
        proxy_cache_bypass $cookie_nocache $arg_nocache$arg_comment;
    }
}
```

### 2. AWS Application Load Balancer Configuration

1. **Target Group Health Checks**:
   - Health check path: `/api/health`
   - Health check interval: 30 seconds
   - Healthy threshold: 2
   - Unhealthy threshold: 3

2. **Listener Rules**:
   - Priority 1: `/_next/static/*` → Route to all healthy targets
   - Priority 2: `/api/*` → Route to all healthy targets  
   - Priority 3: `/*` → Route to all healthy targets

3. **Sticky Sessions** (Optional):
   - Enable sticky sessions for better static asset handling
   - Duration: 1 hour

### 3. Alternative: Use CDN (Recommended for Production)

For better performance and reliability, consider using a CDN:

1. **AWS CloudFront**:
   - Origin: Your load balancer
   - Cache static assets (`/_next/static/*`) for 1 year
   - Cache API routes for 0 seconds

2. **Cloudflare**:
   - Cache static assets with long TTL
   - Bypass cache for API routes

### 4. Environment Variables

Ensure all instances have the same environment variables:

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.com
BETTER_AUTH_URL=https://your-domain.com
# ... other variables
```

### 5. Deployment Process

1. Build the application once
2. Deploy the same build to all instances
3. Ensure all instances have identical static assets
4. Configure load balancer as above

## Testing

After deployment, test:

1. Direct access to static assets: `https://your-domain.com/_next/static/chunks/[chunk-id].js`
2. Page loads without console errors
3. All routes work correctly
4. Health checks pass

## Monitoring

Monitor these metrics:
- Static asset 404 errors
- Page load times
- JavaScript execution errors
- Health check success rates
