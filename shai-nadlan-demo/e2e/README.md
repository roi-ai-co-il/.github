# E2E tests

The suite exercises the server-rendered screens with a real Supabase session
instead of driving the login form, because a restricted network sandbox can
block browser-originated HTTPS to Supabase while the Node server still reaches
it. Driving the form is the better test wherever the browser has open network
access — add that case there.

Mint a session cookie and run:

Sign-in is a one-time code sent to the single authorized address, and password
grant is disabled, so a session has to be minted with the service-role key
rather than by posting a password.

```bash
# 1. Mint a session for the demo account and turn it into the cookie
#    supabase-ssr writes. Needs SUPABASE_SERVICE_ROLE_KEY (never commit it).
SESSION=$(curl -s -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=refresh_token" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$E2E_REFRESH_TOKEN\"}")

export E2E_SESSION_COOKIE="base64-$(printf '%s' "$SESSION" | python3 -c '
import sys, json, base64
d = json.load(sys.stdin)
keep = ("access_token","token_type","expires_in","expires_at","refresh_token","user")
raw = json.dumps({k: d[k] for k in keep}, separators=(",",":"))
print(base64.b64encode(raw.encode()).decode())
')"

# 2. Build, serve, and test.
npm run build && npx next start -p 3100 &
npx playwright test
```

Without `E2E_SESSION_COOKIE` the tests skip rather than fail.
