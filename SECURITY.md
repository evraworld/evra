# Security policy

## Scope

EVRA runs on **Stellar testnet only**. No real money moves through this code, and nothing goes to mainnet before an independent audit of the Deal Terms contract.

We still want to hear about anything that could put people's accounts, data or future funds at risk: authentication and sessions, access to someone else's deals or data, injection, SSRF, key handling, and contract logic once it lands in `contracts/`.

## Reporting a vulnerability

Please **don't open a public issue**.

Report it privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. If that option isn't available, send a direct message to [@evraworld](https://x.com/evraworld) on X asking for a private channel, without the details.

Include what you found, how to reproduce it, and what an attacker could do with it. We reply within 3 business days, keep you updated while we fix it, and credit you when the fix ships, unless you'd rather stay anonymous.

## Supported versions

Only the latest commit on `main` is supported.
