var express = require('express');
var app = express();

const { Client, Location } = require('whatsapp-web.js');


const fs = require('fs');
const axios = require('axios')
const qrcode = require('qrcode-terminal');
const qrcodejs = require('qrcodejs')

const config = require('./config/config.json');

// set global configs
global.config = config
global.clients = {}

const puppeteerOptions = {
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
    }
};

function initializeInstance(instance) {
    // define session
    let sessionCfg;
    if (fs.existsSync(instance.session_path)) {
        sessionCfg = require(instance.session_path);
    };
    // instantiate client
    client = new Client({ puppeteerOptions, session: sessionCfg, instance_name: instance.name });
    // handle it to global
    global.client = client

    //
    // QR CODE EVENT
    //
    global.client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        console.log(instance.number, 'QR RECEIVED', qr);
        fs.writeFileSync(instance.qr_path, qr);
        qrcode.generate(qr, { small: true });
        //app.rock.sendDirectToUser("http://127.0.0.1:5000/getqr", config.rocketchat.manager_user)
    });

    //
    // AUTHENTICATION SUCCESS EVENT
    //
    global.client.on('authenticated', (session) => {
        console.log('AUTHENTICATED', session);
        sessionCfg = session;
        fs.writeFile(instance.session_path, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    //
    // AUTHENTICATION FAILURE EVENT
    //
    global.client.on('auth_failure', msg => {
        // Fired if session restore was unsuccessfull
        console.error('AUTHENTICATION FAILURE', msg);
        fs.unlinkSync(instance.session_path)
    });

    //
    // STATE CHANGE EVENT
    //
    global.client.on('change_state', state => {
        console.log(state)
    });

    //
    // READ CHANGE EVENT
    //
    global.client.on('ready', () => {
        //app.rock.sendDirectToUser("WAPI READY!", config.rocketchat.manager_user)
        console.log("WAPI READY!")
    });

    //
    // NEW MESSAGE EVENT
    //
    global.client.on('message', msg => {
        console.log(msg)
        // get user id
        userid = msg.from.split("@")[0]
        client_file = global.config.instance.client_folder + userid + '.json'
        client = {
            userid: userid
        }
        // check if there is a room already
        if (fs.existsSync(client_file)) {

        } else {
            // get the contact info
            contact = msg.getContact().then(c => {

                // register the visitor
                visitor = {
                    "visitor": {
                        "name": c['pushname'],
                        "token": userid,
                        "phone": msg['id']['fromMe'],
                        "customFields": [
                            {
                                "key": "whatsapp_name",
                                "value": c['pushname'],
                                "overwrite": false,
                            },
                            {
                                "key": "whatsapp_number",
                                "value": c['id']['_serialized'].split('@')[0],
                                "overwrite": false,
                            }
                        ]
                    }
                }
                client.visitor = visitor
                url = global.config.rocketchat.url + '/api/v1/livechat/visitor/'
                axios.post(
                    url, visitor
                ).then((response) => {
                    console.log(response);
                  }, (error) => {
                    console.log(error);
                  });

                // fs.writeFile(client_file, JSON.stringify(client), function (err) {
                //     if (err) {
                //         console.error(err);
                //     }
                // });

            })
        }
        // if no room, register guest and user id as token
        // create a new room

    });

    // GO!
    global.client.initialize()

}

app.listen(global.config.port, () => {
    console.log("######")
    console.log("WAPI STARTED")
    console.log("######")
    console.log(`listening on port ${global.config.port}`);
    console.log(global.config);
    // initialize clientes, according to instances
    console.log("###### INITIALIZING CLIENT INSTANCE")
    console.log(global.config.instance)
    global.clients = {}
    console.log("######")
    instance = global.config.instance
    if (!fs.existsSync(instance.visitors_path)) {
        fs.mkdirSync(instance.visitors_path, { recursive: true });
    }
    initializeInstance(instance)

});

