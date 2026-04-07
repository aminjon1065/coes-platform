#!/bin/sh
set -eu

echo "Running CoESCD backend database migrations..."
node ./node_modules/typeorm/cli.js migration:run -d dist/infra/database/data-source.js

echo "Starting CoESCD backend..."
exec node dist/main.js
