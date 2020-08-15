const axios = require('axios')
const fs = require('fs');

module.exports = {

    send_rocket_message: function (visitor, msg) {
        // send a message to roketchat
        if (msg.mediaKey) {
            // media files
            // create user media path
            user_media_path = global.config.instance.media_path + "/" + visitor.userid + "/"
            if (!fs.existsSync(user_media_path)) {
                fs.mkdirSync(user_media_path, { recursive: true });
            }
            msg.downloadMedia().then(
                (media) => {
                    var base64Data = media.data;
                    destination = user_media_path + media.filename
                    require("fs").writeFile(destination, base64Data, 'base64', function (err) {
                        console.log(err);
                    });
                },
                (error) => {
                    console.log(error)
                }
            )
        } else {

        }
        url = global.config.rocketchat.url + '/api/v1/livechat/message'
        payload = {
            "token": visitor.visitor.token,
            "rid": visitor.room._id,
            "msg": msg.body
        }
        return axios.post(
            url,
            payload,
        )
    },

    register_visitor: function (msg) {
        contact = msg.getContact().then(c => {
            console.log("got contact infos, registering the visitor")
            // register the visitor
            register_visitor = {
                "visitor": {
                    "name": c['pushname'],
                    "token": msg.from,
                    "phone": msg.from,
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
                                global.client.sendSeen(visitor.visitor.token)
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

    }



}