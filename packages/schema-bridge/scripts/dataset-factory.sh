#!/bin/bash

# Dataset Factory - Phase 1
# Fetches real-world OpenAPI specifications to seed the Schema Bridge memory.

DATA_DIR="tests/fixtures/specs"
mkdir -p "$DATA_DIR"

echo "--- 🚀 IntegraX Dataset Factory Starting ---"

# 1. GitHub REST API (OpenAPI 3.0)
# Reference: https://github.com/github/rest-api-description
GITHUB_SPEC_URL="https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"
echo "📥 Fetching GitHub API Spec..."
curl -s "$GITHUB_SPEC_URL" > "$DATA_DIR/github-api.json"

# 2. Stripe API (OpenAPI 3.0)
# Reference: https://github.com/stripe/openapi
STRIPE_SPEC_URL="https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json"
echo "📥 Fetching Stripe API Spec..."
curl -s "$STRIPE_SPEC_URL" > "$DATA_DIR/stripe-api.json"

echo "--- ✅ Specs Downloaded to $DATA_DIR ---"

# 3. Check for Prism (Mocking)
if command -v prism &> /dev/null
then
    echo "✨ Prism detected. You can run mock servers with:"
    echo "   npx prism mock $DATA_DIR/stripe-api.json"
else
    echo "💡 Tip: Install Prism to generate mock payloads from these specs:"
    echo "   npm install -g @stoplight/prism-cli"
fi

# 4. Check for Schemathesis (Fuzzing)
if command -v schemathesis &> /dev/null
then
    echo "🧪 Schemathesis detected. Ready for fuzzing."
else
    echo "💡 Tip: Install Schemathesis for adversarial testing:"
    echo "   pip install schemathesis"
fi

echo "--- 🏁 Factory Setup Complete ---"
