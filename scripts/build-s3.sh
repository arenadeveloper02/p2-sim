#!/bin/bash

# ========================================
# S3-Compatible Build and Deploy Script
# ========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables from .env file
load_env() {
    if [ -f ".env" ]; then
        print_status "Loading environment variables from .env file..."
        set -a
        source .env
        set +a
        print_success "Environment variables loaded from .env"
    else
        print_warning "No .env file found, using system environment variables"
    fi
}

# Check if required environment variables are set
check_env_vars() {
    print_status "Checking environment variables..."
    
    required_vars=(
        "S3_BUCKET_NAME"
        "AWS_REGION"
        "AWS_ACCESS_KEY_ID"
        "AWS_SECRET_ACCESS_KEY"
        "NEXT_PUBLIC_APP_URL"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Please set these variables in your environment or .env file"
        echo "You can use env.s3.example as a template"
        exit 1
    fi
    
    print_success "All required environment variables are set"
}

# Build Docker image
build_image() {
    print_status "Building S3-compatible Docker image..."
    
    docker build \
        -f docker/app.s3.Dockerfile \
        -t simstudio-s3:latest \
        --build-arg S3_BUCKET_NAME="$S3_BUCKET_NAME" \
        --build-arg AWS_REGION="$AWS_REGION" \
        --build-arg AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
        --build-arg AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
        --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
        .
    
    print_success "Docker image built successfully"
}

# Deploy with docker-compose
deploy_compose() {
    print_status "Deploying with docker-compose..."
    
    # Check if docker-compose.s3.yml exists
    if [ ! -f "docker-compose.s3.yml" ]; then
        print_error "docker-compose.s3.yml not found"
        exit 1
    fi
    
    # Deploy services
    docker-compose -f docker-compose.s3.yml up -d
    
    print_success "Services deployed successfully"
}

# Upload static assets to S3
upload_assets() {
    print_status "Uploading static assets to S3..."
    
    # Create a temporary container to upload assets
    docker run --rm \
        -e S3_BUCKET_NAME="$S3_BUCKET_NAME" \
        -e AWS_REGION="$AWS_REGION" \
        -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
        -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
        simstudio-s3:latest \
        ./upload-to-s3.sh
    
    print_success "Static assets uploaded to S3"
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    # Wait for services to be ready
    sleep 10
    
    # Check if the main service is responding
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        print_success "Application is healthy and responding"
    else
        print_warning "Application may not be ready yet. Check logs with: docker-compose -f docker-compose.s3.yml logs"
    fi
}

# Show logs
show_logs() {
    print_status "Showing application logs..."
    docker-compose -f docker-compose.s3.yml logs -f simstudio
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    docker-compose -f docker-compose.s3.yml down
    print_success "Cleanup completed"
}

# Main function
main() {
    case "${1:-build}" in
        "build")
            load_env
            check_env_vars
            build_image
            ;;
        "deploy")
            load_env
            check_env_vars
            build_image
            deploy_compose
            upload_assets
            health_check
            ;;
        "up")
            load_env
            check_env_vars
            deploy_compose
            upload_assets
            health_check
            ;;
        "down")
            cleanup
            ;;
        "logs")
            show_logs
            ;;
        "upload")
            load_env
            check_env_vars
            upload_assets
            ;;
        "health")
            health_check
            ;;
        *)
            echo "Usage: $0 {build|deploy|up|down|logs|upload|health}"
            echo ""
            echo "Commands:"
            echo "  build   - Build the S3-compatible Docker image"
            echo "  deploy  - Build, deploy, and upload assets to S3"
            echo "  up      - Deploy services and upload assets"
            echo "  down    - Stop and remove all services"
            echo "  logs    - Show application logs"
            echo "  upload  - Upload static assets to S3"
            echo "  health  - Check application health"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
