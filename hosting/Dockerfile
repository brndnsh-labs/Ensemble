# syntax=docker/dockerfile:1
# The app as an image: the built static site inside an unprivileged nginx.
# Nothing is compiled in here. `pnpm image` builds the site first and hands it
# in as the named build context `site`, so the files served are the files the
# smoke journeys ran against, and this folder (two small files) is the whole
# build context.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
ARG REVISION=development
LABEL org.opencontainers.image.title="Ensemble" \
      org.opencontainers.image.revision="${REVISION}"

COPY nginx.conf /etc/nginx/nginx.conf

# Only the site: the base image's own pages go first. That needs root; the
# image runs as nginx (uid 101) again afterwards.
USER root
RUN rm -rf /usr/share/nginx/html && mkdir -p /usr/share/nginx/html
COPY --from=site . /usr/share/nginx/html/
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["wget", "--quiet", "--output-document=/dev/null", "http://127.0.0.1:8080/index.html"]

# Straight to nginx: the base image's entrypoint scripts write into /etc/nginx,
# which a read-only root filesystem refuses.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
