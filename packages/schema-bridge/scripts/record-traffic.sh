#!/bin/bash

# WireMock Traffic Recorder for IntegraX
# Usage: ./record-traffic.sh https://api.stripe.com

TARGET_URL=$1
WIREMOCK_URL="http://localhost:8080"

if [ -z "$TARGET_URL" ]; then
    echo "❌ Error: Please provide a target URL (e.g., https://api.stripe.com)"
    exit 1
fi

echo "--- 🎙️ IntegraX Traffic Recorder Starting ---"
echo "🎯 Target: $TARGET_URL"
echo "🔗 Recording via: $WIREMOCK_URL"

# 1. Check if WireMock is up
if ! curl -s "$WIREMOCK_URL/__admin" > /dev/null; then
    echo "❌ Error: WireMock is not running. Start it with 'pnpm run docker:mvp'"
    exit 1
fi

# 2. Start Recording
echo "📡 Enabling Record Mode..."
curl -X POST "$WIREMOCK_URL/__admin/recordings/start" \
     -H "Content-Type: application/json" \
     -d "{ \"targetBaseUrl\": \"$TARGET_URL\", \"repeating\": true }"

echo "--- ✅ Recording Enabled! ---"
echo "👉 Now, point your application or curl to $WIREMOCK_URL instead of $TARGET_URL"
echo "👉 When finished, run: curl -X POST $WIREMOCK_URL/__admin/recordings/stop"
