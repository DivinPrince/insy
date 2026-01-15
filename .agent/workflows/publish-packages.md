---
description: How to version and publish packages to npm
---

# Publishing Packages to npm

This workflow explains how to version and publish your Insy packages (`@insy/vite`, `@insy/next`, `@insy/server`, `@insy/client`, and `insy` CLI) to the npm registry.

## Prerequisites

1. **NPM Account**: You need an npm account with publish permissions
2. **NPM Token**: Generate an automation token from npm:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Automation"
   - Copy the token
3. **GitHub Secret**: Add the NPM token to your GitHub repository:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add a new secret named `NPM_TOKEN` with your npm token

## Publishing Workflow

### Option 1: Automated Publishing via GitHub Actions (Recommended)

This is the recommended approach for production releases.

#### Step 1: Create a Changeset

When you make changes to a package that should be published, create a changeset:

```bash
bun run changeset
```

This will:
- Ask which packages have changed
- Ask what type of change (major, minor, patch)
- Ask for a summary of the changes

The changeset will be saved as a markdown file in `.changeset/`.

#### Step 2: Commit and Push

```bash
git add .
git commit -m "feat: your feature description"
git push origin dev
```

#### Step 3: Merge to Main

When you're ready to publish:

1. Create a PR from `dev` to `main`
2. The GitHub Action will automatically:
   - Create a "Version Packages" PR with updated versions and changelogs
   - When you merge that PR, it will automatically publish to npm

### Option 2: Manual Publishing (Local)

For testing or manual releases:

#### Step 1: Build and Test

```bash
bun run build
bun run typecheck
```

#### Step 2: Create Changeset (if not already done)

```bash
bun run changeset
```

#### Step 3: Version Packages

```bash
bun run version-packages
```

This updates package versions and generates changelogs.

#### Step 4: Publish to npm

First, ensure you're logged into npm:

```bash
npm login
```

Then publish:

```bash
bun run publish-packages
```

This will:
- Build all packages
- Run linting and tests
- Version packages
- Publish to npm

## Package Publishing Checklist

Before publishing, ensure:

- [ ] All packages have proper `exports` fields in package.json
- [ ] All packages have `files` field specifying what to publish
- [ ] All packages have appropriate `peerDependencies`
- [ ] Build outputs are in the `dist` folder
- [ ] README files are up to date
- [ ] CHANGELOG is generated (automatic with changesets)
- [ ] Version numbers follow semver

## Published Packages

The following packages will be published:

1. **`insy`** - Main CLI tool
2. **`@insy/server`** - Local development server
3. **`@insy/vite`** - Vite plugin
4. **`@insy/next`** - Next.js plugin
5. **`@insy/client`** - Browser client

## Troubleshooting

### "You must be logged in to publish packages"

Run `npm login` and enter your credentials.

### "You do not have permission to publish"

Ensure you're a member of the `@insy` npm organization or have publish rights.

### "Version already exists"

You need to bump the version. Run `bun run changeset` to create a new changeset.

### GitHub Action fails with "401 Unauthorized"

Check that the `NPM_TOKEN` secret is correctly set in GitHub and hasn't expired.

## Versioning Strategy

We follow [Semantic Versioning](https://semver.org/):

- **Major (1.0.0)**: Breaking changes
- **Minor (0.1.0)**: New features, backwards compatible
- **Patch (0.0.1)**: Bug fixes, backwards compatible

## CI/CD Pipeline

The GitHub Action (`.github/workflows/release.yml`) automatically:

1. Triggers on pushes to `main` branch
2. Runs `bun run ci:version` to version packages
3. Creates a "Version Packages" PR
4. When merged, runs `bun run ci:publish` to publish to npm

## Testing Before Publishing

To test your packages locally before publishing:

```bash
# In a package directory
bun link

# In a test project
bun link @insy/vite  # or whichever package you're testing
```

Or use `npm pack` to create a tarball:

```bash
cd packages/vite-plugin
npm pack
# This creates a .tgz file you can install elsewhere
```
