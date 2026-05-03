FROM caddy:2-alpine
WORKDIR /srv
COPY . /srv
CMD ["caddy", "run", "--config", "/srv/Caddyfile", "--adapter", "caddyfile"]
