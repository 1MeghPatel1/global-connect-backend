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
	docker system prune -f --volumes --all

# Start only Redis service in dev mode
dev-redis:
	$(COMPOSE_DEV) up -d redis

# Start only PostgreSQL service in dev mode
dev-db:
	$(COMPOSE_DEV) up -d postgres

# Start only Redis service in prod mode
prod-redis:
	$(COMPOSE_PROD) up -d redis

# Start only PostgreSQL service in prod mode
prod-db:
	$(COMPOSE_PROD) up -d postgres
