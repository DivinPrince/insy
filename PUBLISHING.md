# Publishing Quick Reference

## Quick Commands

```bash
# Create a changeset (run after making changes)
bun run changeset

# Version packages locally (updates package.json versions)
bun run version-packages

# Publish to npm (manual - requires npm login)
bun run publish-packages
```

## GitHub Actions (Automated)

1. Push to `dev` branch with changesets
2. Create PR to `main`
3. GitHub Action creates "Version Packages" PR
4. Merge "Version Packages" PR → Auto-publishes to npm

## Packages That Will Be Published

- `insy` - CLI tool
- `@insy/server` - Development server
- `@insy/vite` - Vite plugin
- `@insy/next` - Next.js plugin
- `@insy/client` - Browser client
- `@insy/shared` - Shared utilities

## NPM Setup Required

1. Create npm account
2. Generate automation token at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
3. Add `NPM_TOKEN` secret to GitHub repo settings

## Versioning Guide

- **Patch (0.0.x)**: Bug fixes, no breaking changes
- **Minor (0.x.0)**: New features, backwards compatible
- **Major (x.0.0)**: Breaking changes

## Testing Locally Before Publishing

```bash
# Build all packages
bun run build

# Type check
bun run typecheck

# Link package for local testing
cd packages/vite-plugin
bun link

# In your test project
bun link @insy/vite
```
