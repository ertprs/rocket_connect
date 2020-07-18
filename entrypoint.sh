#!/bin/sh
chown -R wapi:wapi /wapi_files/
exec runuser -u wapi "$@"

