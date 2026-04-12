# Contributing to CROW

Thanks for your interest in contributing.

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Seed the dataset:
   ```bash
   npm run seed
   ```
3. Run quality checks:
   ```bash
   npm run lint
   npm test
   npm run validate
   ```

## Pull Request Guidelines

- Keep changes focused and minimal.
- Add or update tests for behavioral changes.
- Update `README.md` and `CHANGELOG.md` when user-facing behavior changes.
- Ensure all checks pass before requesting review.

## Commit and Versioning

- Use clear commit messages.
- Follow semantic versioning for releases.
- For release PRs, ensure `package.json` version and `CHANGELOG.md` are aligned.
