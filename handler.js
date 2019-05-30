import phone from 'phone';
import qs from 'querystring';
import { MongoClient, ObjectID } from 'mongodb';
import { StreamChat } from 'stream-chat';
import twilio from 'twilio';
import axios from 'axios';

// variable to hold onto database state for frequent runs
let cached = null;

async function connect(uri) {
    // check if database connection is cached
    if (cached && cached.serverConfig.isConnected()) {
        return Promise.resolve(cached);
    }

    // database name
    const dbName = process.env.DB_NAME;

    // connect to database
    return MongoClient.connect(uri, { useNewUrlParser: true }).then(client => {
        // store in cache and return cached variable for re-use
        cached = client.db(dbName);
        return cached;
    });
}

export const auth = async event => {
    // extract params from body
    const { name, number } = JSON.parse(event.body);

    // establish database connection (cached)
    const db = await connect(process.env.DB_CONN);

    const phoneNumber = phone(number)[0];

    // initialize stream chat
    const stream = new StreamChat(
        process.env.STREAM_KEY,
        process.env.STREAM_SECRET
    );

    if (!name || !number) {
        // respond with 200
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Missing name or number.' }),
        };
    }

    try {
        // create or update the user based on their phone number
        const { value } = await db
            .collection(process.env.DB_COL)
            .findOneAndUpdate(
                {
                    number: phoneNumber,
                },
                {
                    $setOnInsert: {
                        name,
                        number: phoneNumber,
                        active: true,
                        updated: new Date(),
                    },
                },
                {
                    upsert: true, // important so that it creates a user if they don't exist
                    returnOriginal: false, // important so that it always returns the data
                }
            );

        // add index to phone number
        await db
            .collection(process.env.DB_COL)
            .createIndex({ number: 1 }, { unique: true });

        // setup user object for storage
        const user = {
            id: value._id.toString(),
            name: value.name,
            number: value.number,
            role: 'user',
            image: 'https://i.imgur.com/Y7reRnC.png',
        };

        // generate token and update users
        const token = stream.createToken(user.id);
        await stream.updateUsers([user]);

        // respond with 200
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ user, token }),
        };
    } catch (error) {
        console.log(error);
        return error;
    }
};

export const sms = async event => {
    // extract body (querystring format coming from twilio)
    const { From, Body } = qs.parse(event.body);

    // establish database connection
    const db = await connect(process.env.DB_CONN);

    // initialize twilio client
    const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

    // initialize stream client
    const stream = new StreamChat(
        process.env.STREAM_KEY,
        process.env.STREAM_SECRET
    );

    // create the channel
    const channel = stream.channel(
        process.env.CHANNEL_TYPE,
        process.env.CHANNEL_NAME
    );

    try {
        // lookup the user based on their incoming phone number
        const user = await db.collection(process.env.DB_COL).findOne({
            number: From,
        });

        // only trigger response if the incoming message includes start
        if (Body && Body.toLowerCase().includes('start')) {
            await client.messages.create({
                body: 'Get started at https://bit.ly/stream-chatty',
                to: From,
                from: process.env.TWILIO_NUMBER,
            });

            // respond with 200
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ status: 'OK' }),
            };
        }

        // deactivate user
        if (Body && Body.toLowerCase().includes('stop')) {
            // set user active status to false so they don't get any additional texts
            await db
                .collection(process.env.DB_COL)
                .updateOne({ _id: From }, { $set: { active: false } });

            // let the user know that they have been removed
            await client.messages.create({
                body: 'Sorry to see you go!', // message body for sms
                to: From, // incoming twilio number
                from: process.env.TWILIO_NUMBER, // twilio outbound phone number
            });

            // respond with 200
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ status: 'OK' }),
            };
        }

        // update acting user
        await stream.updateUsers([
            {
                id: user._id,
                name: user.name,
                role: 'user',
            },
        ]);

        // send a message
        await channel.sendMessage({
            text: Body,
            user: {
                id: user._id,
                name: user.name,
                image: 'https://i.imgur.com/Y7reRnC.png',
            },
            number: user.number,
            context: 'sms',
        });

        // respond with 200
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ status: 'OK' }),
        };
    } catch (error) {
        console.log(error);
        return error;
    }
};

export const chat = async event => {
    // extract the message body and setup the database
    const data = JSON.parse(event.body);

    // establish database connection (cached)
    const db = await connect(process.env.DB_CONN);

    // initialize twilio messages
    const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

    // initialize stream chat
    const stream = new StreamChat(
        process.env.STREAM_KEY,
        process.env.STREAM_SECRET
    );

    // create the channel
    const channel = stream.channel(
        process.env.CHANNEL_TYPE,
        process.env.CHANNEL_NAME
    );

    try {
        // only allow events that are not read, etc.
        if (data.type !== 'messages.read' && data.message) {
            const message = data.message;

            // and only allow @ mentions (check if mentioned users array has mentions)
            if (message.mentioned_users.length > 0) {
                const mentioned = message.mentioned_users;

                // loop through all of the messaged users
                for (const mention in mentioned) {
                    // run a quick lookup against their user id
                    const user = await db
                        .collection(process.env.DB_COL)
                        .findOne({
                            _id: new ObjectID(mentioned[mention].id),
                        });

                    // only attempt to send a message if the user is active
                    if (user.active && message.user.id !== user._id) {
                        // send sms with twilio
                        await client.messages.create({
                            body: `Chat from @${data.user.name}:\n\n${
                                message.text
                            }`, // from user with message text on newline
                            to: user.number, // phone number from database
                            from: process.env.TWILIO_NUMBER, // twilio outbound phone number
                        });
                    }
                }
            }

            if (data.user.id !== 'kathy') {
                // send a random response
                const random = await axios.get('https://api.kanye.rest');

                // send a message
                await channel.sendMessage({
                    user: {
                        id: 'kathy',
                        name: 'Chatty Kathy',
                        image: 'https://i.imgur.com/LmW57kB.png',
                    },
                    text: `@${data.user.name} Here's a Kayne quote for you – "${
                        random.data.quote
                    }"`,
                    mentioned_users: [data.user.id],
                    context: 'random',
                });
            }
        }

        // respond with 200
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ status: 200 }),
        };
    } catch (error) {
        console.log(error);
        return error;
    }
};
