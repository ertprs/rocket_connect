const { api } = require('@rocket.chat/sdk');

// const config = require('./config/config.json');

const config = require('./config/config.json');

url_login = config.rocketchat.url + '/api/v1/login/'
url_info = config.rocketchat.url + '/api/info/'
url_settings = config.rocketchat.url + '/api/v1/settings/'
url_livechat_agent = config.rocketchat.url + '/api/v1/livechat/users/agent'
url_create_direct_room = config.rocketchat.url + '/api/v1/im.create'

const HOST = config.rocketchat.url;
const USER = config.rocketchat.admin_user;
const PASS = config.rocketchat.admin_password;

api.url = HOST + '/api/v1/'
api.login(user = { "username": USER, "password": PASS }).then(
    ok => {
        api.post("im.create", { "username": "debug" }).then(
            ok => {
                api.post("chat.postMessage", { "roomId": ok.room.rid, "text": "aaaaaaaaaaaa" }).then(
                    ok => { console.log(ok) },
                    err => { console.log(err) },
                )
            }
        )
    }
)