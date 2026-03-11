# Gitignored commands (contains credentials / push operations)

# Build library and serve the Vue 3 private example at http://localhost:5174
private-example:
    npm run build
    cd examples/vue3-private-example && npm install && npx vite --port 5174 --host 0.0.0.0

# Bump minor version, push, and create GitHub release
release-minor:
    npm version minor
    git push origin master --tags
    gh release create $(git describe --tags --abbrev=0) --generate-notes

# Bump major version, push, and create GitHub release
release-major:
    npm version major
    git push origin master --tags
    gh release create $(git describe --tags --abbrev=0) --generate-notes
