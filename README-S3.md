# S3-Compatible Deployment Guide

This guide explains how to build and deploy the SimStudio application with S3 compatibility for static asset hosting.

## 🏗️ Architecture Overview

The S3-compatible setup includes:
- **Multi-stage Docker build** with S3 asset upload capabilities
- **Docker Compose configuration** for S3 deployment
- **Automated scripts** for build and deployment
- **Static asset management** with S3 hosting

## 📁 New Files Created

### Docker Files
- `docker/app.s3.Dockerfile` - S3-compatible multi-stage Dockerfile
- `docker/s3-config.json` - S3 configuration template

### Docker Compose
- `docker-compose.s3.yml` - S3 deployment configuration

### Scripts
- `scripts/build-s3.sh` - Build and local deployment script
- `scripts/deploy-s3.sh` - Production deployment script

### Configuration
- `env.s3.example` - Environment variables template

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Copy the environment template
cp env.s3.example .env.s3

# Edit the environment file with your S3 credentials
nano .env.s3
```

### 2. Configure S3 Bucket

Required environment variables:
```bash
AWS_S3_BUCKET=your-s3-bucket-name
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 3. Build and Deploy

```bash
# Build the Docker image
./scripts/build-s3.sh build

# Deploy with S3 upload
./scripts/build-s3.sh deploy

# Or use the production deployment script
./scripts/deploy-s3.sh deploy
```

## 🔧 Available Commands

### Build Script (`scripts/build-s3.sh`)

```bash
./scripts/build-s3.sh build    # Build Docker image
./scripts/build-s3.sh deploy   # Build, deploy, and upload assets
./scripts/build-s3.sh up       # Deploy services and upload assets
./scripts/build-s3.sh down     # Stop and remove services
./scripts/build-s3.sh logs     # Show application logs
./scripts/build-s3.sh upload   # Upload static assets to S3
./scripts/build-s3.sh health   # Check application health
```

### Deploy Script (`scripts/deploy-s3.sh`)

```bash
./scripts/deploy-s3.sh deploy   # Full deployment process
./scripts/deploy-s3.sh status   # Show deployment status
./scripts/deploy-s3.sh logs     # Show application logs
./scripts/deploy-s3.sh cleanup  # Stop and remove services
./scripts/deploy-s3.sh upload   # Upload static assets to S3
```

## 🏗️ Docker Architecture

### Multi-Stage Build Process

1. **Base Stage**: Alpine Linux with Bun runtime
2. **Dependencies Stage**: Install production dependencies
3. **Builder Stage**: Build the Next.js application
4. **S3 Uploader Stage**: Prepare assets for S3 upload
5. **Runner Stage**: Production runtime with S3 integration

### Key Features

- **S3 Asset Upload**: Automatic upload of static assets to S3
- **Health Checks**: Built-in health monitoring
- **Environment Variables**: S3 configuration through environment
- **Asset Optimization**: Proper caching headers for S3 assets

## 📦 S3 Asset Management

### Static Assets
- **Location**: `s3://your-bucket/_next/static/`
- **Cache Control**: `public, max-age=31536000, immutable`
- **Purpose**: Next.js static files (JS, CSS, images)

### Public Assets
- **Location**: `s3://your-bucket/`
- **Cache Control**: `public, max-age=86400`
- **Purpose**: Public files (favicons, images, etc.)

## 🔒 Security Considerations

### AWS Credentials
- Use IAM roles when possible instead of access keys
- Limit S3 permissions to only required bucket
- Rotate credentials regularly

### Environment Variables
- Never commit `.env.s3` to version control
- Use secure secret management in production
- Validate all environment variables before deployment

## 🐛 Troubleshooting

### Common Issues

1. **AWS Credentials Invalid**
   ```bash
   aws configure
   # or
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   ```

2. **S3 Bucket Access Denied**
   - Check bucket permissions
   - Verify IAM policy
   - Ensure bucket exists

3. **Build Failures**
   - Check environment variables
   - Verify Docker is running
   - Check disk space

4. **Application Not Starting**
   ```bash
   # Check logs
   ./scripts/build-s3.sh logs
   
   # Check health
   ./scripts/build-s3.sh health
   ```

### Debug Commands

```bash
# Check Docker images
docker images | grep simstudio

# Check running containers
docker-compose -f docker-compose.s3.yml ps

# Check S3 bucket contents
aws s3 ls s3://your-bucket-name/

# Test S3 upload manually
docker run --rm -e AWS_S3_BUCKET=your-bucket simstudio-s3:latest ./upload-to-s3.sh
```

## 📊 Monitoring

### Health Checks
- Application health: `http://localhost:3000`
- S3 connectivity: Check upload logs
- Database connectivity: Check migration logs

### Logs
```bash
# Application logs
docker-compose -f docker-compose.s3.yml logs simstudio

# All services logs
docker-compose -f docker-compose.s3.yml logs

# Follow logs in real-time
docker-compose -f docker-compose.s3.yml logs -f
```

## 🔄 Updates and Maintenance

### Updating the Application
```bash
# Pull latest changes
git pull

# Rebuild and redeploy
./scripts/deploy-s3.sh deploy
```

### Updating S3 Assets
```bash
# Upload new assets only
./scripts/deploy-s3.sh upload
```

### Cleanup
```bash
# Stop all services
./scripts/deploy-s3.sh cleanup

# Remove unused Docker images
docker image prune -f
```

## 📚 Additional Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Next.js Standalone Output](https://nextjs.org/docs/advanced-features/output-file-tracing)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)

## 🤝 Support

For issues related to S3 deployment:
1. Check the troubleshooting section above
2. Review application logs
3. Verify AWS credentials and permissions
4. Check Docker and system resources
