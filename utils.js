const axios = require('axios')
const fs = require('fs');
var slugify = require('slugify')
const FormData = require('form-data');

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
                        if (msg.type == "ptt"){
                            console.log('ppt')
                            filename = random_filename + '.' + 'ogg'
                        }else{
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
        contact = msg.getContact().then(c => {
            console.log("got contact infos, registering the visitor")
            // register the visitor
            register_visitor = {
                "visitor": {
                    "name": c['pushname'],
                    "token": msg.from,
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
            visitor_file = instance.visitors_path + userid + '.json'
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
      }
}