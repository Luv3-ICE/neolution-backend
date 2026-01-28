FROM node:18

# set working directory
WORKDIR /app

# copy package files first (เพื่อ cache layer)
COPY package*.json ./

# install dependencies
RUN npm install

# copy source code
COPY . .

# expose backend port
EXPOSE 3001

# default command (dev)
CMD ["npm", "run", "dev"]
