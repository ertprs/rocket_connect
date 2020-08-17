var express = require('express');
var morgan = require('morgan')
var app = express();

const { driver, api } = require('@rocket.chat/sdk');

app.use(express.json());

const { Client, Location, MessageMedia } = require('whatsapp-web.js');

var utils = require('./utils');

const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios')
const qrcode = require('qrcode-terminal');
const qrcodejs = require('qrcodejs')

const config = require('./config/config.json');
const { instance } = require('@rocket.chat/sdk/dist/lib/methodCache');
const { client } = require('@rocket.chat/sdk/dist/lib/api');
const { restart } = require('nodemon');

// set global configs
global.config = config
global.wapi = {}

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
    const client = new Client({ puppeteerOptions, session: sessionCfg, instance_name: instance.name });
    client.instance = instance;
    // handle it to global
    global.wapi[instance.name] = client
    //
    // QR CODE EVENT
    //
    client.on('qr', function (qr) {
        // Generate and scan this code with your phone
        //console.log(this.instance.name, 'QR RECEIVED', qr);
        //
        fs.writeFileSync(this.instance.qr_path, qr);
        qrcode.generate(qr, { small: true });
        url_online = "https://api.qrserver.com/v1/create-qr-code/?data=" + qr + '&size=800x800'
        message = `${this.instance.name} (${this.instance.number}): QR CODE AVAILABLE`

        //send to rocketchat manager
        config.rocketchat.manager_user.map(user => {
            global.rocket.sendDirectToUser(message, user)
            global.rocket.sendDirectToUser(url_online, user)
        })
        // send to instance manager
        this.instance.manager_user.map(user => {
            global.rocket.sendDirectToUser(message, user)
            global.rocket.sendDirectToUser(url_online, user)
        })

    });

    //
    // AUTHENTICATION SUCCESS EVENT
    //
    client.on('authenticated', function (session) {
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
    client.on('auth_failure', function (msg) {
        // Fired if session restore was unsuccessfull
        console.error('AUTHENTICATION FAILURE', msg);
        fs.unlinkSync(this.instance.session_path);
        initializeInstance(instance);
    });

    //
    // STATE CHANGE EVENT
    //
    // TODO: alert changed events to rocket admin
    // alert battery
    // alert others
    client.on('change_state', function (state) {
        console.log(state)
        if (state == "UNPAIRED") {
            // send to instance manager
            this.instance.manager_user.map(user => {
                message = `${this.instance.name} (${this.instance.number}): UNPAIRED`
                global.rocket.sendDirectToUser(message, user)
            })
            this.destroy().then(
                ok => {
                    //remove session
                    fs.unlinkSync(this.instance.session_path);
                    initializeInstance(instance)
                }
            )

        }
    });

    //
    // BATTERY CHANGE
    //
    //
    client.on('change_battery', function (batteryInfo) {
        // Battery percentage for attached device has changed
        const { battery, plugged } = batteryInfo;
        message = `${this.instance.name} (${this.instance.number}): Battery: ${battery}% - Charging? ${plugged}`
        //instance.manager_user
        this.instance.manager_user.map(user => {
            global.rocket.sendDirectToUser(message, user)
        })
        // TODO: Alert rocketchat manager if battery hits certain threshold
    });


    //
    // READ CHANGE EVENT
    //
    client.on('ready', function () {
        message = `${this.instance.name} (${this.instance.number}): WAPI READY!`
        this.instance.manager_user.map(user => {
            global.rocket.sendDirectToUser(message, user)
        })
    });

    //
    // NEW MESSAGE EVENT
    //
    client.on('message', function (msg) {
        console.log(msg)
        // get user id
        // 5531123456.json for the file
        userid = msg.from.split("@")[0]
        visitor_file = instance.visitors_path + userid + '.json'
        //
        visitor = {
            userid: userid
        }
        console.log("VISITOR FILE, ", fs.existsSync(visitor_file))
        // check if there is a room already
        if (fs.existsSync(visitor_file)) {
            visitor = require(visitor_file);
            utils.send_rocket_message(visitor, msg).then(
                (res) => {
                    console.log(res.data)
                },
                (err) => {
                    if (err.response.data.error == "room-closed") {
                        // room is closed, remove the file, so it can be opened again
                        fs.unlinkSync(visitor_file)
                        utils.register_visitor(msg, this)
                        visitor = require(visitor_file);
                        utils.send_rocket_message(visitor, msg).then(
                            ok => {
                                console.log("room was closed, but we reopened and sent")
                            }
                        )

                    }
                }
            )
        }

        console.log(fs.existsSync(visitor_file))
        // no room, lets create a new one
        if (!fs.existsSync(visitor_file)) {
            console.log("visitor file not found")
            // get the contact info
            utils.register_visitor(msg, this);
            visitor = require(visitor_file);
            utils.send_rocket_message(visitor, msg).then(
                ok => {
                    console.log("room was closed, but we reopened and sent")
                }
            )

        }
        // if no room, register guest and user id as token
        // create a new room

    });

    // GO!
    client.initialize()

}

function initializeRocketApi() {
    const HOST = config.rocketchat.url;
    const USER = config.rocketchat.admin_user;
    const PASS = config.rocketchat.admin_password;

    user = { username: USER, password: PASS }

    driver.connect({ host: HOST, useSsl: false })
    driver.login({ username: USER, password: PASS })
    global.rocket = driver
}

// Initialie instances
global.config.instances.map(instance => {
    // initialize clientes, according to instances
    console.log("###### INITIALIZING CLIENT INSTANCE: " + instance.name)
    if (!fs.existsSync(instance.visitors_path)) {
        fs.mkdirSync(instance.visitors_path, { recursive: true });
    }
    initializeInstance(instance)
})

// initialize rocketapi
initializeRocketApi()

// test stuff
app.get('/test', function (req, res) {

    file_path = '/wapi_files/instance1/media/553199851271/ago-2019-Especialidades-Apontadas.pdf'
    var form = new FormData();
    form.append('file', fs.createReadStream(file_path));
    axios({
        method: 'post',
        url: global.config.rocketchat.url + '/api/v1/livechat/upload/jGCK2MfNEdMqvvsir',
        data: form,
        headers: {
            'content-type': `multipart/form-data; boundary=${form._boundary}`,
            'x-visitor-token': '553199851271@c.us'
        }
    }).then(function (response) {
        //handle success
        console.log(response);
    }).catch(function (response) {
        //handle error
        console.log(response);
    });
    res.send('ok')
})

//
// check if number has whatsapp
//
//
app.get('/check/:instance/:number', function (req, res) {
    const instance = req.params.instance
    number = utils.normalize_cell_number(req.params.number)
    const client = global.wapi[instance]
    if (client) {
        client.isRegisteredUser(number + "@c.us").then(exists => {
            if (exists) {
                res.send(exists)
            } else {
                return res.status(404).send('Whatsapp Number not Registered')
            }
        })
    } else {
        return res.status(404).send('Client Instance Not found')
    }

})
//
// send a message to a number from the endpoint
//
app.post('/send/:instance/:number', function (req, res) {
    const instance = req.params.instance
    const message = req.body.message
    number = utils.normalize_cell_number(req.params.number)
    const client = global.wapi[instance]
    force_rocketchat = req.body.force || false
    if (client) {

        // check if there is a livechat open for this number
        visitor_file = client.instance.visitors_path + number + '.json'
        if (fs.existsSync(visitor_file)) {
            // visitor found
            console.log("sending using rocketchat")
            visitor = require(visitor_file);
            console.log(req.body)
            // simple text message to rocketchat
            url = global.config.rocketchat.url + '/api/v1/livechat/message'
            client.sendMessage(
                number + '@c.us', message
            )
            utils.send_rocket_text_message(
                visitor,
                "MESSAGE SENT TO CUSTOMER: " + message
            ).then(
                ok => console.log(ok),
                err => console.log(err),
            )
        } else {
            console.log("sending direct")
            // visitor file not found, sending direct
            client.sendMessage(
                number + '@c.us', message
            )

        }
    } else {
        return res.status(404).send('Client Instance Not found')
    }
    res.send("ok")

})
//
//
//
app.post('/rocketchat', function (req, res) {

    //
    console.log("rocketchat webhook", req.body)

    // no valid token provided. deny
    if (req.headers['x-rocketchat-livechat-token'] != config.rocketchat.secret_token) {
        return res.status(404).send('Not found')
    }

    // test button from rocketchat config
    if (req.body._id == "fasd6f5a4sd6f8a4sdf") {
        res.send("ok");
    }

    // text menssage
    if (req.body.type == "Message") {

        console.log("Receiving Message from Rocketchat")
        // here we receive the rocketchat message
        // we have now clue to what instance we should send this to
        // we need to check for
        userid = req.body.visitor.token.split("@")[0]
        visitor_id = req.body.visitor._id
        console.log("userid", userid)
        console.log("visitor_id", visitor_id)
        const client = utils.get_client(userid, visitor_id)
        // if we get client
        // this can avoid rocketchat sync error
        // at sometimes
        if (client) {
            message = req.body.messages[0]
            console.log("got client")
            console.log('instance:', client.instance.name)
            console.log('to:', req.body.visitor.token)
            console.log('content:', req.body.messages[0].msg)
            message = "*[" + req.body.agent.name + "]*\n" + req.body.messages[0].msg
            console.log("attachments", req.body.messages[0].attachments)
            console.log("fileUploads", req.body.messages[0].fileUpload)
            // lets close the chat
            if (req.body.messages[0].closingMessage == true) {
                // send last message
                // if we have a custom one, use it
                if (client.instance.default_closing_message) {
                    message = "*[" + req.body.agent.name + "]*\n" + client.instance.default_closing_message
                }

                client.sendMessage(req.body.visitor.token, message).then(message => {
                    // send seen
                    client.sendSeen(req.body.visitor.token)
                    // remove visitor file
                    visitor_file = client.instance.visitors_path + userid + '.json'
                    fs.unlinkSync(visitor_file)
                })
                // archive the chat
                console.log("fechando", req.body.visitor.token)

                function arquiva() {
                    client.archiveChat(req.body.visitor.token)
                }
                setTimeout(arquiva, 6000);
                // regular message, not closing
            } else {
                // attachments
                if (req.body.messages[0].attachments) {
                    console.log('SENDING ATTACHMENTS')
                    // send rocketchat legend as regular chat
                    if (req.body.messages[0].attachments[0].description != '') {
                        client.sendMessage(req.body.visitor.token, req.body.messages[0].attachments[0].description).then(message => {
                            // send seen
                            client.sendSeen(req.body.visitor.token)
                            // simulate typing
                            message.getChat().then(chat => {
                                console.log("simulate typing", chat)
                                chat.sendStateTyping()
                            })
                        })
                    }
                    // read rocketchat attachment
                    message = req.body.messages[0]
                    console.log('message', message)
                    console.log('file', message.file)
                    console.log('attachments', message.attachments)
                    console.log('fileUpload', message.fileUpload)
                    utils.getBase64(message.fileUpload.publicFilePath).then(b64 => {
                        mm = new MessageMedia(
                            message.fileUpload.type,
                            b64,
                            message.attachments[0].title
                        )
                        console.log("mediamessage", mm)
                        client.sendMessage(req.body.visitor.token, mm).then(
                            message => {
                                // send seen
                                client.sendSeen(req.body.visitor.token)
                                // simulate typing
                                message.getChat().then(chat => {
                                    console.log("simulate typing", chat)
                                    chat.sendStateTyping()
                                })
                            },
                            err => {
                                console.log('error while sending message media', err)
                            }
                        )
                    })

                } else {
                    client.sendMessage(req.body.visitor.token, message).then(message => {
                        // send seen
                        client.sendSeen(req.body.visitor.token)
                        // simulate typing
                        message.getChat().then(chat => {
                            console.log("simulate typing", chat)
                            chat.sendStateTyping()
                        })
                    })
                }
            }
        }
    }
    res.send("ok")

});


app.listen(global.config.port, () => {
    console.log("######")
    console.log("WAPI STARTED")
    console.log("######")
    console.log(`listening on port ${global.config.port}`);
    console.log(global.config);
    console.log("EXPOSING INSTANCES MEDIA")

    global.config.instances.map(instance => {
        app.use('/media/' + instance.name, express.static(instance.media_path));
    })
});

