# Use an official MariaDB runtime as a parent image
FROM mariadb:latest
dnf module enable nodejs:20
dnf install nodejs --setopt=install_weak_deps=False
dnf install npm

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# Set environment variables for MariaDB
ENV MYSQL_ROOT_PASSWORD=rootpassword
ENV MYSQL_DATABASE=aureusco_games
ENV MYSQL_USER=aureusco_glack
ENV MYSQL_PASSWORD=local

# Copy the SQL script to initialize the database
COPY InitializeDatabase.txt /docker-entrypoint-initdb.d/

ENV DBUSER=aureusco_glack
ENV TOWNGARDIA_DISCORD_ID=
ENV TOWNGARDIA_DISCORD_SECRET=
ENV TOWNGARDIA_GOOGLE_ID=
ENV TOWNGARDIA_GOOGLE_SECRET=

WORKDIR /app/dist
EXPOSE 3005 3006
CMD ["npm", "run", "start"]
