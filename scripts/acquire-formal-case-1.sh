#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT_DIR=${OUTPUT_DIR:-"$ROOT_DIR/artifacts/formal-case-1"}
CURL_BIN=${CURL_BIN:-curl}
mkdir -p "$OUTPUT_DIR"

FED_URL='https://www.federalreserve.gov/newsevents/pressreleases/monetary20240320a.htm'
SEP_URL='https://www.federalreserve.gov/monetarypolicy/files/fomcprojtabl20240320.pdf'
COINBASE_START='2024-03-20T17:45:00.000Z'
COINBASE_END='2024-03-20T18:30:00.000Z'
COINBASE_URL="https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${COINBASE_START}&end=${COINBASE_END}"

acquire() {
  local name=$1 kind=$2 url=$3
  local body_tmp headers_tmp write_out rc status final_url retrieved_at sha metadata_tmp
  body_tmp=$(mktemp "$OUTPUT_DIR/.${name}.body.tmp.XXXXXX")
  headers_tmp=$(mktemp "$OUTPUT_DIR/.${name}.headers.tmp.XXXXXX")

  set +e
  write_out=$(
    "$CURL_BIN" -sS -L --dump-header "$headers_tmp" --output "$body_tmp" \
      --write-out $'%{http_code}\n%{url_effective}' "$url"
  )
  rc=$?
  set -e
  status=$(printf '%s\n' "$write_out" | sed -n '1p')
  final_url=$(printf '%s\n' "$write_out" | sed -n '2p')

  if [[ $rc -ne 0 || ! $status =~ ^2[0-9][0-9]$ ]]; then
    rm -f "$body_tmp" "$headers_tmp"
    printf 'acquisition failed: %s rc=%s status=%s\n' "$name" "$rc" "${status:-missing}" >&2
    return 1
  fi

  mv -f "$body_tmp" "$OUTPUT_DIR/${name}.raw"
  mv -f "$headers_tmp" "$OUTPUT_DIR/${name}.headers.raw"
  retrieved_at=$(node -e 'process.stdout.write(String(Date.now()))')
  sha=$(sha256sum "$OUTPUT_DIR/${name}.raw" | cut -d' ' -f1)
  metadata_tmp=$(mktemp "$OUTPUT_DIR/.${name}.metadata.tmp.XXXXXX")
  NAME=$name KIND=$kind REQUEST_URL=$url FINAL_URL=$final_url RETRIEVED_AT=$retrieved_at \
    HTTP_STATUS=$status RAW_SHA256=$sha COINBASE_START=$COINBASE_START COINBASE_END=$COINBASE_END \
    node -e '
      const fs = require("node:fs");
      const metadata = {
        name: process.env.NAME,
        kind: process.env.KIND,
        requestUrl: process.env.REQUEST_URL,
        finalUrl: process.env.FINAL_URL,
        retrievedAt: Number(process.env.RETRIEVED_AT),
        curlExitCode: 0,
        httpStatus: Number(process.env.HTTP_STATUS),
        rawSha256: process.env.RAW_SHA256
      };
      if (process.env.KIND === "coinbase-candles") {
        Object.assign(metadata, {
          venue: "Coinbase Exchange",
          product: "BTC-USD",
          symbol: "BTC-USD",
          granularitySeconds: 60,
          start: process.env.COINBASE_START,
          end: process.env.COINBASE_END
        });
      }
      fs.writeFileSync(process.argv[1], JSON.stringify(metadata, null, 2) + "\n");
    ' "$metadata_tmp"
  mv -f "$metadata_tmp" "$OUTPUT_DIR/${name}.metadata.json"
}

failures=0
acquire fed-statement fed-statement "$FED_URL" || failures=$((failures + 1))
acquire fed-sep fed-sep "$SEP_URL" || failures=$((failures + 1))
acquire coinbase-btc-usd-1m coinbase-candles "$COINBASE_URL" || failures=$((failures + 1))

if [[ $failures -ne 0 ]]; then
  exit 1
fi
