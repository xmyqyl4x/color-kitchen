FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./

FROM dependencies AS build
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm ci --omit=dev --ignore-scripts

FROM dependencies AS web
ARG REVISION
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY --from=build /app/dist/src/ dist/src/
COPY src/web/kitchen.css src/web/kitchen.css
COPY catalog/ catalog/
COPY db/ db/
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD ["node", "dist/src/http/health.js"]
CMD ["node", "dist/src/http/cli.js"]
