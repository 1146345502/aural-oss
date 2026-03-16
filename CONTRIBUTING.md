# Contributing to Aural

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **Docker** (for local Supabase)
- At least one LLM API key (OpenAI recommended)

### Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/aural-oss.git
cd aural-oss

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Start local Supabase
npx supabase start

# 5. Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Voice Relay (optional)

If you're working on voice interview features:

```bash
# In separate terminals
npm run dev:voice         # Kimi/Doubao voice relay on :8081
npm run dev:openai-voice  # OpenAI voice relay on :8082
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feat/add-new-question-type`
- `fix/session-timeout-handling`
- `docs/update-deployment-guide`

### Code Style

- TypeScript strict mode is enabled
- ESLint and the Next.js linter are configured — run `npm run lint` before submitting
- Avoid adding comments that merely narrate what the code does

### Running Checks

Before submitting a PR, make sure everything passes:

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript type check
npm run test:web      # Unit tests
```

## Pull Requests

1. **Keep PRs focused.** One feature or fix per PR.
2. **Write a clear description.** Explain *what* changed and *why*.
3. **Include test updates** if you're changing behavior covered by existing tests.
4. **Reference issues** if applicable (e.g., "Closes #42").

## Reporting Bugs

Please use the [Bug Report](https://github.com/1146345502/aural-oss/issues/new?template=bug_report.md) issue template. Include:

- Steps to reproduce
- Expected vs. actual behavior
- Browser / OS / Node version
- Relevant logs or screenshots

## Feature Requests

Use the [Feature Request](https://github.com/1146345502/aural-oss/issues/new?template=feature_request.md) issue template. Describe:

- The problem you're solving
- Your proposed solution
- Any alternatives you've considered

## Security

If you discover a security vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
