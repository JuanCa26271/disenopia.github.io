# MAGA Admin (deployment boundary)

Deploy this directory as a separately built application on `admin.maga.com`, with its own hostname, CI deployment target, environment secrets, and access policy (VPN or identity-aware proxy). Keep it out of the storefront build and do not add storefront links to this host. The shared API authorizes every admin action; host separation is an additional boundary, not authentication.

The central API should expose protected admin endpoints under `/v1/admin`. Require short-lived signed access tokens in Secure, HttpOnly, SameSite=Strict cookies; rotate refresh credentials, store only refresh-token hashes, invalidate on reuse, and add CSRF protection for state-changing cookie-authenticated requests. Rate limit by account and network and lock after five failed logins with an audited unlock flow.

This directory marks the independent deployment package boundary. Wire the actual admin dashboard to the API before deploying.
