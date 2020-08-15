const axios = require('axios')
const config = require('./config/config.json');

url_login = config.rocketchat.url + '/api/v1/login/'
url_info = config.rocketchat.url + '/api/info/'
url_settings = config.rocketchat.url + '/api/v1/settings/'
url_livechat_agent = config.rocketchat.url + '/api/v1/livechat/users/agent'

payload = {
    user: config.rocketchat.admin_user,
    password: config.rocketchat.admin_password
}


///
//SERVER INFO
///

console.log(config.rocketchat)

axios.get(
    url_info
).then(
    response => {
        console.log(response.data)
    },
    error => {
        console.log(error)
    }
)

axios.post(url_login, payload).then(
    (response) => {
        token = response.data.data.authToken
        userId = response.data.data.userId

        headers = {
            "X-Auth-Token": token,
            "X-User-Id": userId
        }
        let config_axios = {
            headers: headers
        }

        //
        // SETTINGS
        //

        settings = [
            ["Show_Setup_Wizard", "completed"],
            ["Log_Level", "2"],
            ["Livechat_enabled", true],
            ["Livechat_request_comment_when_closing_conversation", false]
        ]
        for (s in settings) {
            axios.post(
                url_settings + settings[s][0],
                { value: settings[s][1] },
                config_axios
            ).then(
                (res) => {
                    console.log(res.config.url, res.config.data)
                },
                (err) =>{
                    console.log(err.config.headers)
                }
            )
        }

        //
        // user as agent
        //
        console.log(config.rocketchat)
        axios.post(
            url_livechat_agent,
            { "username": config.rocketchat.admin_user },
            config_axios
        ).then(
            (res) => {
                console.log(res.config.url, res.config.data)
            }
        )


    },
    (error) => { console.log(error) },
)