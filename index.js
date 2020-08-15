var express = require('express');
var app = express();

const { driver } = require('@rocket.chat/sdk');

app.use(express.json());

const { Client, Location } = require('whatsapp-web.js');

var utils = require('./utils');

const fs = require('fs');
const axios = require('axios')
const qrcode = require('qrcode-terminal');
const qrcodejs = require('qrcodejs')

const config = require('./config/config.json');

// set global configs
global.config = config

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
        url_online = "https://api.qrserver.com/v1/create-qr-code/?data=" + qr + '&size=800x800'
        global.rocket.sendDirectToUser(url_online, config.rocketchat.admin_user)
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
        global.client.resetState();
        fs.unlinkSync(instance.session_path)
    });

    //
    // STATE CHANGE EVENT
    //
    // TODO: alert changed events to rocket admin
    // alert battery
    // alert others
    global.client.on('change_state', state => {
        console.log(state)
        if (state == "UNPAIRED"){
            global.client.resetState();
        }
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
        // 5531123456.json for the file
        userid = msg.from.split("@")[0]
        visitor_file = global.config.instance.visitors_path + userid + '.json'
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
                        utils.register_visitor(msg)
                    }
                }
            )
        }

        console.log(fs.existsSync(visitor_file))
        // no room, lets create a new one
        if (!fs.existsSync(visitor_file)) {
            console.log("visitor file not found")
            // get the contact info
            utils.register_visitor(msg)
        }
        // if no room, register guest and user id as token
        // create a new room

    });

    // GO!
    global.client.initialize()

}

function initializeRocketApi() {
    const HOST = config.rocketchat.url;
    const USER = config.rocketchat.admin_user;
    const PASS = config.rocketchat.admin_password;

    user = {username: USER, password: PASS}

    driver.connect( { host: HOST, useSsl: false})
    driver.login({username: USER, password: PASS})
    global.rocket = driver
}

initializeInstance(global.config.instance)
initializeRocketApi()

// test stuff
app.get('/test', function (req, res) {
    //global.client.sendMessage('553399059200@c.us', "teste")
    //global.client.sendMessage('553199851271@c.us', "teste")
    console.log('teste')
    res.send('ok')
    global.rocket.post("im.create", {"username": "debug"}).then(
        ok =>{
            global.rocket.post("chat.postMessage", {"roomId": ok.room.rid, "text": "teste"})
        }
    )
})

app.post('/rocketchat', function (req, res) {

    //
    console.log("rocketchat webhook", req.body)

    if (req.headers['x-rocketchat-livechat-token'] != config.rocketchat.secret_token) {
        return res.status(404).send('Not found')
    }
    // button test
    if (req.body._id == "fasd6f5a4sd6f8a4sdf") {
        res.send("ok");
    }

    // mensagem
    if (req.body.type == "Message") {
        console.log("Receiving Message from Rocketchat")
        // only allow if the visitor is found
        // at the visitor folder
        userid = req.body.visitor.token.split("@")[0]
        visitor_file = global.config.instance.visitors_path + userid + '.json'
        if (fs.existsSync(visitor_file)) {
            console.log('to:', req.body.visitor.token)
            console.log('content:', req.body.messages[0].msg)
            message = "*[" + req.body.agent.name + "]*\n" + req.body.messages[0].msg
            global.client.sendMessage(req.body.visitor.token, message)
            global.client.sendSeen(req.body.visitor.token)
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
    // initialize clientes, according to instances
    console.log("###### INITIALIZING CLIENT INSTANCE")
    console.log(global.config.instance)
    console.log("######")
    instance = global.config.instance
    if (!fs.existsSync(global.config.instance.visitors_path)) {
        fs.mkdirSync(global.config.instance.visitors_path, { recursive: true });
    }

});

