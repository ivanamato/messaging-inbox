# Release commands (gitignored — contains push operations)

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
