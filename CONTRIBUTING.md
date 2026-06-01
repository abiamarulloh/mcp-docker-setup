# Contributing

Thanks for considering contributing to MCP Docker Setup!

## How to Contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run `npm run generate` to regenerate config files if you modified `source.json`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) style (e.g. `feat(mcp): ...`, `fix: ...`, `docs: ...`)
6. Push and open a Pull Request

## Pull Request Checklist

- [ ] I have read the contributing guidelines
- [ ] My changes add or update tests where applicable
- [ ] I ran the relevant commands locally and verified they work
- [ ] I added documentation if necessary (README / docs)

## Code Style

- Keep it simple. This is a small utility project.
- Use `npm run generate` to verify generated files stay in sync.
- Don't commit secrets (`.env` is gitignored for a reason).
