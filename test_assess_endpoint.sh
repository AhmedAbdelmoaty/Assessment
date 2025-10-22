#!/bin/bash
# Test script for /api/assess/next endpoint
# Usage: ./test_assess_endpoint.sh

echo "Testing /api/assess/next endpoint..."
echo "===================================="
echo ""

# Test with a mock session ID
curl -X POST http://localhost:5000/api/assess/next \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-id"}' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  2>/dev/null | jq '.'

echo ""
echo "===================================="
echo "Expected response:"
echo '{
  "kind": "question",
  "level": "L1",
  "cluster": "central_tendency_foundations",
  "prompt": "What is the mean of the following dataset: 2, 4, 6, 8, 10?",
  "choices": ["6", "5", "8", "7"],
  "questionNumber": 1,
  "totalQuestions": 2
}'
echo ""
echo "Note: choices order will be randomized"
echo "Note: may show _dev_fallback: true if using fallback MCQ"
