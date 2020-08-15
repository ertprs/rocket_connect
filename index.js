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
const { instance } = require('@rocket.chat/sdk/dist/lib/methodCache');
const { client } = require('@rocket.chat/sdk/dist/lib/api');

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
        fs.writeFileSync(instance.qr_path, qr);
        qrcode.generate(qr, { small: true });
        url_online = "https://api.qrserver.com/v1/create-qr-code/?data=" + qr + '&size=800x800'
        global.rocket.sendDirectToUser("QR CODE FOR INSTANCE BELOW: " + this.instance.name, config.rocketchat.admin_user)
        global.rocket.sendDirectToUser(url_online, config.rocketchat.admin_user)
        // send to instance manager
        global.rocket.sendDirectToUser("QR CODE FOR INSTANCE BELOW: " + this.instance.name, instance.manager_user)
        global.rocket.sendDirectToUser(url_online, instance.manager_user)

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
        //this.resetState();
        fs.unlinkSync(this.instance.session_path)
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
            this.resetState();
        }
    });

    //
    // READ CHANGE EVENT
    //
    client.on('ready', function () {
        //app.rock.sendDirectToUser("WAPI READY!", config.rocketchat.manager_user)
        console.log("WAPI READY! for instance: ", instance.name)
        global.rocket.sendDirectToUser("WAPI READY! for instance: " + instance.name, instance.manager_user)
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
                    }
                }
            )
        }

        console.log(fs.existsSync(visitor_file))
        // no room, lets create a new one
        if (!fs.existsSync(visitor_file)) {
            console.log("visitor file not found")
            // get the contact info
            utils.register_visitor(msg, this)
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

    //global.client.sendMessage('553399059200@c.us', "teste")
    //global.client.sendMessage('553199851271@c.us', "teste")
    console.log('teste')
    global.wapi['instance1'].archiveChat('553199851271@c.us')
    res.send('ok')
    // global.rocket.post("im.create", { "username": "debug" }).then(
    //     ok => {
    //         global.rocket.post("chat.postMessage", { "roomId": ok.room.rid, "text": "teste" })
    //     }
    // )
})

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
            console.log("got client")
            console.log('instance:', client.instance.name)
            console.log('to:', req.body.visitor.token)
            console.log('content:', req.body.messages[0].msg)
            message = "*[" + req.body.agent.name + "]*\n" + req.body.messages[0].msg

            // lets close the chat
            if (req.body.messages[0].closingMessage == true) {
                // send last message
                if (client.instance.default_closing_message){
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

                function arquiva(){
                    client.archiveChat(req.body.visitor.token)
                }
                setTimeout(arquiva, 6000);



                // regular message, not closing
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
    res.send("ok")

});


app.listen(global.config.port, () => {
    console.log("######")
    console.log("WAPI STARTED")
    console.log("######")
    console.log(`listening on port ${global.config.port}`);
    console.log(global.config);
});

