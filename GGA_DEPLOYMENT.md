# GGA deployment status

This change prepares Spark-only Auth + Firestore code. It does not publish Firebase
rules, create accounts, verify live authentication, or establish a new deployment.
Complete [CLOUD_SETUP.md](CLOUD_SETUP.md) and verify the production flows before sharing.

The existing Pages workflow publishes only pushes to `claude/gga-ryder-cup-app-3o1bpp`
or manual dispatch. A feature branch/PR does not publish the site. Firebase console
activation and a Pages release are separate steps. GitHub Pages should use GitHub
Actions as its source. Keep secrets and private user backups out of Pages artifacts.
