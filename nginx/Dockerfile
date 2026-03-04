FROM nginx:1.27-alpine

# Remove default site
RUN rm /etc/nginx/conf.d/default.conf

# Copy the template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Create certs directory (can be empty; real certs are mounted at runtime)
RUN mkdir -p /etc/nginx/certs

EXPOSE 80 443

# envsubst is called with an explicit variable list so that nginx's own
# $host, $remote_addr, $scheme, etc. are never touched by the substitution.
CMD ["/bin/sh", "-c", \
  "envsubst '${SERVER_NAME}' < /etc/nginx/nginx.conf.template \
     > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
