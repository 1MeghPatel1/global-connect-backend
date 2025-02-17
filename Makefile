# Variables
COMPOSE_DEV = docker-compose -f docker-compose.dev.yml
COMPOSE_PROD = docker-compose -f docker-compose.prod.yml

# Build the production image
build:
	docker build -t my-nest-app .

# Run in development mode
dev:
	$(COMPOSE_DEV) up --build

# Run in production mode
prod:
	$(COMPOSE_PROD) up --build -d

# Stop all running containers
stop:
	$(COMPOSE_DEV) down
	$(COMPOSE_PROD) down

# Clean up dangling images
clean:
	docker system prune -f
