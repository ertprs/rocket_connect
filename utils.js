const axios = require('axios')
const fs = require('fs');
var slugify = require('slugify')
var QRCode = require('qrcode')
const FormData = require('form-data');
const config = require('./config/config.json');

const { version } = require('whatsapp-web.js');
var Moment = require('moment-timezone');

url_login = config.rocketchat.url + '/api/v1/login/'
url_logout = config.rocketchat.url + '/api/v1/logout/'
url_im_create = config.rocketchat.url + '/api/v1/im.create'
url_chat_post = config.rocketchat.url + '/api/v1/chat.postMessage'
url_business_hours = config.rocketchat.url + '/api/v1/livechat/office-hours'
url_offline_message = config.rocketchat.url + '/api/v1/livechat/offline.message'

module.exports = {

    moment: function(instance){
        if (!instance.language){
            instance.laguage = "pt-BR"
        }
        if (!instance.timezone){
            instance.timezone = "America/Sao_Paulo"
        }
        return new Moment().tz(instance.timezone);
    },

    send_rocket_text_message: function (visitor, text) {
        url = global.config.rocketchat.url + '/api/v1/livechat/message'
        payload = {
            "token": visitor.visitor.token,
            "rid": visitor.room._id,
            "msg": text
        }
        return axios.post(
            url,
            payload,
        )


    },

    send_rocket_message: function (visitor, msg) {
        // send a message to roketchat
        if (msg.mediaKey) {
            console.log("message", msg)
            // media files
            // create user media path
            user_media_path = visitor.instance.media_path + visitor.userid + "/"
            console.log("saving to ", user_media_path)
            if (!fs.existsSync(user_media_path)) {
                fs.mkdirSync(user_media_path, { recursive: true });
            }
            msg.downloadMedia().then(
                (media) => {
                    console.log("media", media)
                    console.log("media.filename string?", typeof (media.filename) == 'string')
                    var base64Data = media.data;
                    // only documents comes with filename
                    if (typeof (media.filename) == 'string') {
                        filename = slugify(media.filename)
                    } else {
                        // push to talk, always ogg
                        random_filename = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
                        if (msg.type == "ptt") {
                            console.log('ppt')
                            filename = random_filename + '.' + 'ogg'
                        } else {
                            filename = random_filename + '.' + media.mimetype.split('/')[1]
                        }
                    }
                    console.log("filename defined", filename)
                    destination = user_media_path + filename
                    require("fs").writeFile(destination, base64Data, 'base64', function (err) {
                        console.log(err);
                    });
                    // send link to user
                    // url = visitor.instance.media_url  + visitor.visitor.phone[0].phoneNumber + '/' + filename
                    // console.log(url)
                    // this.send_rocket_text_message(
                    //     visitor,
                    //     url
                    // )
                    file_path = destination
                    var form = new FormData();
                    form.append('file', fs.createReadStream(file_path));
                    axios({
                        method: 'post',
                        url: global.config.rocketchat.url + '/api/v1/livechat/upload/' + visitor.room._id,
                        data: form,
                        headers: {
                            'content-type': `multipart/form-data; boundary=${form._boundary}`,
                            'x-visitor-token': visitor.visitor.token
                        }
                    }).then(function (response) {
                        //handle success
                        console.log(response);
                    }).catch(function (response) {
                        //handle error
                        console.log(response);
                    });

                },
                (error) => {
                    console.log(error)
                }
            )
        } else {

        }
        // if there is a message to send
        if (msg.body) {
            url = global.config.rocketchat.url + '/api/v1/livechat/message'
            payload = {
                "token": visitor.visitor.token,
                "rid": visitor.room._id,
                "msg": msg.body,
                "_id": msg.id._serialized
            }
            return axios.post(
                url,
                payload,
            )
        } else {
            return new Promise()
        }
    },

    register_visitor: function (msg, client) {
        console.log("registering visitor...")
        let zap_message = msg
        userid = msg.from.split("@")[0]
        visitor = {
            userid: userid
        }
        console.log('vvvv', visitor)
        contact = zap_message.getContact().then(
            c => {
                console.log("got contact infos, registering the visitor")
                // register the visitor
                register_visitor = {
                    "visitor": {
                        "name": c['pushname'],
                        "token": msg.from + '@' + msg.to,
                        "phone": msg.from.split('@')[0],
                        "department": client.instance.department,
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
                url = global.config.rocketchat.url + '/api/v1/livechat/visitor/'
                axios.post(
                    url, register_visitor
                ).then((response) => {
                    console.log("visitor registered")
                    visitor.visitor = response.data.visitor;
                    // get a room
                    console.log("getting a room to the visitor")
                    url = global.config.rocketchat.url + '/api/v1/livechat/room/?token=' + visitor.visitor.token
                    axios.get(
                        url
                    ).then(

                        (response) => {
                            visitor.room = response.data.room;
                            visitor.instance = client.instance
                            console.log("GOT ROOM ", visitor.room)
                            // save the visitor info
                            console.log("REGISTERING VISITOR FILE ", visitor_file)
                            fs.writeFile(visitor_file, JSON.stringify(visitor), function (err) {
                                if (err) {
                                    console.error(err);
                                }
                            });
                            // send file message to the room
                            console.log("send message to livechat room")
                            this.send_rocket_message(visitor, msg).then(
                                (res) => {
                                    client.sendSeen(visitor.visitor.token)
                                    // alert if closed
                                    this.alert_closed(client.instance, msg, visitor)
                                }
                            )
                            console.log("GOING TO INITIAL MESSAGE: ", client.instance.custom_initial_message)

                            //console.log("sending custom initial message: " + client.instance.custom_initial_message)
                            if (client.instance.custom_initial_message) {
                                // send initial if closed?
                                if (
                                    (!this.check_instance_open(client.instance) && client.instance.say_initial_when_closed)
                                    ||
                                    this.check_instance_open(client.instance)

                                ) {
                                    msg.reply(client.instance.custom_initial_message)
                                    // send to livechat
                                    this.send_rocket_text_message(
                                        visitor,
                                        "*SENT TO CUSTOMER*: " + client.instance.custom_initial_message
                                    ).then(
                                        ok => console.log('initial message sent', ok),
                                        err => console.log('initial message error while sending', err)
                                    )
                                }


                            }

                        },

                        (error) => {
                            console.log("DID NOT GET THE ROOM. ERROR: ", error)

                            if (error.response.data.error == "no-agent-online") {
                                console.log("SEND OFFLINE MESSAGE BACK")
                            } else {
                                console.log("SEND CUSTOM INITIAL MESSAGE")
                            }

                            // sending offline message 
                            payload = {
                                "name": c['pushname'],
                                "email": userid + "@whatsapp.com",
                                "message": msg.body,
                                "department": "yBCf6zFajf739RnEx"
                            }
                            axios.post(url_offline_message, payload).then(
                                response => {
                                    console.log('response', response)
                                },
                                error => {
                                    console.log('error', error)
                                }
                            )
                        });

                }, (error) => {
                    console.log("CANNOT REGISTER USER")
                    console.log(error);
                });
            },
            noc => {
                console.log('did not get contact infos')
            }
        )
        console.log("DID NOT GET")
    },

    get_client: function (userid, visitor_id) {
        // this function will discover what client
        // we should use based on the userid and visitor_id
        let client = null
        global.config.instances.map(instance => {
            console.log("getting client, looking instance " + instance)
            visitor_file = instance.visitors_path + userid + '.json'
            console.log('visitor_file', visitor_file)
            // we got a match for the file
            if (fs.existsSync(visitor_file)) {
                visitor = require(visitor_file)
                // we got also a match for the visitor id
                if (visitor.visitor._id == visitor_id) {
                    client = global.rocket_connect[visitor.instance.name]
                }
            }
        })
        return client
    },

    normalize_cell_number: function (number) {
        // replace ex 5533999XXXX to 553399XXXX
        if (number.length == 13) {
            number = number.slice(0, 4) + number.slice(5);
            return number
        }
        return number
    },

    getBase64: function (url) {
        return axios
            .get(url, {
                responseType: 'arraybuffer'
            })
            .then(response => Buffer.from(response.data, 'binary').toString('base64'))
    },

    send_qr: function (instance, qr) {
        QRCode.toFile(instance.qr_png_path, qr).then(ok => { console.log(ok) })

        global.rocket_connect[instance.name].getWWebVersion().then(v => {
            message_version = `(NODE: ${process.version}, WWVERSION: ${v}, whatsapp.js: ${version}) Current Time: ${this.moment(instance)}, Current Timezone: ${instance.timezone}`

            payload = {
                user: global.config.rocketchat.bot_username,
                password: global.config.rocketchat.bot_password
            }
            axios.post(url_login, payload).then(

                (response) => {
                    token = response.data.data.authToken
                    userId = response.data.data.userId
                    console.log("LOGADO!")

                    var form = new FormData();
                    form.append('file', fs.createReadStream(instance.qr_png_path));
                    form.append('msg', `QR CODE FOR INSTANCE ${instance.name} (${instance.number}) - ${message_version}`);
                    form.append('description', 'USE THE WHATSAPP TO SCAN THIS QR CODE');
                    form.append('alias', 'ROCKET CONNECT');
                    headers = {
                        "X-Auth-Token": token,
                        "X-User-Id": userId,
                    }
                    console.log('headers', headers)
                    let config_axios = {
                        headers: headers
                    }
                    usernames = global.config.rocketchat.manager_user.concat(
                        instance.manager_user
                    ).join()
    
                    unique = [...new Set(usernames.split(','))].join(); //get unique

                    axios.post(
                        url_im_create,
                        { usernames: unique },
                        config_axios
                    ).then(room => {
                        config_axios['headers']['content-type'] = `multipart/form-data; boundary=${form._boundary}`
                        axios({
                            method: 'post',
                            url: global.config.rocketchat.url + '/api/v1/rooms.upload/' + room['data']['room']['rid'],
                            data: form,
                            headers: headers,
                        }).then(function (response) {
                            //handle success
                            console.log("qr sent")
                            axios.post(
                                url_logout,
                                '',
                                config_axios
                            ).then(
                                ok => console.log('logout done')
                            )
                        }).catch(function (response) {
                            //handle error
                        });
                    },
                        err => {
                            console.log('err', err)
                        })

                }
            )
        })


    },

    send_text_instance_managers: function (instance, text) {

        payload = {
            user: global.config.rocketchat.bot_username,
            password: global.config.rocketchat.bot_password
        }

        axios.post(url_login, payload).then(
            login => {
                token = login.data.data.authToken
                userId = login.data.data.userId
                headers = {
                    "X-Auth-Token": token,
                    "X-User-Id": userId,
                }
                let config_axios = {
                    headers: headers
                }
                usernames = global.config.rocketchat.manager_user.concat(
                    instance.manager_user
                ).join()

                unique = [...new Set(usernames.split(','))].join(); //get unique

                axios.post(
                    url_im_create,
                    { usernames: unique },
                    config_axios
                ).then(
                    room => {
                        axios.post(
                            url_chat_post,
                            {
                                roomId: room['data']['room']['rid'],
                                text: text,
                                alias: "ROCKET CONNECT"
                            },
                            config_axios
                        ).then(
                            send => {
                                console.log("SENT TO MANAGERS: ", text)
                            }
                        )
                    }
                )

            },
            nologin => {
                console.log('nologin', nologin)
            }

        )
    },

    check_instance_open: function (instance) {
        now = this.moment(instance)
        var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        var dayName = days[now.get("Day")];
        opened = true // default behaviour
        if (instance.use_rocketchat_business_hours) {
            // get rocketchat days
            // check if return opened or closed
            let days = global.rocketchat_business_hours.officeHours.filter((day) => {
                if (day.day == dayName) {
                    return day
                }
            });
            var day = days[0]
            console.log("Got day from rocketchat: ", day)
            var opened = false;
            // if its opened for the day
            // check the hours
            if (day.open) {
                console.log("day", day)
                time_start = new Date(2020, 08, 20, day.start.time.split(":")[0], day.start.time.split(":")[1]);
                time_end = new Date(2020, 08, 20, day.finish.time.split(":")[0], day.finish.time.split(":")[1]);
                time_now = new Date(2020, 08, 20, now.get("Hours"), now.get("Minutes"));
                console.log("day_name", dayName)
                console.log("time_start", time_start)
                console.log("time_end", time_end)
                console.log("time_now", time_now)
                var opened = time_start < time_now && time_now < time_end
                console.log(opened)
            } else {
                var opened = false
            }
            console.log("instance opened according to rocketchat: ", opened)


        } else if (instance.use_custom_business_hours) {
            console.log("using custom business hours")
            // get from config
            // get day dict or default
            var day_config = instance.custom_business_hours.filter((day) => {
                if (day.day == dayName) {
                    return day;
                }
            });
            console.log("pelo nome", day_config)

            var day_config_default = instance.custom_business_hours.filter((day) => {
                if (day.day == "default") {
                    return day;
                }
            });
            console.log("pelo default", day_config_default)

            if (day_config.length) {
                day = day_config[0]
                console.log("day config usado nome", day)
            } else {
                day = day_config_default[0]
                console.log("day config usado (default)", day_config_default)
            }
            opened = false;
            // if its opened for the day
            // check the hours
            if (day.open) {
                time_start = new Date(2020, 08, 20, day.start.time.split(":")[0], day.start.time.split(":")[1]);
                time_end = new Date(2020, 08, 20, day.finish.time.split(":")[0], day.finish.time.split(":")[1]);
                time_now = new Date(2020, 08, 20, now.get("Hours"), now.get("Minutes"));
                console.log("day_name", dayName)
                console.log("time_start", time_start)
                console.log("time_end", time_end)
                console.log("time_now", time_now)
                opened = time_start < time_now && time_now < time_end
            } else {
                console.log("day.open false")
                opened = false
            }
        }
        // no options
        console.log(`INSTANCE ${instance.name} opened: ${opened}`)
        return opened


    },

    alert_closed(instance, msg, visitor) {
        console.log("##############")
        console.log("checking if closed")
        console.log("instance", instance)
        console.log("msg", msg)
        // get today int day
        today = new Date();
        // its closed, alerting
        if (!this.check_instance_open(instance)) {
            if (instance.custom_closed_message) {

                message = instance.custom_closed_message
                msg.reply(message)

                this.send_rocket_text_message(
                    visitor,
                    "*SENT TO CUSTOMER*: " + message
                ).then(
                    ok => console.log('closed message sent', ok),
                    err => console.log('closed message error while sending', err)
                )

            }

        }
    },

    get_business_hours: function () {
        // get rocketchat business hours
        payload = {
            user: global.config.rocketchat.admin_user,
            password: global.config.rocketchat.admin_password
        }
        axios.post(url_login, payload).then(response => {
            token = response.data.data.authToken
            userId = response.data.data.userId
            // got token,
            headers = {
                "X-Auth-Token": token,
                "X-User-Id": userId,
            }
            axios.get(
                url_business_hours,
                { params: {}, headers: headers }
            ).then(hours => {
                global.rocketchat_business_hours = hours.data
                console.log(`rocketchat business hours`, global.global.rocketchat_business_hours);
            })
        })
        // and store at global config
    },

    handle_incoming_message: function (client, msg) {
        console.log(client)
        console.log("HANDLING MESSAGE, ", msg)
        // get user id
        // 5531123456.json for the file
        userid = msg.from.split("@")[0]
        console.log("userid", userid)
        //avoid reacting to status@
        if (msg.from == 'status@broadcast') {
            console.log("STATUS MESSAGE, IGNORING")
            return False
        }
        visitor_file = client.instance.visitors_path + userid + '.json'
        //

        console.log("VISITOR FILE, ", fs.existsSync(visitor_file))
        // check if there is a room already
        if (fs.existsSync(visitor_file)) {
            visitor = require(visitor_file);
            this.send_rocket_message(visitor, msg).then(
                (res) => {
                    console.log(res.data)
                },
                (err) => {
                    if (err.response.data.error == "room-closed") {
                        // room is closed, remove the file, so it can be opened again
                        fs.unlinkSync(visitor_file)
                        this.register_visitor(msg, client)
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
            this.register_visitor(msg, client);
            visitor = require(visitor_file);
            //
            this.send_rocket_message(visitor, msg).then(
                ok => {
                    console.log("room was closed, but we reopened and sent")
                    // if closed, alert the client now, only once
                },
                erro => {
                    console.log("Could not send the message")
                }
            )

        }

    }


}