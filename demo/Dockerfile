# Supertext Translation for Apostrophe: public demo (Railway). Build context = repository root:
#   docker build -f demo/Dockerfile -t supertext-apostrophe-demo .
FROM node:22-bookworm-slim

ENV NODE_ENV=production APOS_RELEASE_ID=supertext-demo PORT=8080
WORKDIR /app/demo
COPY demo/ /app/demo/
# The module itself goes to demo/module, which the demo installs (install-links: a copy).
COPY package.json index.js /app/demo/module/
COPY lib /app/demo/module/lib
COPY i18n /app/demo/module/i18n
COPY ui /app/demo/module/ui
RUN npm ci --no-audit --no-fund \
 && APOS_DB_URI=sqlite:///tmp/build.db node app @apostrophecms/asset:build \
 && rm -f /tmp/build.db* \
 && chmod +x /app/demo/docker/entrypoint.sh

EXPOSE 8080
CMD ["/app/demo/docker/entrypoint.sh"]
