# GGA Ryder Cup web-app deployment

This branch preserves the original scoring app while adding iPhone Home Screen / PWA installation metadata and a GitHub Pages Actions workflow.

**Not yet included on this branch:** The separate full 13-player shared-app package, 2026 archive, Character Forge and Supabase backend must be migrated and tested before claiming those features are live. This step does not create Supabase accounts or GHIN integration.

To deploy after merging, open GitHub repository Settings → Pages and select **GitHub Actions** as the build and deployment source. Then run **Publish GGA Ryder Cup** in Actions if needed. URL: https://matthewydarraga.github.io/Ryder-cup-gga-repository/

The repository is public: never commit Supabase service-role keys, secrets or private player credentials.
