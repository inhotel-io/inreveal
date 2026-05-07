FROM node:24.18.0-trixie-slim@sha256:ae91dcc111a68c9d2d81ff2a17bda61be126426176fde6fe7d08ab13b7f50573
WORKDIR /usr/src/app
COPY package* pnpm* .pnpmfile.cjs ./
COPY ./packages ./packages/
WORKDIR /usr/src/app/packages/e2e-auth-server
RUN corepack enable
# Gallery isolates e2e-auth-server as its own pnpm workspace (packages/e2e-auth-server/pnpm-workspace.yaml)
# so its OIDC deps stay out of the monorepo root lockfile; with no committed lockfile here,
# install must NOT be --frozen-lockfile (upstream resolves to the root lockfile, the fork does not).
RUN pnpm install
EXPOSE 2286
CMD ["pnpm", "run", "start"]
