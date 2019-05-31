# Serverless Environment for Chatty

This repo holds the code for the Serverless enviroment that supports the frontend [Chatty](https://github.com/GetStream/stream-chat-chatty-web) application.

## Deploying

First, create an account and an application on [Serverless](https://dashboard.serverless.com). Take note of your tenant name as well as your application name as these two will be needed.

Clone this repo into a `serverless` directory:

```bash
$ git clone git@github.com:GetStream/stream-chat-chatty-serverless.git serverless
```

Open the `serverless.yml` file and modify the app and tenant name at the top of the file. Then fill out the rest of the environment variables.

```yaml
service: chatty # your serverless app name
app: chatty # your serverless app name
tenant: stream # your serverless tenant name
```

AND

```yaml
environment:
    DB_CONN: YOUR_MONGODB_CONNECTION_STRING # https://atlas.mongodb.com
    DB_NAME: YOUR_MONGODB_DATABASE_NAME
    DB_COL: YOUR_MONGODB_COLLECTION_NAME
    TWILIO_SID: YOUR_TWILIO_SID
    TWILIO_TOKEN: YOUR_TWILIO_TOKEN
    TWILIO_NUMBER: YOUR_TWILIO_NUMBER
    STREAM_KEY: YOUR_STREAM_KEY
    STREAM_SECRET: YOUR_STREAM_SECRET
    CHANNEL_TYPE: messaging # keep this as messaging
    CHANNEL_NAME: chatty-kathy-5 # make this the same value as web
```

Install the dependencies using yarn.

```bash
$ cd serverless && yarn install
```

Create an account on AWS and install the [AWS CLI](https://aws.amazon.com/cli/) on your machine.

```bash
$ brew install awscli

$ aws configure
```

![](https://i.imgur.com/KcqEapK.png)

Install the Serverless framework globally.

```bash
$ yarn global add serverless
```

Finally, run the deploy command.

```bash
$ serverless deploy
```

Happy coding! ✌
