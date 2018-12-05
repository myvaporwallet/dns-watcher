#Get base image
FROM alpine:3.8

# Set environment variables.
ENV HOME /root
ARG STATUS_SITE
ARG GITHUB_SITE
ARG PRODUCTION_SITE
ARG ALLOWED_IPS

# Copy everything
WORKDIR /root
COPY . .

#Run some commands
RUN apk add --update nodejs nodejs-npm && \
    npm install npm@latest -g

RUN cd /root/ && \
    npm install

RUN cp ${ALLOWED_IPS} watcher/src/lists/allowed-resolutions.json

RUN npm run build:prod

RUN mv frontend/dist . &&  mv frontend/web-server.js . && mv frontend/package.json ./package-frontend.json && \
    rm -rf frontend && mkdir frontend && \
    mv dist frontend/ && mv web-server.js frontend/ && mv package-frontend.json frontend/package.json

# Delete installed packages
RUN npm cache clean --force 

# Expose the ports
EXPOSE 8080