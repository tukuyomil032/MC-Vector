# Contributing to MC-Vector

Thank you for your interest in contributing to MC-Vector! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Guidelines](#coding-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

**Expected Behavior:**

- Be respectful and considerate
- Welcome newcomers and help them get started
- Provide constructive feedback
- Focus on what is best for the project and community

**Unacceptable Behavior:**

- Harassment, discrimination, or offensive comments
- Trolling or insulting/derogatory remarks
- Publishing others' private information without permission
- Any conduct that would be deemed unprofessional

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- A GitHub account
- Git installed on your local machine
- Development environment set up (see [Development Environment](#development-environment))

### Finding an Issue to Work On

1. Browse the [Issues](https://github.com/tukuyomil032/MC-Vector/issues) page
2. Look for issues labeled:
   - `good first issue` - Great for newcomers
   - `help wanted` - Open for contributions
   - `bug` - Bug fixes needed
   - `enhancement` - New features or improvements
3. Comment on the issue to express interest and get assigned

---

## Development Environment

### Quick Setup with Nix (Recommended)

```bash
# Clone the repository
git clone https://github.com/tukuyomil032/MC-Vector.git
cd MC-Vector

# Enter Nix development shell
nix develop

# Install dependencies and run checks
just setup
```

### Manual Setup

```bash
# Clone the repository
git clone https://github.com/tukuyomil032/MC-Vector.git
cd MC-Vector

# Install dependencies
pnpm install

# Install development tools
pip install 'yamllint==1.35.1'
cargo install just  # Optional but recommended

# Run quality checks
pnpm check
```

For detailed setup instructions, see [Development Guide](docs/development-guide.md).

---

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/tukuyomil032/MC-Vector/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment details (OS, MC-Vector version, etc.)

### Suggesting Enhancements

1. Check if the enhancement has already been suggested
2. Create a new issue with:
   - Clear, descriptive title
   - Detailed description of the proposed feature
   - Use cases and benefits
   - Possible implementation approach (optional)

### Contributing Code

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** (follow [Coding Guidelines](#coding-guidelines))
4. **Test your changes:**
   ```bash
   just check-all
   just tauri-dev  # Manual testing
   ```
5. **Commit your changes** (follow [Commit Message Guidelines](#commit-message-guidelines))
6. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

---

## Pull Request Process

### Before Submitting

- [ ] Code follows the project's coding guidelines
- [ ] All quality checks pass (`just check-all` or `make check`)
- [ ] Commit messages follow the guidelines
- [ ] Documentation is updated if needed
- [ ] Manual testing completed

### Submitting a PR

1. Go to the [Pull Requests](https://github.com/tukuyomil032/MC-Vector/pulls) page
2. Click **"New Pull Request"**
3. Select your fork and branch
4. Fill in the PR template:
   - **Title:** Clear, descriptive title
   - **Description:**
     - What does this PR do?
     - Why is this change needed?
     - How was it tested?
     - Related issue(s)
   - **Screenshots/Videos:** If UI changes are involved
5. Submit the PR

### Review Process

1. Maintainers will review your PR
2. You may be asked to make changes
3. Address feedback and push new commits
4. Once approved, a maintainer will merge your PR

### After Your PR is Merged

- Delete your feature branch (both locally and on GitHub)
- Pull the latest changes from `main`
- Celebrate! 🎉

---

## Coding Guidelines

### Frontend (TypeScript/React)

#### Type Safety

- **Never use `any`** in production code. Use `unknown` and narrow with type guards.
- All API payloads must be validated with runtime type guards.
- Use explicit interfaces for component props and shared data structures.

**Example Type Guard:**

```typescript
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function parseProject(value: unknown): { id: string; title: string } | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !title) return null;
  return { id, title };
}
```

#### Component Structure

- Keep components focused and single-purpose
- Extract repeated UI patterns into reusable components
- Use semantic class names over anonymous utility chains

#### Styling

- Short utility usage in TSX for one-off styles
- Long/repeated class chains go in SCSS classes under `src/styles/`
- Group styles by responsibility (base, components, layout, modals, views)
- Import styles only through `src/styles/index.scss` from `src/main.tsx`

#### Async Operations

- Keep file/system operations in `src/lib` wrappers
- UI components should call wrappers, not raw APIs

### Backend (Rust)

- Follow Rust standard conventions
- Use `cargo fmt` to format code: `just rustfmt`
- Handle errors properly with `Result<T, E>`
- Document public APIs with doc comments

### Code Formatting

Run formatters before committing:

```bash
# Format TypeScript/JavaScript/CSS
just format

# Format Rust
just rustfmt

# Lint YAML
just yamllint
```

Or use the comprehensive check:

```bash
just check-all
```

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>: <short summary>

<optional body>

<optional footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring (no functionality change)
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks (dependencies, tooling)
- `perf:` - Performance improvements
- `ci:` - CI/CD changes

### Examples

```
feat: add plugin auto-update feature

Implement automatic plugin updates with version checking.
Users can now enable auto-updates in plugin settings.

Closes #123
```

```
fix: resolve memory leak in server monitor

Fixed memory leak caused by unclosed event listeners
in the server monitoring component.
```

```
docs: update installation guide for Windows

Added clarifications for Windows-specific setup steps.
```

---

## Testing

Currently, MC-Vector relies on manual testing during development.

### Manual Testing Checklist

Before submitting a PR, test the following:

- [ ] Application launches without errors
- [ ] New feature works as expected
- [ ] Existing features still work (no regressions)
- [ ] UI is responsive and looks correct
- [ ] No console errors or warnings
- [ ] Cross-platform compatibility (if applicable)

### Future Testing Plans

We plan to add:

- Unit tests for critical business logic
- Integration tests for Tauri commands
- E2E tests for user workflows

Contributions to testing infrastructure are highly welcome!

---

## Documentation

### When to Update Documentation

Update documentation when:

- Adding a new feature
- Changing existing behavior
- Fixing a bug that affects usage
- Adding new development tools or processes

### Documentation Files

- `README.md` - Overview and quick start
- `docs/tutorial.md` - User guide
- `docs/development-guide.md` - Developer setup and workflow
- `CONTRIBUTING.md` - This file
- `CHANGELOG.md` - Version history
- Inline code comments (only when code needs clarification)

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Add screenshots for UI features
- Keep formatting consistent

---

## Community

### Communication Channels

- **GitHub Issues:** Bug reports, feature requests, and general discussion
- **Pull Requests:** Code contributions and reviews

### Getting Help

- Read the [Development Guide](docs/development-guide.md)
- Check existing [Issues](https://github.com/tukuyomil032/MC-Vector/issues)
- Ask questions in issue comments

---

## Recognition

Contributors will be recognized in:

- Pull Request acknowledgments
- Release notes
- Future CONTRIBUTORS.md file (planned)

Thank you for contributing to MC-Vector! Your efforts help make Minecraft server management easier for everyone. 🚀
