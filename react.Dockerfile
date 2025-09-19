# Use the latest LTS version of Node.js
FROM node:18-alpine
 
# Set the working directory inside the container
WORKDIR /app

# Uncomment if needed
#COPY .npmrc ./

# Expose the port your app runs on
EXPOSE 3000
 
# Define the command to run your app
#CMD ["npm", "start"]
