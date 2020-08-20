FROM node
WORKDIR /app
# Install Chromium.
RUN \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && \
  apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*s
COPY . .
RUN npm install
RUN npm install nodemon -g

# Run everything after as non-privileged user.
#RUN useradd -ms /bin/bash wapi

EXPOSE 3001

ENTRYPOINT [ "/app/entrypoint.sh" ]