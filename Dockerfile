FROM node
WORKDIR /app

ENV user node


# Install Chromium.
RUN \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && \
  apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*s

WORKDIR /app
RUN mkdir -p /app/node_modules && chown -R node:node /app/

COPY package*.json ./

COPY --chown=node:node . .

EXPOSE 3001

RUN chown $user --recursive /app/
USER $user
RUN npm --save install 