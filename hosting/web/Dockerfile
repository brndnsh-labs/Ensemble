# syntax=docker/dockerfile:1
# The `ensemble-web` image (#1356): the v2 music stand, built at `ENSEMBLE_V2_BASE=/`, inside
# an unprivileged nginx. Decision 1 of docs/design/ensemble-v2-rollout.md — the static site
# becomes an immutable artifact released by tag like the API, and rollback is the previous tag.
#
# Build context: hosting/web — three small files, of which this one COPYs two. (`smoke.mjs`
# is in the directory because it belongs beside what it tests; it is never copied into the
# image and runs from the host against a started container.) The site itself arrives through a
# NAMED build context so the repository is never the context — a `.dockerignore` for a tree
# holding node_modules, .next and the whole app is a thing to get wrong, not a thing to
# maintain:
#
#   ENSEMBLE_V2_BASE=/ npm run build --prefix prototypes/v2
#   docker build hosting/web --build-context site=prototypes/v2/out \
#       --build-arg REVISION="$(git rev-parse HEAD)" --tag ensemble-web:local
#
# Same prebuilt-artifact shape as prototypes/v2-api/Dockerfile: CI builds the export first,
# then builds the image. There is no compile step in here on purpose — the bytes served are
# the bytes the v2 gates already ran against.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
ARG REVISION=development
LABEL org.opencontainers.image.source="https://github.com/brndnsh-labs/Ensemble" \
      org.opencontainers.image.revision="${REVISION}"

# The whole config, not a conf.d drop-in: the base image's nginx.conf has to be replaced for
# the pid/temp paths to land in the tmpfs, and one file is easier to review than two.
COPY nginx.conf /etc/nginx/nginx.conf

# Empty the document root before the export lands in it. The base image ships its own
# index.html — which the COPY below overwrites — AND a 50x.html, which it does not: without
# this, `GET /50x.html` serves nginx's stock "Faithfully yours, nginx." page from what is
# supposed to be an artifact of exactly the files the v2 gates ran against. The base image's
# final USER is nginx, and that directory is root-owned, so the removal needs root; the
# directory is recreated root:root 0755 and every COPY runs as root regardless of USER, which
# leaves ownership and the uid-101 readability of the served files exactly as they were.
USER root
RUN rm -rf /usr/share/nginx/html && mkdir -p /usr/share/nginx/html
COPY --from=site . /usr/share/nginx/html/

# Back to the base image's own user; stated so a future edit cannot lose it silently.
USER nginx
EXPOSE 8080

# Busybox wget, which this base image has. The compose service should use the same command
# (hosting/README.md); it is spelled here so `docker run` alone reports health too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["wget", "--quiet", "--output-document=/dev/null", "http://127.0.0.1:8080/index.html"]

# Bypass the base image's docker-entrypoint.sh: its /docker-entrypoint.d/ scripts want to
# write into /etc/nginx, which a read-only rootfs refuses, and this image has no templates for
# them to expand. Same reason hosting/static/compose.yml overrides the entrypoint.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
