# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--author <name>` flag for `ossready init` to set the LICENSE copyright holder
- Scaffold `SECURITY.md` with private vulnerability reporting guidance
- Scaffold `.github/dependabot.yml` for weekly npm and GitHub Actions updates
- `--dry-run` flag for `ossready init` to preview scaffold files without writing
- GitHub Actions CI for this repository (Node 18/20/22: test + build)

### Fixed

- Scaffold copyright year now uses the current calendar year instead of a hardcoded value

## [0.1.0] - 2026-09-14

### Added

- Initial `ossready init` CLI: LICENSE, README, CI/release workflows, issue/PR templates, CONTRIBUTING, CHANGELOG, TypeScript layout
