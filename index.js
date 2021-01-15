var express = require('express');
var morgan = require('morgan')
var multer = require('multer');

var app = express();

const { driver, api } = require('@rocket.chat/sdk');


app.use(express.json());
var upload = multer({ dest: 'uploads/' })

const { Client, Location, MessageMedia, version } = require('whatsapp-web.js');

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

url_login = config.rocketchat.url + '/api/v1/login/'
url_room_upload = config.rocketchat.url + '/api/v1/rooms.upload/'

// set global configs
global.config = config
global.wapi = {}

//
// INITIALIZATION OF A INSTANCE
//
function initializeInstance(instance) {
    // define session
    let sessionCfg;
    if (fs.existsSync(instance.session_path)) {
        sessionCfg = require(instance.session_path);
    };
    // instantiate client
    const client = new Client({ puppeteerOptions: global.config.puppeteerOptions, session: sessionCfg, instance_name: instance.name });
    client.instance = instance;
    // handle it to global
    global.wapi[instance.name] = client
    //
    // QR CODE EVENT
    //
    client.on('qr', function (qr) {
        // Generate and scan this code with your phone
        console.log(this.instance.name, 'QR RECEIVED', qr);
        // write to temp file
        fs.writeFileSync(this.instance.qr_path, qr);
        //
        utils.send_qr(this.instance, qr, this)
        qrcode.generate(qr, { small: true });


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
    client.on('change_state', function (state) {
        console.log(state)
        if (state == "UNPAIRED") {
            // send to instance manager
            message = `${this.instance.name} (${this.instance.number}): UNPAIRED`
            utils.send_text_instance_managers(this.instance, message)

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
        plugged_text = plugged ? ":zap: Charging" : ":electric_plug: Not Charging"
        message = `${this.instance.name} (${this.instance.number}): :battery: Battery Level: ${battery}% - ${plugged_text}`
        utils.send_text_instance_managers(this.instance, message)
        // TODO: Alert rocketchat manager if battery hits certain threshold
    });


    //
    // READ CHANGE EVENT
    //
    client.on('ready', function () {
        this.getWWebVersion().then(v => {
            message = `${this.instance.name} (${this.instance.number}): WAPI READY! :rocket:  (NODE: ${process.version}, WWVERSION: ${v}, whatsapp.js: ${version})`
            utils.send_text_instance_managers(this.instance, message)
        })
    });


    //
    // NEW MESSAGE EVENT
    //
    client.on('message', function (msg) {
        console.log("NEW MESSAGE RECEIVED", msg)
        utils.handle_incoming_message(this, msg)
    });

    // GO!
    client.initialize()

}

//
// ROCKETCHAT API
//
function initializeRocketApi() {
    const HOST = config.rocketchat.url;
    const USER = config.rocketchat.bot_username;
    const PASS = config.rocketchat.bot_password;

    user = { username: USER, password: PASS }

    driver.connect({ host: HOST, useSsl: false })
    driver.login({ username: USER, password: PASS })
    global.rocket = driver
    // get rocketchat business hours
    utils.get_business_hours()
}

// INITIALIZE INSTANCES
global.config.instances.map(instance => {
    // initialize clientes, according to instances
    console.log("###### INITIALIZING CLIENT INSTANCE: " + instance.name)
    if (!fs.existsSync(instance.visitors_path)) {
        fs.mkdirSync(instance.visitors_path, { recursive: true });
    }

    if (!fs.existsSync(instance.media_path)) {
        fs.mkdirSync(instance.media_path, { recursive: true });
    }

    initializeInstance(instance)
})

// initialize rocketapi
initializeRocketApi()

//
// test stuff
//
app.get('/test', function (req, res) {
    const instance = global.config.instances[0];

    var client = global.wapi[instance.name]
    chats = client.getChats().then(chats =>{
        chats_unread = chats.filter( chat =>{
            if (chat.unreadCount != "0"){
                return chat.fetchMessages().then(messages =>{
                    messages.map(msg =>{
                        utils.handle_incoming_message(client, msg)
                        // contact = msg.getContact().then(contato =>{
                        //     console.log("m, ", msg)
                        //     console.log("c, ", contato)
                        //     console.log("###################")
                            
                        // })
                    })
                    
                })
            }
        })
        console.log(chats_unread)
        //res.status(200).send("ok " + chats)
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(chats_unread));
    })



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
app.post('/send/:instance/:number', upload.single('file'), function (req, res, next) {

    const instance = req.params.instance
    const message = req.body.message
    number = utils.normalize_cell_number(req.params.number)
    wapid = number + '@c.us'
    const client = global.wapi[instance]
    force_rocketchat = req.body.force || false
    if (client) {
        if (req.file != undefined) {
            // move to instance media path
            file_to_upload = client.instance.media_path + req.file.originalname
            fs.copyFileSync(req.file.path, file_to_upload,)
            fs.unlinkSync(req.file.path)
        } else {
            file_to_upload = null
        }

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
                wapid, message
            )

            // lets send a file
            if (req.file != undefined) {
                // upload to livechat room
                payload = {
                    user: global.config.rocketchat.admin_user,
                    password: global.config.rocketchat.admin_password
                }

                // 
                // login to send message with file
                // to rocketchat
                //
                axios.post(url_login, payload).then(response => {
                    token = response.data.data.authToken
                    userId = response.data.data.userId
                    var form = new FormData();
                    form.append('file', fs.createReadStream(file_to_upload));
                    headers = {
                        "X-Auth-Token": token,
                        "X-User-Id": userId,
                    }
                    headers['content-type'] = `multipart/form-data; boundary=${form._boundary}`
                    console.log('lets send to room')
                    form.append('msg', "MESSAGE SENT TO CUSTOMER: " + message);
                    axios({
                        method: 'post',
                        url: global.config.rocketchat.url + '/api/v1/rooms.upload/' + visitor.room._id,
                        data: form,
                        headers: headers
                    }).then(function (response) {
                        //handle success
                        console.log(response);
                    }).catch(function (response) {
                        //handle error
                        console.log(response);
                    });

                }, err => {
                    console.log("err logging in to send file to livechat")
                })
                console.log("has file!", req.file)
            } else {
                //
                // no file, only text
                //
                utils.send_rocket_text_message(
                    visitor,
                    "MESSAGE SENT TO CUSTOMER: " + message
                ).then(
                    ok => console.log(ok),
                    err => console.log(err),
                )
            }
        } else {
            console.log("sending direct", number, message)
            // visitor file not found, sending direct
            client.sendMessage(
                number + '@c.us', message
            )
            if (file_to_upload) {
                console.log("file sent!")
                console.log(req.file)
                const mm = MessageMedia.fromFilePath(file_to_upload);
                client.sendMessage(wapid, mm).then(
                    message => {
                        // send seen
                        client.sendSeen(wapid)
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
            }

        }
    } else {
        return res.status(404).send('Client Instance Not found')
    }
    res.send("ok")

})

//
// ROCKETCHAT WEBHOOK ENDPOINT
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
        return res.send("ok");
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
            visitor = req.body.visitor
            console.log("got client")
            console.log('instance:', client.instance.name)
            to = visitor.token.split('@')[0] + '@' + visitor.token.split('@')[1]
            console.log('to:', to)
            console.log('content:', message.msg)

            if (req.body.agent) {
                message_text = "*[" + req.body.agent.name + "]*\n" + message.msg
            } else {
                message_text = message.msg
            }

            console.log("attachments", message.attachments)
            console.log("fileUploads", message.fileUpload)
            // lets close the chat
            if (message.closingMessage == true) {
                // send last message
                // if we have a custom one, use it
                if (client.instance.default_closing_message) {
                    if (req.body.agent) {
                        message_text = "*[" + req.body.agent.name + "]*\n" + client.instance.default_closing_message
                    } else {
                        message_text = client.instance.default_closing_message
                    }
                }

                client.sendMessage(to, message_text).then(message => {
                    // send seen
                    client.sendSeen(to)
                    // remove visitor file
                    visitor_file = client.instance.visitors_path + userid + '.json'
                    fs.unlinkSync(visitor_file)
                })
                // archive the chat
                console.log("fechando", to)

                function arquiva() {
                    client.archiveChat(to)
                }
                setTimeout(arquiva, 6000);
                // regular message, not closing
            } else {

                // WITH ATTACHMENTS
                //
                if (message.attachments) {
                    console.log('SENDING ATTACHMENTS')

                    // send rocketchat legend as regular chat
                    if (message.attachments[0].description != '') {
                        client.sendMessage(to, message.attachments[0].description).then(m => {
                            // send seen
                            client.sendSeen(visitor.token)
                            // simulate typing
                            m.getChat().then(chat => {
                                console.log("simulate typing", chat)
                                chat.sendStateTyping()
                            })
                        })
                    }
                    // read rocketchat attachment
                    console.log('message', message)
                    utils.getBase64(message.fileUpload.publicFilePath).then(b64 => {
                        mm = new MessageMedia(
                            message.fileUpload.type,
                            b64,
                            message.attachments[0].title
                        )
                        console.log("mediamessage", mm)
                        client.sendMessage(to, mm).then(
                            message => {
                                // send seen
                                client.sendSeen(to)
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

                }
                // NO ATTACHMENTS
                else {
                    // NO ATACHMENTS
                    console.log("simple message")
                    client.sendMessage(to, message_text).then(m => {
                        // send seen
                        client.sendSeen(to)
                        // simulate typing
                        m.getChat().then(chat => {
                            console.log("simulate typing", chat)
                            chat.sendStateTyping()
                        })
                    })
                }
            }
        }
    }
    return res.send("ok")

});


app.listen(global.config.port, () => {
    console.log("######")
    console.log("WAPI STARTED")
    console.log("######")
    console.log(`listening on port ${global.config.port}`);
    console.log(`global config`, global.config);
});

