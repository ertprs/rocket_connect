const axios = require('axios')
const fs = require('fs');
var slugify = require('slugify')
var QRCode = require('qrcode')
const FormData = require('form-data');
const config = require('./config/config.json');

url_login = config.rocketchat.url + '/api/v1/login/'
url_logout = config.rocketchat.url + '/api/v1/logout/'
url_im_create = config.rocketchat.url + '/api/v1/im.create'
url_chat_post = config.rocketchat.url + '/api/v1/chat.postMessage'
url_business_hours = config.rocketchat.url + '/api/v1/livechat/office-hours'

module.exports = {

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
        let zap_message = msg
        userid = msg.from.split("@")[0]
        visitor = {
            userid: userid
        }
        contact = msg.getContact().then(c => {
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
                                this.alert_closed(client.instance, msg)
                            }
                        )
                    },

                    (error) => {
                        console.log(error);
                    });

            }, (error) => {
                console.log(error);
            });
        })

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
                    client = global.wapi[visitor.instance.name]
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
                form.append('msg', `QR CODE FOR INSTANCE ${instance.name} (${instance.number})`);
                form.append('description', 'USE THE WHATSAPP TO SCAN THIS QR CODE');
                form.append('alias', 'WAPI');
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

                axios.post(
                    url_im_create,
                    { usernames: usernames },
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

                axios.post(
                    url_im_create,
                    { usernames: usernames },
                    config_axios
                ).then(
                    room => {
                        axios.post(
                            url_chat_post,
                            {
                                roomId: room['data']['room']['rid'],
                                text: text,
                                alias: "WAPI"
                            },
                            config_axios
                        ).then(
                            send => {
                                console.log(send)
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

    alert_closed(instance, msg) {
        console.log("##############")
        console.log("checking if closed")
        console.log("instance", instance)
        console.log("msg", msg)
        // get today int day
        today = new Date();

        payload = {
            user: global.config.rocketchat.admin_user,
            password: global.config.rocketchat.admin_password
        }

        axios.post(url_login, payload).then(response => {
            token = response.data.data.authToken
            userId = response.data.data.userId

            var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let now = new Date()
            var dayName = days[now.getDay()];

            console.log("LOGADO!")
            headers = {
                "X-Auth-Token": token,
                "X-User-Id": userId,
            }
            let config_axios = {
                headers: headers
            }
            axios.get(
                url_business_hours,
                { params:{}, headers: headers }
            ).then(
                hours => {
                    let day = hours.data.officeHours.filter((day) =>{
                        if(day.day == dayName){
                            console.log("day",day)
                            time_start = new Date(2020, 08, 20, day.start.time.split(":")[0], day.start.time.split(":")[1]);
                            time_end = new Date(2020, 08, 20, day.finish.time.split(":")[0], day.finish.time.split(":")[1]);
                            now = new Date()
                            time_now = new Date(2020, 08, 20, now.getHours(), now.getMinutes());
                            console.log("day_name", dayName)
                            console.log("time_start", time_start)
                            console.log("time_end", time_end)
                            console.log("time_now", time_now)
                            opened = time_start < time_now && time_now < time_end
                            console.log(opened)
                            // its closed
                            if(opened == false || day.open == false){
                                console.log('its closed, send message')
                                if(instance.use_rocketchat_business_hours){
                                    // send the custom business closed message
                                    message = instance.custom_closed_message
                                    // reply custom business closed message
                                    // to the whatsapp
                                    console.log(msg)
                                    msg.reply(message)
                                    // register this answer at livechat
                                    this.send_rocket_text_message(
                                        visitor,
                                        "SENT TO CUSOTMER: " +  message
                                    ).then(
                                        ok => console.log('closed message sent', ok),
                                        err => console.log('closed message error while sending', err)
                                    )
                                }
                            }

                        }
                    })
                    
                },
                nohours => {
                    console.log(nohours)
                }
            )

        })


        // get rocket business hours
        // check if we are open
        // if open, do nothing
        // if closed, send custom message
    }

}