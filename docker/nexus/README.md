# Optional Nexus registry configuration

GGCS Docker builds support Nexus Repository Manager without requiring it.
All `NEXUS_*` variables are optional:

- missing `.env` -> public upstream registries are used;
- blank Nexus variables -> public upstream registries are used;
- non-empty Nexus variables -> only the corresponding package source is rewritten.

Copy `.env.example` to `.env` and fill only the repositories available in your Nexus instance.
Do not include URL schemes in `NEXUS_DOCKER_REGISTRY`; Docker image references use a registry/prefix such as `nexus.example.com/repository/docker-all`.

The configuration helper intentionally does not handle credentials. Prefer anonymous/network-restricted read access for proxy repositories. If authentication is mandatory, use Docker login for the Docker registry and BuildKit secrets for package-manager credentials rather than build arguments.
