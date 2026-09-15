FROM node:22-alpine

RUN apk add --no-cache openjdk17-jre \
  && npm install --global firebase-tools@latest

WORKDIR /workspace

COPY ./firebase.json ./

EXPOSE 9099

CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-is212"]
