#!/bin/bash

# ========================================
# S3 Production Deployment Script
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

# Configuration
ENV_FILE=".env"
COMPOSE_FILE="docker-compose.s3.yml"
IMAGE_TAG="simstudio-s3:latest"

# Check if environment file exists
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file $ENV_FILE not found"
        print_status "Please create $ENV_FILE using env.s3.example as a template"
        exit 1
    fi
    print_success "Environment file found"
}

# Load environment variables
load_env() {
    print_status "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
    print_success "Environment variables loaded"
}

# Validate AWS credentials
validate_aws_credentials() {
    print_status "Validating AWS credentials..."
    
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        print_error "AWS credentials are invalid or not configured"
        print_status "Please configure AWS credentials using:"
        echo "  aws configure"
        echo "  or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables"
        exit 1
    fi
    
    print_success "AWS credentials validated"
}

# Check S3 bucket access
check_s3_bucket() {
    print_status "Checking S3 bucket access..."
    
    if ! aws s3 ls "s3://$S3_BUCKET_NAME" > /dev/null 2>&1; then
        print_error "Cannot access S3 bucket: $S3_BUCKET_NAME"
        print_status "Please ensure:"
        echo "  1. The bucket exists"
        echo "  2. You have read/write permissions"
        echo "  3. The bucket name is correct"
        exit 1
    fi
    
    print_success "S3 bucket access confirmed"
}

# Build and push Docker image
build_and_push() {
    print_status "Building Docker image..."
    
    docker build \
        -f docker/app.s3.Dockerfile \
        -t "$IMAGE_TAG" \
        --build-arg S3_BUCKET_NAME="$S3_BUCKET_NAME" \
        --build-arg AWS_REGION="$AWS_REGION" \
        --build-arg AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
        --build-arg AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
        --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
        .
    
    print_success "Docker image built successfully"
}

# Deploy services
deploy_services() {
    print_status "Deploying services..."
    
    # Stop existing services
    docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    print_success "Services deployed"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000 > /dev/null 2>&1; then
            print_success "Application is ready"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - waiting for application..."
        sleep 10
        ((attempt++))
    done
    
    print_warning "Application may not be ready yet"
    return 1
}

# Upload static assets to S3
upload_assets() {
    print_status "Uploading static assets to S3..."
    
    # Run the S3 uploader service
    docker-compose -f "$COMPOSE_FILE" run --rm s3-uploader
    
    print_success "Static assets uploaded to S3"
}

# Show deployment status
show_status() {
    print_status "Deployment Status:"
    echo ""
    
    # Show running containers
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    print_status "Application URL: $NEXT_PUBLIC_APP_URL"
    print_status "S3 Bucket: $S3_BUCKET_NAME"
    print_status "S3 Region: $AWS_REGION"
}

# Show logs
show_logs() {
    print_status "Showing application logs..."
    docker-compose -f "$COMPOSE_FILE" logs -f simstudio
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    docker-compose -f "$COMPOSE_FILE" down
    print_success "Cleanup completed"
}

# Main deployment function
deploy() {
    print_status "Starting S3-compatible deployment..."
    
    check_env_file
    load_env
    validate_aws_credentials
    check_s3_bucket
    build_and_push
    deploy_services
    
    if wait_for_services; then
        upload_assets
        show_status
        print_success "Deployment completed successfully!"
    else
        print_warning "Deployment completed but application may not be ready"
        print_status "Check logs with: $0 logs"
    fi
}

# Main function
main() {
    case "${1:-deploy}" in
        "deploy")
            deploy
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs
            ;;
        "cleanup")
            cleanup
            ;;
        "upload")
            check_env_file
            load_env
            validate_aws_credentials
            check_s3_bucket
            upload_assets
            ;;
        *)
            echo "Usage: $0 {deploy|status|logs|cleanup|upload}"
            echo ""
            echo "Commands:"
            echo "  deploy   - Full deployment process"
            echo "  status   - Show deployment status"
            echo "  logs     - Show application logs"
            echo "  cleanup  - Stop and remove all services"
            echo "  upload   - Upload static assets to S3"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
