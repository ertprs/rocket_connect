#!/bin/sh
chown -R node:node /wapi_files/
exec runuser -u node "$@"

