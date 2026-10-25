#!/bin/sh
set -e

# Run database setup/migration if requested and MONGODB_URI is provided
if [ -n "$MONGODB_URI" ]; then
  if [ "$AUTO_SETUP" = "true" ]; then
    echo "Running database setup..."
    node server/scripts/setup.js || true
  fi

  if [ "$AUTO_MIGRATE" = "true" ]; then
    echo "Running database team migration..."
    node server/scripts/migrate-team.js || true
  fi

  if [ "$AUTO_SEED" = "true" ]; then
    echo "Seeding database with demo memories..."
    node server/scripts/seed.js || true
  fi
fi

# Execute the container command (default: node server/index.js)
exec "$@"
