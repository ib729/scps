# Documentation

Welcome to the documentation for the Student Council Management System. This system handles student payments via NFC cards, account management, and point-of-sale operations.

## Table of Contents

### Getting Started
- **[Getting Started](getting-started.md)**: Installation, prerequisites, and quick setup for web UI and CLI tools.
- **[Scripts Reference](scripts.md)**: Documentation for all utility scripts (setup, database, NFC testing).

### User Documentation
- **[User Guide](user-guide.md)**: Step-by-step instructions for staff using the web interface and POS.
- **[NFC Setup](nfc-setup.md)**: Configuring the NFC card reader and tap broadcaster with architecture details.

### System Administration
- **[Authentication Guide](authentication.md)**: Better Auth setup, signup code configuration, Microsoft OAuth, and user management.
- **[Database Guide](database.md)**: Schema details, migrations, backup procedures, and maintenance.
- **[Batch Import Students](batch-import-students.md)**: CSV imports, SQL methods, and bulk enrollment procedures.
- **[Deployment Guide](deployment.md)**: Production deployment with Docker, systemd, SSL, and reverse proxy setup.
- **[Security Guide](security.md)**: Security best practices, secrets management, and hardening recommendations.

### Development
- **[Development Guide](development.md)**: Architecture, tech stack, building, and extending the system.
- **[UI Components Guide](ui-components.md)**: Custom components, animations, and design patterns.

### Reference
- **[Changelog](changelog.md)**: Release notes and recent changes.
- **[Troubleshooting](troubleshooting.md)**: Common issues and solutions.

## Project Structure

- **Root**: CLI tools (pos.py, topup.py), database (stuco.db), setup scripts.
- **web-next/**: Next.js web UI.
- **docs/**: This documentation.

For the root project overview, see [../README.md](../README.md).

## Quick Links

- **New to the Student Council Payment System?** Start with [Getting Started](getting-started.md)
- **Setting up authentication?** See [Authentication Guide](authentication.md)
- **Deploying to production?** See [Deployment Guide](deployment.md) and [Security Guide](security.md)
- **Extending the system?** Check [Development Guide](development.md) and [UI Components](ui-components.md)
- **Having issues?** Look in [Troubleshooting](troubleshooting.md)

## Contributing

This is an internal tool. See the [Development Guide](development.md) for technical details.

**Last updated: November 11, 2025**
