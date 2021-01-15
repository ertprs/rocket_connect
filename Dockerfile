FROM node
WORKDIR /app

#ENV user node
# Install Chromium.
RUN \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && \
  apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*s

COPY . .
WORKDIR /app
COPY package*.json ./
RUN mkdir -p /app/node_modules && chown -R node:node /app/ && mkdir -p /rocket_connect_files/ && chown -R node:node /rocket_connect_files/


USER node
RUN npm install
EXPOSE 3001

#RUN chown $user --recursive /app/
